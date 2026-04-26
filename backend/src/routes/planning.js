const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// Maps régime to list of TVA échéance months
function tvaMonths(regime) {
  if (regime === 'mensuel') return [1,2,3,4,5,6,7,8,9,10,11,12];
  if (regime === 'trimestriel') return [3,6,9,12];
  return [];
}

function toISO(d) { return d.toISOString().substring(0, 10); }

function generateEcheances(clientId, regime, annee) {
  const echeances = [];
  for (const m of tvaMonths(regime)) {
    const d = new Date(annee, m - 1, 20);
    const typeEnum = regime === 'mensuel' ? 'tva_mensuelle' : 'tva_trimestrielle';
    echeances.push({
      client_id: clientId, type: typeEnum,
      date_echeance: toISO(d),
      label: `TVA ${regime === 'mensuel' ? new Date(annee, m-1,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'}) : `T${Math.ceil(m/3)} ${annee}`}`,
      exercice: String(annee),
    });
  }
  // Liasse fiscale
  echeances.push({
    client_id: clientId, type: 'liasse_fiscale',
    date_echeance: `${annee}-05-31`,
    label: `Liasse fiscale ${annee}`,
    exercice: String(annee),
  });
  // Bilan
  echeances.push({
    client_id: clientId, type: 'bilan',
    date_echeance: `${annee}-06-30`,
    label: `Bilan ${annee}`,
    exercice: String(annee),
  });
  return echeances;
}

// GET /echeances
router.get('/echeances', verifyToken, async (req, res) => {
  try {
    const { client_id, statut, type, annee } = req.query;
    let where = '1=1';
    const params = [];
    if (client_id) { where += ' AND e.client_id = ?'; params.push(client_id); }
    if (statut) { where += ' AND e.statut = ?'; params.push(statut); }
    if (type) { where += ' AND e.type = ?'; params.push(type); }
    if (annee) { where += ' AND YEAR(e.date_echeance) = ?'; params.push(Number(annee)); }
    const [rows] = await pool.query(
      `SELECT e.*, c.nom AS client_nom
       FROM echeances_fiscales e
       LEFT JOIN clients c ON e.client_id = c.id
       WHERE ${where}
       ORDER BY e.date_echeance ASC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// POST /echeances/generate
router.post('/echeances/generate', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const annee = req.body.annee || new Date().getFullYear();
  try {
    const [clients] = await pool.query(
      "SELECT id, regime FROM clients WHERE actif = 1 AND regime IN ('mensuel','trimestriel','annuel')"
    );
    let created = 0;
    for (const client of clients) {
      for (const e of generateEcheances(client.id, client.regime, annee)) {
        try {
          await pool.query(
            `INSERT INTO echeances_fiscales (client_id, type, date_echeance, label, exercice, statut)
             VALUES (?,?,?,?,?,?)`,
            [e.client_id, e.type, e.date_echeance, e.label, e.exercice, 'a_faire']
          );
          created++;
        } catch (err) { if (!err.message.includes('Duplicate')) throw err; }
      }
    }
    res.json({ message: `${created} échéances générées pour ${annee}`, created });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// PUT /echeances/:id
router.put('/echeances/:id', verifyToken, async (req, res) => {
  const { statut } = req.body;
  if (!statut) return res.status(400).json({ message: 'statut requis' });
  try {
    await pool.query('UPDATE echeances_fiscales SET statut = ? WHERE id = ?', [statut, req.params.id]);
    res.json({ message: 'Mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// GET /taches
router.get('/taches', verifyToken, async (req, res) => {
  try {
    const { utilisateur_id, statut, priorite, date_debut, date_fin, limit = 200 } = req.query;
    let where = '1=1';
    const params = [];
    if (req.user.role === 'collaborateur') {
      where += ' AND t.utilisateur_id = ?'; params.push(req.user.id);
    } else if (utilisateur_id) {
      where += ' AND t.utilisateur_id = ?'; params.push(utilisateur_id);
    }
    if (statut) { where += ' AND t.statut = ?'; params.push(statut); }
    if (priorite) { where += ' AND t.priorite = ?'; params.push(priorite); }
    if (date_debut) { where += ' AND t.date_echeance >= ?'; params.push(date_debut); }
    if (date_fin) { where += ' AND t.date_echeance <= ?'; params.push(date_fin); }
    const [rows] = await pool.query(
      `SELECT t.*, c.nom AS client_nom, CONCAT(u.prenom,' ',u.nom) AS utilisateur_nom,
              m.nom AS mission_nom
       FROM taches t
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
       LEFT JOIN missions m ON t.mission_id = m.id
       WHERE ${where}
       ORDER BY FIELD(t.priorite,'urgente','haute','normale','basse'), t.date_echeance ASC
       LIMIT ?`,
      [...params, Number(limit)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /calendrier
router.get('/calendrier', verifyToken, async (req, res) => {
  try {
    const { debut, fin } = req.query;
    if (!debut || !fin) return res.status(400).json({ message: 'debut et fin requis' });
    const userCond = req.user.role === 'collaborateur' ? `AND t.utilisateur_id = ${pool.escape(req.user.id)}` : '';
    const [taches] = await pool.query(
      `SELECT t.id, COALESCE(t.titre, t.description) AS titre, t.statut, t.priorite,
              t.date_echeance AS date, c.nom AS client_nom,
              CONCAT(u.prenom,' ',u.nom) AS utilisateur_nom, 'tache' AS type_evenement
       FROM taches t
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
       WHERE t.date_echeance BETWEEN ? AND ? ${userCond}
       ORDER BY t.date_echeance`,
      [debut, fin]
    );
    const [echeances] = await pool.query(
      `SELECT e.id, e.label AS titre, e.statut, e.date_echeance AS date,
              c.nom AS client_nom, e.type, 'echeance' AS type_evenement
       FROM echeances_fiscales e
       LEFT JOIN clients c ON e.client_id = c.id
       WHERE e.date_echeance BETWEEN ? AND ?
       ORDER BY e.date_echeance`,
      [debut, fin]
    );
    res.json({ taches, echeances, total: taches.length + echeances.length });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const userCond = req.user.role === 'collaborateur'
      ? `AND utilisateur_id = ${pool.escape(req.user.id)}` : '';
    const [[stats]] = await pool.query(`
      SELECT
        SUM(CASE WHEN statut IN ('a_faire','en_cours') AND date_echeance < CURDATE() THEN 1 ELSE 0 END) AS en_retard,
        SUM(CASE WHEN statut = 'a_faire' AND date_echeance = CURDATE() THEN 1 ELSE 0 END) AS aujourd_hui,
        SUM(CASE WHEN statut = 'a_faire' AND date_echeance BETWEEN DATE_ADD(CURDATE(),INTERVAL 1 DAY) AND DATE_ADD(CURDATE(),INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS cette_semaine,
        SUM(CASE WHEN statut = 'termine' THEN 1 ELSE 0 END) AS terminees,
        COUNT(*) AS total
      FROM taches WHERE 1=1 ${userCond}
    `);
    const [[ech]] = await pool.query(`
      SELECT
        SUM(CASE WHEN statut='a_faire' AND date_echeance < CURDATE() THEN 1 ELSE 0 END) AS echeances_retard,
        SUM(CASE WHEN statut='a_faire' AND date_echeance BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS echeances_semaine
      FROM echeances_fiscales
    `);
    res.json({ ...stats, ...ech });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

module.exports = router;
