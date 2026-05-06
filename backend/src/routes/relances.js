const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const NIVEAU_MAP = { 1: 'amiable_1', 2: 'amiable_2', 3: 'formelle' };

// GET /en-retard — factures impayées dont l'échéance est dépassée
router.get('/en-retard', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*,
        COALESCE(c.raisonSociale, cl.nom) AS clientNom,
        COALESCE(c.emailDirigeant, c.email) AS emailDirigeant,
        DATEDIFF(NOW(), f.dateEcheance) AS joursRetard,
        (f.totalTTC - f.montantPaye) AS resteARegler
       FROM factures f
       LEFT JOIN contacts c ON f.contactId = c.id
       LEFT JOIN clients cl ON f.client_id = cl.id
       WHERE f.statut IN ('retard','envoyee')
         AND f.dateEcheance IS NOT NULL
         AND f.dateEcheance < NOW()
         AND (f.totalTTC - f.montantPaye) > 0
       ORDER BY f.dateEcheance ASC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET / — historique des relances
router.get('/', verifyToken, async (req, res) => {
  try {
    const { factureId } = req.query;
    let where = '1=1';
    const params = [];
    if (factureId) { where += ' AND r.factureId = ?'; params.push(factureId); }
    const [rows] = await pool.query(
      `SELECT r.*, f.numero AS factureNumero FROM relances r
       LEFT JOIN factures f ON r.factureId = f.id
       WHERE ${where}
       ORDER BY r.createdAt DESC`, params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST / — enregistrer une relance
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { factureId, niveau, emailDestinataire, montantRelance, notes } = req.body;
  if (!factureId || !niveau) return res.status(400).json({ message: 'factureId et niveau requis' });
  const niveauEnum = NIVEAU_MAP[Number(niveau)] || 'amiable_1';
  try {
    const [r] = await pool.query(
      `INSERT INTO relances (factureId, niveau, emailDestinataire, montantRelance, niveauNum, notes, dateRelance)
       VALUES (?,?,?,?,?,?,NOW())`,
      [factureId, niveauEnum, emailDestinataire || null, montantRelance || null, Number(niveau), notes || null]
    );
    await pool.query(
      'UPDATE factures SET nbRelances = COALESCE(nbRelances,0) + 1, derniereRelance = NOW(), updatedAt = NOW() WHERE id = ?',
      [factureId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// ── Config relances automatiques ──────────────────────────────────────────────

// GET /config-auto
router.get('/config-auto', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, f.numero AS facture_numero, f.totalTTC AS facture_ttc, cl.nom AS client_nom
       FROM config_relances_auto c
       LEFT JOIN factures f ON c.factureId = f.id
       LEFT JOIN clients cl ON f.client_id = cl.id
       ORDER BY c.createdAt DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST /config-auto — créer ou mettre à jour (ON DUPLICATE KEY sur factureId)
router.post('/config-auto', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { factureId, joursRelance1 = 30, joursRelance2 = 60, joursRelanceFormelle = 90, actif = 1 } = req.body;
  if (!factureId) return res.status(400).json({ message: 'factureId requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO config_relances_auto (factureId, joursRelance1, joursRelance2, joursRelanceFormelle, actif)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         joursRelance1=VALUES(joursRelance1), joursRelance2=VALUES(joursRelance2),
         joursRelanceFormelle=VALUES(joursRelanceFormelle), actif=VALUES(actif)`,
      [factureId, joursRelance1, joursRelance2, joursRelanceFormelle, actif ? 1 : 0]
    );
    res.status(201).json({ id: r.insertId || r.affectedRows });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// PUT /config-auto/:id
router.put('/config-auto/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { joursRelance1, joursRelance2, joursRelanceFormelle, actif } = req.body;
  try {
    const fields = [], values = [];
    if (joursRelance1 !== undefined) { fields.push('joursRelance1 = ?'); values.push(joursRelance1); }
    if (joursRelance2 !== undefined) { fields.push('joursRelance2 = ?'); values.push(joursRelance2); }
    if (joursRelanceFormelle !== undefined) { fields.push('joursRelanceFormelle = ?'); values.push(joursRelanceFormelle); }
    if (actif !== undefined) { fields.push('actif = ?'); values.push(actif ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE config_relances_auto SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Config mise à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// DELETE /config-auto/:id
router.delete('/config-auto/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    await pool.query('DELETE FROM config_relances_auto WHERE id = ?', [req.params.id]);
    res.json({ message: 'Configuration supprimée' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
