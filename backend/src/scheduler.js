const cron = require('node-cron');
const pool = require('./config/db');
const { syncClient } = require('./routes/powens');
const { genererFacturesDepuisLDM } = require('./utils/facturation');
const { injecterTachesLDM } = require('./routes/lettres');
const ldmService = require('./services/ldmService');
const { checkAndSendRelances: checkMicroRelances } = require('./routes/micro_relances');
const { genererPeriodes } = require('./production/generer-periodes');

// Réutilise la même logique d'activation que le webhook
async function activerMissionSiComplete(ldmId) {
  const [[ldm]] = await pool.query(
    `SELECT id, numero, statut, collaborateur_id, chef_mission_id
     FROM lettres_mission WHERE id = ? AND yousign_status = 'done' AND statut = 'envoyee'`,
    [ldmId]
  );
  if (!ldm) return;

  const [mandatsYousign] = await pool.query(
    `SELECT signe FROM mandats WHERE ldm_id = ? AND yousign_request_id IS NOT NULL`,
    [ldmId]
  );
  const tousSignes = mandatsYousign.length === 0 || mandatsYousign.every(m => m.signe === 1);
  if (!tousSignes) {
    console.log(`[scheduler] LDM ${ldm.numero} : en attente des mandats (${mandatsYousign.filter(m => !m.signe).length} restant(s))`);
    return;
  }

  let tachesCreees = 0, facturesCreees = 0;
  try {
    await ldmService.transitionner(ldmId, 'signer', 'expert', null, 'Yousign polling – tous documents signés', { skipUrlCheck: true });
  } catch (e) {
    console.error(`[scheduler] LDM ${ldm.numero} transition:`, e.message);
  }
  try {
    tachesCreees = await injecterTachesLDM(ldmId, ldm.collaborateur_id || null, ldm.chef_mission_id || null, null);
  } catch (e) {
    console.error(`[scheduler] injecterTaches LDM ${ldm.numero}:`, e.message);
  }
  try {
    const result = await genererFacturesDepuisLDM(ldmId);
    facturesCreees = result?.factureIds?.length || 0;
  } catch (e) {
    console.error(`[scheduler] genererFactures LDM ${ldm.numero}:`, e.message);
  }

  const [experts] = await pool.query(
    `SELECT id FROM utilisateurs WHERE role IN ('expert','chef_mission') AND actif = 1`
  ).catch(() => [[]]);
  for (const u of experts) {
    await pool.query(
      `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue) VALUES (?,?,?,?,?,0)`,
      [u.id, 'ldm_signee', `LDM signée : ${ldm.numero}`,
       `La lettre de mission ${ldm.numero} et ses mandats ont tous été signés. ${tachesCreees} tâche(s) planifiée(s), ${facturesCreees} facture(s) générée(s).`,
       `/lettres-mission/${ldmId}`]
    ).catch(() => {});
  }
  console.log(`[scheduler] LDM ${ldm.numero} activée — ${tachesCreees} tâches, ${facturesCreees} factures`);
}

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

  // Every hour — poll Yousign for pending signatures (fallback if webhook misses)
  cron.schedule('0 * * * *', async () => {
    try {
      const yousign = require('./utils/yousign');
      if (!yousign.isConfigured()) return;

      // Devis en attente
      const [devisList] = await pool.query(
        `SELECT id, numero, statut, opportunite_id, yousign_request_id
         FROM devis WHERE yousign_status = 'pending' AND yousign_request_id IS NOT NULL`
      );
      for (const d of devisList) {
        try {
          const remote = await yousign.getSignatureRequestStatus(d.yousign_request_id);
          if (remote.status === 'done' && d.statut === 'envoye') {
            await pool.query(
              `UPDATE devis SET statut = 'accepte', yousign_status = 'done', dateSignature = NOW(), updatedAt = NOW() WHERE id = ?`,
              [d.id]
            );
            // Log événement signature Yousign (polling)
            await pool.query(
              `INSERT INTO devis_evenements (devis_id, type, acteur_id, acteur_nom, statut_avant, statut_apres, commentaire)
               VALUES (?, 'signature_yousign', NULL, 'Yousign', 'envoye', 'accepte', 'Signature électronique Yousign reçue')`,
              [d.id]
            ).catch(e => console.error('[scheduler] log devis evenement:', e.message));
            if (d.opportunite_id) {
              await pool.query(
                `UPDATE opportunites SET statut = 'devis_fait', probabilite = 80, updatedAt = NOW() WHERE id = ?`,
                [d.opportunite_id]
              ).catch(() => {});
            }
            const [experts] = await pool.query(
              `SELECT id FROM utilisateurs WHERE role IN ('expert','chef_mission') AND actif = 1`
            ).catch(() => [[]]);
            for (const u of experts) {
              await pool.query(
                `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue) VALUES (?,?,?,?,?,0)`,
                [u.id, 'devis_signe', `Devis signé : ${d.numero}`,
                 `Le devis ${d.numero} a été signé via Yousign. Vous pouvez créer la lettre de mission.`,
                 `/devis/${d.id}`]
              ).catch(() => {});
            }
            console.log(`[scheduler] Yousign polling: devis ${d.numero} accepté`);
          } else if (remote.status === 'declined') {
            await pool.query(
              `UPDATE devis SET statut = 'refuse', yousign_status = 'declined', updatedAt = NOW() WHERE id = ?`,
              [d.id]
            );
            console.log(`[scheduler] Yousign polling: devis ${d.numero} refusé`);
          } else if (remote.status === 'expired') {
            await pool.query(`UPDATE devis SET yousign_status = 'expired' WHERE id = ?`, [d.id]);
          }
        } catch (e) {
          console.error(`[scheduler] Yousign poll devis ${d.numero}:`, e.message);
        }
      }

      // LDM en attente
      const [ldmList] = await pool.query(
        `SELECT id, numero, statut, devis_id, yousign_request_id, collaborateur_id, chef_mission_id
         FROM lettres_mission WHERE yousign_status = 'pending' AND yousign_request_id IS NOT NULL`
      );
      for (const l of ldmList) {
        try {
          const remote = await yousign.getSignatureRequestStatus(l.yousign_request_id);
          if (remote.status === 'done' && l.statut === 'envoyee') {
            await pool.query(
              `UPDATE lettres_mission SET yousign_status = 'done' WHERE id = ?`, [l.id]
            );
            await activerMissionSiComplete(l.id);
          } else if (remote.status === 'declined') {
            await pool.query(
              `UPDATE lettres_mission SET yousign_status = 'declined', statut = 'annulee', updatedAt = NOW() WHERE id = ?`,
              [l.id]
            );
            if (l.devis_id) {
              await pool.query(
                `UPDATE devis SET verrouille = 0, ldm_generee_id = NULL WHERE id = ?`, [l.devis_id]
              ).catch(() => {});
            }
            console.log(`[scheduler] Yousign polling: LDM ${l.numero} refusée`);
          } else if (remote.status === 'expired') {
            await pool.query(`UPDATE lettres_mission SET yousign_status = 'expired' WHERE id = ?`, [l.id]);
          }
        } catch (e) {
          console.error(`[scheduler] Yousign poll LDM ${l.numero}:`, e.message);
        }
      }
      // Mandats en attente de signature
      const [mandatList] = await pool.query(
        `SELECT m.id, m.type, m.ldm_id, m.yousign_request_id,
                lm.numero AS ldm_numero, lm.client_id
         FROM mandats m
         JOIN lettres_mission lm ON lm.id = m.ldm_id
         WHERE m.signe = 0 AND m.yousign_request_id IS NOT NULL`
      ).catch(() => [[]]);

      for (const m of mandatList) {
        try {
          const remote = await yousign.getSignatureRequestStatus(m.yousign_request_id);
          if (remote.status === 'done') {
            await pool.query(
              `UPDATE mandats SET signe = 1, date_signature = CURDATE() WHERE id = ?`, [m.id]
            );

            // Archiver le PDF signé dans la GED
            try {
              const fs   = require('fs');
              const path = require('path');
              const docId = remote.documents?.[0]?.id;
              if (docId) {
                const signedBuf = await yousign.downloadSignedDocument(m.yousign_request_id, docId);
                const DOCS_BASE = '/opt/parfi-data/documents';
                const year = new Date().getFullYear();
                const dir  = path.join(DOCS_BASE, String(m.client_id || 'general'), String(year));
                fs.mkdirSync(dir, { recursive: true });
                const TYPE_LABEL = { prelevement: 'Mandat_SEPA', impots: 'Procuration_Fiscale', urssaf: 'Procuration_Sociale' };
                const fname = `${Date.now()}_${TYPE_LABEL[m.type] || 'Mandat'}_signe.pdf`;
                const fpath = path.join(dir, fname);
                fs.writeFileSync(fpath, signedBuf);

                await pool.query(
                  `INSERT INTO documents (nom, description, chemin, type_document, type, lettreMissionId, client_id, taille, mimeType)
                   VALUES (?, ?, ?, 'mandat', 'mandat', ?, ?, ?, 'application/pdf')`,
                  [fname, `${TYPE_LABEL[m.type] || 'Mandat'} signé — LDM ${m.ldm_numero}`,
                   fpath, m.ldm_id, m.client_id || null, signedBuf.length]
                );
                await pool.query(`UPDATE mandats SET chemin_pdf_signe = ? WHERE id = ?`, [fpath, m.id]);
              }
            } catch (archErr) {
              console.error(`[scheduler] archivage mandat ${m.type}:`, archErr.message);
            }

            console.log(`[scheduler] Mandat ${m.type} (LDM ${m.ldm_numero}) signé et archivé`);
            await activerMissionSiComplete(m.ldm_id);
          } else if (remote.status === 'expired') {
            console.log(`[scheduler] Mandat ${m.type} (LDM ${m.ldm_numero}) expiré`);
          }
        } catch (e) {
          console.error(`[scheduler] Yousign poll mandat ${m.type} (LDM ${m.ldm_numero}):`, e.message);
        }
      }

    } catch (e) {
      console.error('[scheduler] Yousign polling error:', e.message);
    }
  });

  // Daily at 08:10 — send automatic micro-entrepreneur relances
  cron.schedule('10 8 * * *', async () => {
    console.log('[scheduler] Running micro-relances check');
    try {
      const result = await checkMicroRelances();
      console.log(`[scheduler] micro-relances: ${result.sent} envoyée(s) sur ${result.processed} facture(s)`);
    } catch (e) {
      console.error('[scheduler] micro-relances error:', e.message);
    }
  });

  // RG-03 — génération quotidienne des périodes de production.
  // 05:00 : après les creux nocturnes système, avant l'arrivée des collaborateurs.
  // Idempotent : relançable à la main via node src/jobs/generer-periodes.js.
  cron.schedule('0 5 * * *', async () => {
    console.log('[scheduler] Running generer_periodes');
    try {
      const r = await genererPeriodes(pool);
      console.log(`[scheduler] generer_periodes: ${r.periodesCreees} période(s) créée(s), ${r.tachesCreees} tâche(s) instanciée(s), ${r.periodesExistantes} existante(s), ${r.periodesEcarteesPlancher} écartée(s) par le plancher, ${r.missionsIgnorees}/${r.missionsExaminees} mission(s) ignorée(s)`);
    } catch (e) {
      console.error('[scheduler] generer_periodes error:', e.message);
    }
  });

  console.log('[scheduler] Démarré — tache_retard @ 08:00, facture_impayee_30j @ 08:05, micro-relances @ 08:10, figeage_temps @ 02:00, powens_sync @ 03:30, yousign_poll @ toutes les heures, generer_periodes @ 05:00');
}

module.exports = { startScheduler };
