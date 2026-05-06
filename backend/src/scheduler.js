const cron = require('node-cron');
const pool = require('./config/db');
const { syncClient } = require('./routes/powens');

async function executeAutomationTrigger(declencheur, clientId) {
  try {
    const [automations] = await pool.query(
      `SELECT * FROM automations WHERE declencheur = ? AND actif = 1`,
      [declencheur]
    );
    for (const auto of automations) {
      let actions = auto.actions_json;
      if (typeof actions === 'string') {
        try { actions = JSON.parse(actions); } catch { actions = []; }
      }
      if (!Array.isArray(actions)) actions = [];

      for (const action of actions) {
        if (action.type === 'create_task') {
          const [[expert]] = await pool.query(
            `SELECT id FROM utilisateurs WHERE role = 'expert' AND actif = 1 LIMIT 1`
          ).catch(() => [[null]]);
          const assigneeId = action.utilisateur_id || expert?.id || null;
          const echeance = new Date();
          echeance.setDate(echeance.getDate() + 7);
          await pool.query(
            `INSERT INTO taches (client_id, utilisateur_id, description, duree, date_echeance, priorite, statut, source)
             VALUES (?, ?, ?, 1, ?, ?, 'a_faire', 'automation')`,
            [clientId || null, assigneeId,
             action.description || `Tâche automatique : ${auto.nom}`,
             echeance.toISOString().slice(0, 10),
             action.priorite || 'normale']
          );
        }
      }

      await pool.query(
        `UPDATE automations SET exec_count = COALESCE(exec_count, 0) + 1, derniere_exec = NOW() WHERE id = ?`,
        [auto.id]
      );

      await pool.query(
        `INSERT INTO automation_logs (ruleId, evenement, entityType, entityId, statut, message)
         VALUES (?, ?, 'client', ?, 'success', ?)`,
        [auto.id, declencheur, clientId || null, `Exécuté par scheduler cron`]
      ).catch(() => {});
    }
  } catch (e) {
    console.error(`[scheduler] executeAutomationTrigger(${declencheur}) error:`, e.message);
  }
}

function startScheduler() {
  // Daily at 08:00 — check overdue tasks (tache_retard)
  cron.schedule('0 8 * * *', async () => {
    console.log('[scheduler] Running tache_retard check');
    try {
      const [rows] = await pool.query(
        `SELECT DISTINCT client_id FROM taches
         WHERE date_echeance < CURDATE()
           AND statut NOT IN ('termine', 'annule')
           AND client_id IS NOT NULL`
      );
      for (const r of rows) {
        await executeAutomationTrigger('tache_retard', r.client_id);
      }
      console.log(`[scheduler] tache_retard: ${rows.length} client(s) traité(s)`);
    } catch (e) {
      console.error('[scheduler] tache_retard error:', e.message);
    }
  });

  // Daily at 08:05 — check unpaid invoices 30+ days (facture_impayee_30j)
  cron.schedule('5 8 * * *', async () => {
    console.log('[scheduler] Running facture_impayee_30j check');
    try {
      const [rows] = await pool.query(
        `SELECT DISTINCT client_id FROM factures
         WHERE statut NOT IN ('payee', 'annulee')
           AND dateEcheance < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           AND client_id IS NOT NULL`
      );
      for (const r of rows) {
        await executeAutomationTrigger('facture_impayee_30j', r.client_id);
      }
      console.log(`[scheduler] facture_impayee_30j: ${rows.length} client(s) traité(s)`);
    } catch (e) {
      console.error('[scheduler] facture_impayee_30j error:', e.message);
    }
  });

  // Daily at 02:00 — auto-freeze time entries older than 7 days
  cron.schedule('0 2 * * *', async () => {
    console.log('[scheduler] Running figeage tache_temps');
    try {
      const [result] = await pool.query(
        `UPDATE tache_temps SET statut='figee', updated_at=NOW()
         WHERE statut='brouillon' AND date_travail < DATE_SUB(CURDATE(), INTERVAL 7 DAY)`
      );
      const count = result.affectedRows || 0;
      if (count > 0) {
        await pool.query(
          `INSERT INTO audit_log (utilisateur_id, action, table_cible, details, created_at)
           VALUES (NULL, 'auto_figeage', 'tache_temps', ?, NOW())`,
          [JSON.stringify({ count })]
        ).catch(() => {});
      }
      console.log(`[scheduler] figeage: ${count} saisie(s) figée(s)`);
    } catch (e) {
      console.error('[scheduler] figeage error:', e.message);
    }
  });

  // Daily at 03:30 — sync all active Powens bank connections
  cron.schedule('30 3 * * *', async () => {
    console.log('[scheduler] Running Powens bank sync');
    try {
      const [connexions] = await pool.query(
        `SELECT * FROM powens_connexions WHERE statut IN ('actif','en_attente') AND access_token IS NOT NULL`
      );
      let totalInserted = 0;
      for (const conn of connexions) {
        try {
          const { inserted } = await syncClient(conn);
          totalInserted += inserted;
        } catch (e) {
          console.error(`[scheduler] powens sync client ${conn.client_id}:`, e.message);
        }
      }
      console.log(`[scheduler] Powens sync: ${connexions.length} connexion(s), ${totalInserted} mouvement(s) importé(s)`);
    } catch (e) {
      console.error('[scheduler] Powens sync error:', e.message);
    }
  });

  console.log('[scheduler] Démarré — tache_retard @ 08:00, facture_impayee_30j @ 08:05, figeage_temps @ 02:00, powens_sync @ 03:30');
}

module.exports = { startScheduler };
