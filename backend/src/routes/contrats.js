const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── activerMission ───────────────────────────────────────────────────────────
// Génère les tâches depuis les mission_lignes et convertit le prospect si besoin.

async function activerMission(contratId, userId) {
  const [[contrat]] = await pool.query('SELECT * FROM contrats WHERE id = ?', [contratId]);
  if (!contrat) throw new Error('Contrat introuvable');
  if (contrat.statut === 'mission_active') throw new Error('Mission déjà active');

  const [lignes] = await pool.query(
    'SELECT * FROM mission_lignes WHERE contrat_id = ? ORDER BY id',
    [contratId]
  );

  // Conversion prospect → client si besoin
  let clientId = contrat.client_id;
  if (!clientId && contrat.prospect_id) {
    const [[prospect]] = await pool.query('SELECT * FROM prospects WHERE id = ?', [contrat.prospect_id]);
    if (prospect) {
      const [res] = await pool.query(
        `INSERT INTO clients (nom, siren, siret, forme_juridique, adresse, code_postal, ville, type, regime, actif)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'BIC', 'mensuel', 1)`,
        [
          prospect.nom,
          prospect.siren || null,
          prospect.siret || null,
          prospect.forme_juridique || null,
          prospect.adresse || null,
          prospect.code_postal || null,
          prospect.ville || null,
        ]
      );
      clientId = res.insertId;
      await pool.query(
        "UPDATE prospects SET statut = 'converti', client_id = ? WHERE id = ?",
        [clientId, contrat.prospect_id]
      );
      await pool.query('UPDATE contrats SET client_id = ? WHERE id = ?', [clientId, contratId]);
    }
  }
  if (!clientId) throw new Error('Aucun client associé au contrat');

  const debut = contrat.date_debut_mission
    ? new Date(contrat.date_debut_mission)
    : new Date();
  const collaborateurId = contrat.collaborateur_id || userId;
  let tachesCreees = 0;

  for (const ligne of lignes) {
    const rec = ligne.recurrence || 'none';
    const n = rec === 'monthly' ? 12 : rec === 'quarterly' ? 4 : 1;
    const budgetMin = ligne.budget_minutes || 0;
    const dureeH = Math.max(0.5, Math.round((budgetMin / n / 60) * 2) / 2);

    for (let i = 0; i < n; i++) {
      const d = new Date(debut);
      if (rec === 'monthly') d.setMonth(d.getMonth() + i + 1);
      else if (rec === 'quarterly') d.setMonth(d.getMonth() + (i + 1) * 3);
      else if (rec === 'yearly') d.setFullYear(d.getFullYear() + 1);
      else d.setDate(d.getDate() + 30);

      const titre = ligne.nom;
      const desc = n > 1 ? `${ligne.nom} (${i + 1}/${n})` : ligne.nom;

      await pool.query(
        `INSERT INTO taches
           (client_id, utilisateur_id, titre, description, duree, date_echeance, statut, origine, categorie, assigne_par)
         VALUES (?, ?, ?, ?, ?, ?, 'a_faire', 'ldm', ?, ?)`,
        [
          clientId, collaborateurId, titre, desc, dureeH,
          d.toISOString().split('T')[0],
          ligne.categorie || null,
          userId,
        ]
      );
      tachesCreees++;
    }
  }

  await pool.query(
    "UPDATE contrats SET statut = 'mission_active', updated_at = NOW() WHERE id = ?",
    [contratId]
  );

  return { clientId, tachesCreees };
}

// ─── GET / — liste ────────────────────────────────────────────────────────────

