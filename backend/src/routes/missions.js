const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — liste des missions
router.get('/', verifyToken, async (req, res) => {
  try {
    const { statut, intervenantId, contactId, client_id } = req.query;
    let where = '1=1';
    const params = [];
    if (statut) { where += ' AND m.statut = ?'; params.push(statut); }
    if (intervenantId) { where += ' AND m.intervenantId = ?'; params.push(intervenantId); }
    if (contactId) { where += ' AND m.contactId = ?'; params.push(contactId); }
    if (client_id) { where += ' AND m.client_id = ?'; params.push(client_id); }
    const [rows] = await pool.query(
      `SELECT m.*,
              cl.nom AS client_nom,
              c.raisonSociale AS contactNom,
              CONCAT(i.prenom, ' ', i.nom) AS intervenantNom
       FROM missions m
       LEFT JOIN clients cl ON m.client_id = cl.id
       LEFT JOIN contacts c ON m.contactId = c.id
       LEFT JOIN intervenants i ON m.intervenantId = i.id
       WHERE ${where}
       ORDER BY COALESCE(cl.nom, c.raisonSociale, 'zzz'), m.createdAt DESC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /alertes — missions en dépassement temps
router.get('/alertes', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.*, c.raisonSociale AS contactNom
       FROM missions m
       LEFT JOIN contacts c ON m.contactId = c.id
       WHERE m.statut = 'en_cours'
         AND m.tempsBudgeteH > 0
         AND m.tempsPasseH > m.tempsBudgeteH * 1.1`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// GET /:id — fiche mission complète
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[mission]] = await pool.query(
      `SELECT m.*, c.raisonSociale AS contactNom, CONCAT(i.prenom, ' ', i.nom) AS intervenantNom
       FROM missions m
       LEFT JOIN contacts c ON m.contactId = c.id
       LEFT JOIN intervenants i ON m.intervenantId = i.id
       WHERE m.id = ?`, [req.params.id]
    );
    if (!mission) return res.status(404).json({ message: 'Mission introuvable' });
    const [taches] = await pool.query(
      'SELECT tm.*, CONCAT(i.prenom, " ", i.nom) AS intervenantNom FROM taches_mission tm LEFT JOIN intervenants i ON tm.intervenantId = i.id WHERE tm.missionId = ? ORDER BY tm.ordre',
      [req.params.id]
    );
    const [saisies] = await pool.query(
      `SELECT st.*, CONCAT(u.prenom, ' ', u.nom) AS utilisateurNom
       FROM saisies_temps st LEFT JOIN utilisateurs u ON st.utilisateurId = u.id
       WHERE st.missionId = ? ORDER BY st.date DESC`, [req.params.id]
    );
    const totalSaisi = saisies.reduce((s, x) => s + Number(x.dureeH), 0);
    res.json({ ...mission, taches, saisies, totalSaisiH: totalSaisi });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// POST / — créer une mission
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { contactId, nom, categorie, statut, honorairesBudgetes, tempsBudgeteH, intervenantId, dateDebut, dateFin, notes } = req.body;
  if (!contactId || !nom || !categorie) return res.status(400).json({ message: 'contactId, nom et categorie requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO missions (contactId, nom, categorie, statut, honorairesBudgetes, tempsBudgeteH, intervenantId, dateDebut, dateFin, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [contactId, nom, categorie, statut || 'en_cours', honorairesBudgetes || 0, tempsBudgeteH || 0, intervenantId || null, dateDebut || null, dateFin || null, notes || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// PUT /:id — mettre à jour une mission
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const allowed = ['nom','categorie','statut','honorairesBudgetes','honorairesFactures','tempsBudgeteH','tempsPasseH','intervenantId','dateDebut','dateFin','notes'];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE missions SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
    res.json({ message: 'Mission mise à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// DELETE /:id
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('DELETE FROM taches_mission WHERE missionId = ?', [req.params.id]);
    await pool.query('DELETE FROM saisies_temps WHERE missionId = ?', [req.params.id]);
    await pool.query('DELETE FROM missions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Mission supprimée' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// --- Tâches de mission ---
router.get('/:id/taches', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT tm.*, CONCAT(i.prenom, " ", i.nom) AS intervenantNom FROM taches_mission tm LEFT JOIN intervenants i ON tm.intervenantId = i.id WHERE tm.missionId = ? ORDER BY tm.ordre',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.post('/:id/taches', verifyToken, async (req, res) => {
  const { nom, description, tempsBudgeteH, prixVenteHoraire, intervenantId, ordre } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  try {
    const [[{ maxOrdre }]] = await pool.query('SELECT COALESCE(MAX(ordre),0) AS maxOrdre FROM taches_mission WHERE missionId = ?', [req.params.id]);
    const [r] = await pool.query(
      `INSERT INTO taches_mission (missionId, nom, description, tempsBudgeteH, prixVenteHoraire, intervenantId, ordre)
       VALUES (?,?,?,?,?,?,?)`,
      [req.params.id, nom, description || null, tempsBudgeteH || 0, prixVenteHoraire || 0, intervenantId || null, ordre ?? (maxOrdre + 1)]
    );
    // Recalcule tempsBudgeteH de la mission
    await pool.query('UPDATE missions SET tempsBudgeteH = (SELECT COALESCE(SUM(tempsBudgeteH),0) FROM taches_mission WHERE missionId = ?), updatedAt=NOW() WHERE id = ?', [req.params.id, req.params.id]);
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

router.put('/:id/taches/:tid', verifyToken, async (req, res) => {
  const allowed = ['nom','description','tempsBudgeteH','tempsPasseH','prixVenteHoraire','intervenantId','ordre'];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.tid);
  try {
    await pool.query(`UPDATE taches_mission SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
    // Recalcule temps passé de la mission
    await pool.query('UPDATE missions SET tempsPasseH = (SELECT COALESCE(SUM(tempsPasseH),0) FROM taches_mission WHERE missionId = ?), updatedAt=NOW() WHERE id = ?', [req.params.id, req.params.id]);
    res.json({ message: 'Tâche mise à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.delete('/:id/taches/:tid', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM taches_mission WHERE id = ? AND missionId = ?', [req.params.tid, req.params.id]);
    res.json({ message: 'Tâche supprimée' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// --- Saisies de temps ---
router.get('/:id/saisies', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT st.*, CONCAT(u.prenom, ' ', u.nom) AS utilisateurNom
       FROM saisies_temps st LEFT JOIN utilisateurs u ON st.utilisateurId = u.id
       WHERE st.missionId = ? ORDER BY st.date DESC`, [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.post('/:id/saisies', verifyToken, async (req, res) => {
  // Accept utilisateur_id from body (Travaux saisie modal) or fall back to authenticated user
  const { date, dureeH, heures, description, facturable, utilisateur_id } = req.body;
  const duree = dureeH ?? heures;
  if (!date || !duree) return res.status(400).json({ message: 'Date et durée requises' });
  const userId = utilisateur_id || req.user.id;
  try {
    const [r] = await pool.query(
      `INSERT INTO saisies_temps (missionId, utilisateurId, date, dureeH, description, facturable)
       VALUES (?,?,?,?,?,?)`,
      [req.params.id, userId, date, Number(duree), description || null, facturable !== false ? 1 : 0]
    );
    // Recalcule temps passé depuis toutes les saisies
    await pool.query(
      'UPDATE missions SET tempsPasseH = (SELECT COALESCE(SUM(dureeH),0) FROM saisies_temps WHERE missionId = ?), updatedAt=NOW() WHERE id = ?',
      [req.params.id, req.params.id]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

module.exports = router;
