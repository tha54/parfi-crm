const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { getVisibleUserIds, inClause } = require('../utils/scope');

// ─── Migration au démarrage : colonnes budget manuel client ──────────────────
;(async () => {
  const cols = [
    ['budget_temps_h',          'DECIMAL(10,2) DEFAULT NULL'],
    ['budget_honoraires',       'DECIMAL(10,2) DEFAULT NULL'],
    ['periodicite_facturation', "ENUM('mensuelle','trimestrielle','semestrielle','annuelle','ponctuelle') DEFAULT NULL"],
  ];
  for (const [col, def] of cols) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = ?`,
      [col]
    );
    if (!row.n) {
      await pool.query(`ALTER TABLE clients ADD COLUMN ${col} ${def}`);
      console.log(`[clients] Colonne ${col} ajoutée`);
    }
  }
})().catch(e => console.error('[clients] migration:', e.message));

// List clients — based on role/scope
router.get('/', verifyToken, async (req, res) => {
  try {
    const visibleIds = await getVisibleUserIds(pool, req.user);

    const collab_sub = `(
      SELECT GROUP_CONCAT(
               DISTINCT CONCAT(u.prenom,'|',u.nom,'|',a2.role_sur_dossier)
               ORDER BY a2.role_sur_dossier DESC, u.nom
               SEPARATOR ','
             )
      FROM attributions a2
      JOIN utilisateurs u ON u.id = a2.utilisateur_id
      WHERE a2.client_id = c.id
    ) AS equipe`;

    // Colonnes budget/suivi (LDM active + tache_temps + factures)
    const budget_subs = `,
      (SELECT COALESCE(lm.montant_annuel_ht, lm.montantHonorairesHT, 0)
       FROM lettres_mission lm
       WHERE lm.client_id = c.id AND lm.statut IN ('signee','active')
       ORDER BY lm.id DESC LIMIT 1) AS ldm_budget_honoraires,
      (SELECT COALESCE(lm.budget_minutes_collab,0)+COALESCE(lm.budget_minutes_chef,0)+COALESCE(lm.budget_minutes_expert,0)
       FROM lettres_mission lm
       WHERE lm.client_id = c.id AND lm.statut IN ('signee','active')
       ORDER BY lm.id DESC LIMIT 1) AS ldm_budget_minutes_total,
      (SELECT COALESCE(SUM(f.totalHT),0)
       FROM factures f
       WHERE f.client_id = c.id AND f.statut NOT IN ('annulee','brouillon')
         AND YEAR(f.dateEmission) = YEAR(CURDATE())) AS honoraires_factures_ytd,
      (SELECT COALESCE(SUM(tt.duree_minutes),0)
       FROM tache_temps tt JOIN taches t ON t.id=tt.tache_id
       JOIN utilisateurs u ON u.id=tt.utilisateur_id
       WHERE t.client_id=c.id AND tt.statut NOT IN ('rejetee')
         AND u.role_metier NOT IN ('collaborateur_social','juriste','collaborateur_juridique')
      ) AS temps_consomme_minutes`;

    let rows;
    if (visibleIds === null) {
      [rows] = await pool.query(
        `SELECT c.*, ${collab_sub}${budget_subs} FROM clients c WHERE c.actif = 1 ORDER BY c.nom`
      );
    } else {
      const { clause, params } = inClause(visibleIds, 'a.utilisateur_id');
      [rows] = await pool.query(
        `SELECT c.*, ${collab_sub}${budget_subs}
         FROM clients c
         WHERE c.actif = 1
           AND EXISTS (
             SELECT 1 FROM attributions a
             WHERE a.client_id = c.id ${clause}
           )
         ORDER BY c.nom`,
        params
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Cabinet view — one row per client with their active LDM and honoraires
router.get('/cabinet', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        c.id, c.nom, c.type, c.regime, c.actif,
        lm.id           AS ldm_id,
        lm.numero       AS ldm_numero,
        lm.statut       AS ldm_statut,
        lm.typeMission  AS ldm_type_mission,
        COALESCE(lm.montant_annuel_ht, lm.montantHonorairesHT, 0) AS honoraires_annuel,
        lm.dateDebut    AS ldm_debut,
        lm.dateFin      AS ldm_fin,
        lm.date_resiliation,
        u.prenom        AS collab_prenom,
        u.nom           AS collab_nom
      FROM clients c
      LEFT JOIN lettres_mission lm
        ON  lm.client_id = c.id
        AND lm.statut    != 'archivee'
        AND lm.id = (
              SELECT MAX(id) FROM lettres_mission
              WHERE client_id = c.id AND statut != 'archivee'
            )
      LEFT JOIN utilisateurs u ON u.id = lm.collaborateur_id
      WHERE c.actif = 1
      ORDER BY c.nom
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Budget temps détail par intervenant pour un client
router.get('/:id/budget-temps-detail', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;

    // LDM active
    const [[ldm]] = await pool.query(`
      SELECT id, numero, statut,
             COALESCE(montant_annuel_ht, montantHonorairesHT, 0) AS budget_honoraires,
             COALESCE(budget_minutes_collab,0) AS budget_minutes_collab,
             COALESCE(budget_minutes_chef,0)   AS budget_minutes_chef,
             COALESCE(budget_minutes_expert,0) AS budget_minutes_expert,
             modaliteFacturation, dateDebut, dateFin
      FROM lettres_mission
      WHERE client_id = ? AND statut IN ('signee','active')
      ORDER BY id DESC LIMIT 1
    `, [clientId]).catch(() => [[null]]);

    // Temps consommé par profil
    const [consomme] = await pool.query(`
      SELECT
        CASE
          WHEN u.role_metier = 'expert_comptable'                    THEN 'expert'
          WHEN u.role_metier IN ('chef_de_groupe','chef_de_mission') THEN 'chef'
          ELSE 'collab'
        END AS profil,
        SUM(tt.duree_minutes) AS minutes
      FROM tache_temps tt
      JOIN taches t ON t.id = tt.tache_id
      JOIN utilisateurs u ON u.id = tt.utilisateur_id
      WHERE t.client_id = ?
        AND tt.statut NOT IN ('rejetee')
        AND u.role_metier NOT IN ('collaborateur_social','juriste','collaborateur_juridique')
        AND (
          t.dimensionnement_ligne_id IS NULL
          OR t.dimensionnement_ligne_id NOT IN (
            SELECT id FROM dimensionnement_lignes
            WHERE intervenant IN ('Collaborateur Social','Collaborateur Juridique')
          )
        )
      GROUP BY profil
    `, [clientId]).catch(() => [[]]);

    const map = { collab: 0, chef: 0, expert: 0 };
    for (const r of consomme) if (r.profil in map) map[r.profil] = parseInt(r.minutes) || 0;

    const [[honFac]] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN YEAR(f.dateEmission)=YEAR(CURDATE()) THEN f.totalHT ELSE 0 END),0) AS ytd,
        COALESCE(SUM(f.totalHT),0) AS total
      FROM factures f
      WHERE f.client_id = ? AND f.statut NOT IN ('annulee','brouillon')
    `, [clientId]).catch(() => [[{ ytd: 0, total: 0 }]]);

    const [[param]] = await pool.query(
      `SELECT COALESCE(seuil_depassement_budget,20) AS seuil FROM parametres_cabinet LIMIT 1`
    ).catch(() => [[{ seuil: 20 }]]);

    // Détail nominatif (pour tooltip/expansion)
    const [detail] = await pool.query(`
      SELECT u.prenom, u.nom, u.role_metier,
             SUM(tt.duree_minutes) AS minutes_total
      FROM tache_temps tt
      JOIN taches t ON t.id = tt.tache_id
      JOIN utilisateurs u ON u.id = tt.utilisateur_id
      WHERE t.client_id = ?
        AND tt.statut NOT IN ('rejetee')
        AND u.role_metier NOT IN ('collaborateur_social','juriste','collaborateur_juridique')
      GROUP BY u.id, u.prenom, u.nom, u.role_metier
      ORDER BY minutes_total DESC
    `, [clientId]).catch(() => [[]]);

    res.json({
      ldm: ldm || null,
      consomme: map,
      detail,
      honoraires: {
        budget:        parseFloat(ldm?.budget_honoraires || 0),
        facture_ytd:   parseFloat(honFac.ytd),
        facture_total: parseFloat(honFac.total),
      },
      seuil_alerte: parseInt(param.seuil),
    });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// Page "Clients à compléter" — EC, chefs de mission, chefs de groupe
router.get('/a-completer', verifyToken, async (req, res) => {
  const isManager = ['expert','chef_mission'].includes(req.user.role) ||
    ['expert_comptable','chef_de_groupe','chef_de_mission'].includes(req.user.role_metier);
  if (!isManager) return res.status(403).json({ message: 'Réservé aux EC et chefs' });
  try {
    const [rows] = await pool.query(`
      SELECT
        c.id, c.nom, c.siren, c.type, c.regime, c.cree_le,
        c.forme_juridique, c.regime_fiscal, c.regime_tva, c.periodicite_tva,
        c.migration_anomalie,
        CONCAT(u.prenom,' ',u.nom) AS referent_nom
      FROM clients c
      LEFT JOIN attributions a ON a.client_id = c.id AND a.role_sur_dossier = 'responsable'
      LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
      WHERE c.actif = 1
        AND (
          c.migration_anomalie IS NOT NULL
          OR c.forme_juridique IS NULL
          OR c.regime_fiscal IS NULL
          OR c.regime_tva IS NULL
          OR c.periodicite_tva IS NULL
        )
      GROUP BY c.id
      ORDER BY c.nom
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// Get one client with attributions
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [clients] = await pool.query('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (clients.length === 0) return res.status(404).json({ message: 'Client introuvable' });
    const [attributions] = await pool.query(
      `SELECT a.*, u.nom, u.prenom, u.email, u.role
       FROM attributions a JOIN utilisateurs u ON a.utilisateur_id = u.id
       WHERE a.client_id = ?`,
      [req.params.id]
    );
    res.json({ ...clients[0], attributions });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Update manual mission budget — expert & chef_mission
router.put('/:id/mission-budget', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { budget_temps_h, budget_honoraires, periodicite_facturation, date_debut_mission, date_fin_mission } = req.body;
  try {
    await pool.query(
      `UPDATE clients SET
         budget_temps_h = ?, budget_honoraires = ?,
         periodicite_facturation = ?, date_debut_mission = ?, date_fin_mission = ?
       WHERE id = ?`,
      [
        budget_temps_h  !== '' && budget_temps_h  != null ? parseFloat(budget_temps_h)  : null,
        budget_honoraires !== '' && budget_honoraires != null ? parseFloat(budget_honoraires) : null,
        periodicite_facturation || null,
        date_debut_mission || null,
        date_fin_mission   || null,
        req.params.id,
      ]
    );
    res.json({ message: 'Budget enregistré' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// Create client — expert & chef_mission
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { nom, siren, type, regime } = req.body;
  if (!nom || !type || !regime) {
    return res.status(400).json({ message: 'Nom, type et régime requis' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO clients (nom, siren, type, regime) VALUES (?, ?, ?, ?)',
      [nom, siren || null, type, regime]
    );
    res.status(201).json({ id: result.insertId, nom, siren, type, regime });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Vérifie si les 4 champs critiques sont remplis et efface migration_anomalie si oui
async function clearAnomalieIfComplete(pool, clientId) {
  const [[c]] = await pool.query(
    `SELECT forme_juridique, regime_fiscal, regime_tva, periodicite_tva, migration_anomalie FROM clients WHERE id = ?`,
    [clientId]
  );
  if (!c || !c.migration_anomalie) return;
  if (c.forme_juridique && c.regime_fiscal && c.regime_tva && c.periodicite_tva) {
    await pool.query(`UPDATE clients SET migration_anomalie = NULL WHERE id = ?`, [clientId]);
  }
}

// Validation des contraintes de cohérence TVA (§4 du plan)
function validateTvaCoherence(regime_tva, periodicite_tva) {
  if (regime_tva === 'reel_simplifie' && periodicite_tva && periodicite_tva !== 'annuelle') {
    return 'Le régime TVA Réel simplifié impose une périodicité annuelle';
  }
  if (regime_tva === 'franchise' && periodicite_tva && periodicite_tva !== 'sans_objet') {
    return 'Le régime TVA Franchise impose "sans objet" comme périodicité';
  }
  if (regime_tva === 'hors_champ' && periodicite_tva && periodicite_tva !== 'sans_objet') {
    return 'Le régime TVA Hors champ impose "sans objet" comme périodicité';
  }
  if (regime_tva === 'reel_normal' && periodicite_tva && !['mensuelle','trimestrielle'].includes(periodicite_tva)) {
    return 'Le régime TVA Réel normal requiert une périodicité mensuelle ou trimestrielle';
  }
  return null;
}

// Update client — expert & chef_mission
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const {
    nom, siren, type, regime, actif, notes_riches,
    complexite, source_acquisition, ca_mensuel_signe, ca_mensuel_perdu,
    motif_fin, motif_detail, etait_previsible,
    nom_dirigeant, prenom_dirigeant,
    // Nouveaux champs Chantier 1
    forme_juridique, regime_fiscal, regime_tva, periodicite_tva,
    presence_salaries, nb_salaries, convention_collective,
    nb_etablissements, activite_type,
  } = req.body;

  // Validation cohérence TVA avant tout
  if (regime_tva !== undefined || periodicite_tva !== undefined) {
    const rtva = regime_tva !== undefined ? regime_tva : undefined;
    const ptva = periodicite_tva !== undefined ? periodicite_tva : undefined;
    if (rtva && ptva) {
      const err = validateTvaCoherence(rtva, ptva);
      if (err) return res.status(400).json({ message: err });
    }
  }

  try {
    const [[prev]] = await pool.query('SELECT nom, siren, type, regime, actif FROM clients WHERE id = ?', [req.params.id]);
    const fields = [], values = [], changed = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nom); changed.push('nom'); }
    if (siren !== undefined) { fields.push('siren = ?'); values.push(siren); changed.push('siren'); }
    if (type !== undefined) { fields.push('type = ?'); values.push(type); changed.push('type'); }
    if (regime !== undefined) { fields.push('regime = ?'); values.push(regime); changed.push('regime'); }
    if (actif !== undefined) { fields.push('actif = ?'); values.push(actif); changed.push('actif'); }
    if (notes_riches !== undefined) { fields.push('notes_riches = ?'); values.push(notes_riches); changed.push('notes_riches'); }
    if (complexite !== undefined) { fields.push('complexite = ?'); values.push(complexite || null); changed.push('complexite'); }
    if (source_acquisition !== undefined) { fields.push('source_acquisition = ?'); values.push(source_acquisition || null); changed.push('source_acquisition'); }
    if (ca_mensuel_signe !== undefined) { fields.push('ca_mensuel_signe = ?'); values.push(ca_mensuel_signe || null); changed.push('ca_mensuel_signe'); }
    if (ca_mensuel_perdu !== undefined) { fields.push('ca_mensuel_perdu = ?'); values.push(ca_mensuel_perdu || null); changed.push('ca_mensuel_perdu'); }
    if (motif_fin !== undefined) { fields.push('motif_fin = ?'); values.push(motif_fin || null); changed.push('motif_fin'); }
    if (motif_detail !== undefined) { fields.push('motif_detail = ?'); values.push(motif_detail || null); changed.push('motif_detail'); }
    if (etait_previsible !== undefined) { fields.push('etait_previsible = ?'); values.push(etait_previsible); changed.push('etait_previsible'); }
    if (nom_dirigeant !== undefined) { fields.push('nom_dirigeant = ?'); values.push(nom_dirigeant || null); changed.push('nom_dirigeant'); }
    if (prenom_dirigeant !== undefined) { fields.push('prenom_dirigeant = ?'); values.push(prenom_dirigeant || null); changed.push('prenom_dirigeant'); }
    // Nouveaux champs
    if (forme_juridique !== undefined) { fields.push('forme_juridique = ?'); values.push(forme_juridique || null); changed.push('forme_juridique'); }
    if (regime_fiscal !== undefined) { fields.push('regime_fiscal = ?'); values.push(regime_fiscal || null); changed.push('regime_fiscal'); }
    if (regime_tva !== undefined) { fields.push('regime_tva = ?'); values.push(regime_tva || null); changed.push('regime_tva'); }
    if (periodicite_tva !== undefined) { fields.push('periodicite_tva = ?'); values.push(periodicite_tva || null); changed.push('periodicite_tva'); }
    if (presence_salaries !== undefined) { fields.push('presence_salaries = ?'); values.push(presence_salaries != null ? Number(presence_salaries) : null); changed.push('presence_salaries'); }
    if (nb_salaries !== undefined) { fields.push('nb_salaries = ?'); values.push(nb_salaries != null ? Number(nb_salaries) : null); changed.push('nb_salaries'); }
    if (convention_collective !== undefined) { fields.push('convention_collective = ?'); values.push(convention_collective || null); changed.push('convention_collective'); }
    if (nb_etablissements !== undefined) { fields.push('nb_etablissements = ?'); values.push(nb_etablissements != null ? Number(nb_etablissements) : 1); changed.push('nb_etablissements'); }
    if (activite_type !== undefined) { fields.push('activite_type = ?'); values.push(activite_type || null); changed.push('activite_type'); }
    if (fields.length === 0) return res.status(400).json({ message: 'Aucun champ à modifier' });
    values.push(req.params.id);
    await pool.query(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`, values);
    // Effacement automatique migration_anomalie si champs critiques maintenant complets
    await clearAnomalieIfComplete(pool, req.params.id);
    // Audit log
    const userName = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() || req.user.email;
    pool.query(
      `INSERT INTO audit_log (entity_type, entity_id, utilisateur_id, utilisateur_nom, action, champs_modifies, ancienne_valeur, nouvelle_valeur)
       VALUES ('client', ?, ?, ?, 'update', ?, ?, ?)`,
      [req.params.id, req.user.id, userName,
       JSON.stringify(changed),
       JSON.stringify(prev),
       JSON.stringify(req.body)]
    ).catch(() => {});
    res.json({ message: 'Client mis à jour' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// Check wizard readiness pour un client (4 champs critiques)
router.get('/:id/wizard-readiness', verifyToken, async (req, res) => {
  try {
    const [[c]] = await pool.query(
      `SELECT forme_juridique, regime_fiscal, regime_tva, periodicite_tva FROM clients WHERE id = ?`,
      [req.params.id]
    );
    if (!c) return res.status(404).json({ message: 'Client introuvable' });
    const manquants = [];
    if (!c.forme_juridique) manquants.push('forme_juridique');
    if (!c.regime_fiscal)   manquants.push('regime_fiscal');
    if (!c.regime_tva)      manquants.push('regime_tva');
    if (!c.periodicite_tva) manquants.push('periodicite_tva');
    res.json({ ok: manquants.length === 0, manquants });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// Delete client — expert only
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('UPDATE clients SET actif = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Client désactivé' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