router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id, prospect_id, statut } = req.query;
    let where = '1=1';
    const params = [];
    if (client_id)   { where += ' AND c.client_id = ?';   params.push(client_id); }
    if (prospect_id) { where += ' AND c.prospect_id = ?'; params.push(prospect_id); }
    if (statut)      { where += ' AND c.statut = ?';      params.push(statut); }

    const [rows] = await pool.query(
      `SELECT c.*,
              cl.nom AS client_nom,
              p.nom  AS prospect_nom,
              CONCAT(u.prenom, ' ', u.nom) AS collaborateur_nom,
              (SELECT COUNT(*) FROM mission_lignes ml WHERE ml.contrat_id = c.id) AS nb_lignes,
              (SELECT COUNT(*) FROM mandats m WHERE m.contrat_id = c.id AND m.signe = 1) AS nb_mandats_signes,
              (SELECT COUNT(*) FROM mandats m WHERE m.contrat_id = c.id) AS nb_mandats
       FROM contrats c
       LEFT JOIN clients      cl ON c.client_id       = cl.id
       LEFT JOIN prospects    p  ON c.prospect_id      = p.id
       LEFT JOIN utilisateurs u  ON c.collaborateur_id = u.id
       WHERE ${where}
       ORDER BY c.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', detail: e.message }); }
});

// ─── GET /alertes-revision — contrats dont l'anniversaire approche ────────────

router.get('/alertes-revision', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, cl.nom AS client_nom,
              DATEDIFF(
                DATE_ADD(
                  c.date_signature,
                  INTERVAL (YEAR(CURDATE()) - YEAR(c.date_signature)
                    + IF(DATE_FORMAT(CURDATE(),'%m%d') >= DATE_FORMAT(c.date_signature,'%m%d'), 0, -1)
                    + 1
                  ) YEAR
                ),
                CURDATE()
              ) AS jours_avant_anniversaire
       FROM contrats c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE c.statut = 'mission_active'
         AND c.date_signature IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM mission_revisions mr
           WHERE mr.contrat_id = c.id AND mr.annee = YEAR(CURDATE())
         )
       HAVING jours_avant_anniversaire BETWEEN 0 AND 45
       ORDER BY jours_avant_anniversaire`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', detail: e.message }); }
});

// ─── GET /:id — détail complet ────────────────────────────────────────────────

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[contrat]] = await pool.query(
      `SELECT c.*,
              cl.nom AS client_nom,
              p.nom  AS prospect_nom,
              CONCAT(u.prenom,  ' ', u.nom)  AS collaborateur_nom,
              CONCAT(cb.prenom, ' ', cb.nom) AS created_by_nom
       FROM contrats c
       LEFT JOIN clients      cl ON c.client_id       = cl.id
       LEFT JOIN prospects    p  ON c.prospect_id      = p.id
       LEFT JOIN utilisateurs u  ON c.collaborateur_id = u.id
       LEFT JOIN utilisateurs cb ON c.created_by       = cb.id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!contrat) return res.status(404).json({ message: 'Contrat introuvable' });

    const [lignes]    = await pool.query('SELECT * FROM mission_lignes  WHERE contrat_id = ? ORDER BY id', [req.params.id]);
    const [mandats]   = await pool.query('SELECT * FROM mandats          WHERE contrat_id = ? ORDER BY id', [req.params.id]);
    const [revisions] = await pool.query(
      `SELECT mr.*, CONCAT(u.prenom, ' ', u.nom) AS created_by_nom
       FROM mission_revisions mr
       LEFT JOIN utilisateurs u ON mr.created_by = u.id
       WHERE mr.contrat_id = ? ORDER BY mr.annee DESC`,
      [req.params.id]
    );

    res.json({ ...contrat, lignes, mandats, revisions });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', detail: e.message }); }
});

// ─── POST / — créer ───────────────────────────────────────────────────────────

router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { client_id, prospect_id, statut, honoraires_ht, date_devis, collaborateur_id } = req.body;
  if (!client_id && !prospect_id)
    return res.status(400).json({ message: 'client_id ou prospect_id requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO contrats (client_id, prospect_id, statut, honoraires_ht, date_devis, collaborateur_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        client_id    || null,
        prospect_id  || null,
        statut       || 'prospect',
        honoraires_ht || null,
        date_devis   || null,
        collaborateur_id || null,
        req.user.id,
      ]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', detail: e.message }); }
});

// ─── PUT /:id — mettre à jour ─────────────────────────────────────────────────

router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const allowed = [
    'statut', 'honoraires_ht', 'date_devis', 'date_acceptation',
    'date_signature', 'date_debut_mission', 'collaborateur_id',
  ];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE contrats SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
    res.json({ message: 'Contrat mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', detail: e.message }); }
});

// ─── POST /:id/signer — enregistre la signature LDM et génère les tâches ──────
// Opération atomique : date_signature → ldm_signee → génération tâches → mission_active

router.post('/:id/signer', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { date_signature, date_debut_mission, collaborateur_id } = req.body;
  if (!date_signature) return res.status(400).json({ message: 'date_signature requise' });

  try {
    const [[contrat]] = await pool.query('SELECT statut FROM contrats WHERE id = ?', [req.params.id]);
    if (!contrat) return res.status(404).json({ message: 'Contrat introuvable' });
    if (contrat.statut === 'mission_active') return res.status(409).json({ message: 'Mission déjà active' });

    // 1. Enregistrer la signature
    const fields = ['statut = ?', 'date_signature = ?'];
    const vals = ['ldm_signee', date_signature];
    if (date_debut_mission) { fields.push('date_debut_mission = ?'); vals.push(date_debut_mission); }
    if (collaborateur_id)   { fields.push('collaborateur_id = ?');   vals.push(collaborateur_id); }
    fields.push('updated_at = NOW()');
    vals.push(req.params.id);
    await pool.query(`UPDATE contrats SET ${fields.join(', ')} WHERE id = ?`, vals);

    // 2. Générer les tâches et passer à mission_active
    const result = await activerMission(parseInt(req.params.id, 10), req.user.id);

    res.json({
      message: `LDM signée — ${result.tachesCreees} tâche(s) générée(s) pour le collaborateur`,
      ...result,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ─── POST /:id/activer — fallback manuel ──────────────────────────────────────

router.post('/:id/activer', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const result = await activerMission(parseInt(req.params.id, 10), req.user.id);
    res.json({ message: 'Mission activée avec succès', ...result });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ─── Mission lignes ───────────────────────────────────────────────────────────

router.get('/:id/lignes', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM mission_lignes WHERE contrat_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.post('/:id/lignes', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { nom, categorie, budget_minutes, recurrence, honoraires_ht } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO mission_lignes (contrat_id, nom, categorie, budget_minutes, recurrence, honoraires_ht)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, nom, categorie || null, budget_minutes || 0, recurrence || 'none', honoraires_ht || 0]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', detail: e.message }); }
});

router.put('/:id/lignes/:lid', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const allowed = ['nom', 'categorie', 'budget_minutes', 'recurrence', 'honoraires_ht'];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.lid, req.params.id);
  try {
    await pool.query(
      `UPDATE mission_lignes SET ${fields.join(', ')} WHERE id = ? AND contrat_id = ?`,
      values
    );
    res.json({ message: 'Ligne mise à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.delete('/:id/lignes/:lid', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM mission_lignes WHERE id = ? AND contrat_id = ?',
      [req.params.lid, req.params.id]
    );
    res.json({ message: 'Ligne supprimée' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ─── Mandats ──────────────────────────────────────────────────────────────────

router.get('/:id/mandats', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM mandats WHERE contrat_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.post('/:id/mandats', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { type, libelle } = req.body;
  if (!type) return res.status(400).json({ message: 'Type requis' });
  try {
    const [r] = await pool.query(
      'INSERT INTO mandats (contrat_id, type, libelle) VALUES (?, ?, ?)',
      [req.params.id, type, libelle || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', detail: e.message }); }
});

router.put('/:id/mandats/:mid', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { signe, date_signature } = req.body;
  try {
    await pool.query(
      'UPDATE mandats SET signe = ?, date_signature = ? WHERE id = ? AND contrat_id = ?',
      [signe ? 1 : 0, date_signature || null, req.params.mid, req.params.id]
    );
    res.json({ message: 'Mandat mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ─── Révisions ────────────────────────────────────────────────────────────────

router.get('/:id/revisions', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM mission_revisions WHERE contrat_id = ? ORDER BY annee DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.post('/:id/revisions', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { annee, anciens_honoraires, nouveaux_honoraires, motif, date_revision } = req.body;
  if (!annee || !nouveaux_honoraires)
    return res.status(400).json({ message: 'annee et nouveaux_honoraires sont requis' });
  try {
    const [[existing]] = await pool.query(
      'SELECT id FROM mission_revisions WHERE contrat_id = ? AND annee = ?',
      [req.params.id, annee]
    );
    if (existing) return res.status(409).json({ message: `Une révision pour ${annee} existe déjà` });

    const [r] = await pool.query(
      `INSERT INTO mission_revisions
         (contrat_id, annee, anciens_honoraires, nouveaux_honoraires, motif, date_revision, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, annee, anciens_honoraires || null, nouveaux_honoraires,
        motif || null,
        date_revision || new Date().toISOString().split('T')[0],
        req.user.id,
      ]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', detail: e.message }); }
});

router.put('/:id/revisions/:rid', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { statut } = req.body;
  if (!['proposee', 'acceptee', 'refusee'].includes(statut))
    return res.status(400).json({ message: 'Statut invalide' });
  try {
    await pool.query(
      'UPDATE mission_revisions SET statut = ? WHERE id = ? AND contrat_id = ?',
      [statut, req.params.rid, req.params.id]
    );
    if (statut === 'acceptee') {
      const [[rev]] = await pool.query(
        'SELECT nouveaux_honoraires FROM mission_revisions WHERE id = ?',
        [req.params.rid]
      );
      await pool.query(
        'UPDATE contrats SET honoraires_ht = ?, updated_at = NOW() WHERE id = ?',
        [rev.nouveaux_honoraires, req.params.id]
      );
    }
    res.json({ message: 'Révision mise à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', detail: e.message }); }
});

module.exports = router;
