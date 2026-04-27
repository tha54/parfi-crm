const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// French public holidays computation
function getFeries(year) {
  const feries = [];
  // Fixed dates
  feries.push({ date: `${year}-01-01`, nom: 'Jour de l\'An' });
  feries.push({ date: `${year}-05-01`, nom: 'Fête du Travail' });
  feries.push({ date: `${year}-05-08`, nom: 'Victoire 1945' });
  feries.push({ date: `${year}-07-14`, nom: 'Fête Nationale' });
  feries.push({ date: `${year}-08-15`, nom: 'Assomption' });
  feries.push({ date: `${year}-11-01`, nom: 'Toussaint' });
  feries.push({ date: `${year}-11-11`, nom: 'Armistice' });
  feries.push({ date: `${year}-12-25`, nom: 'Noël' });

  // Easter-based (Gauss algorithm)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);

  const pad = n => String(n).padStart(2, '0');
  const addDays = (base, n) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  feries.push({ date: addDays(easter, 1),  nom: 'Lundi de Pâques' });
  feries.push({ date: addDays(easter, 39), nom: 'Ascension' });
  feries.push({ date: addDays(easter, 50), nom: 'Lundi de Pentecôte' });

  return feries.map(f => ({ ...f, annee: year }));
}

// Init jours_feries for current + next year
async function initFeries() {
  const years = [new Date().getFullYear(), new Date().getFullYear() + 1];
  for (const y of years) {
    const feries = getFeries(y);
    for (const f of feries) {
      await pool.query(
        `INSERT IGNORE INTO jours_feries (date, nom, annee) VALUES (?,?,?)`,
        [f.date, f.nom, f.annee]
      ).catch(() => {});
    }
  }
}
initFeries();

// GET /api/absences — list absences
router.get('/', verifyToken, async (req, res) => {
  try {
    const isExpertOrChef = ['expert', 'chef_mission'].includes(req.user.role);
    const where = isExpertOrChef ? '' : 'WHERE a.utilisateur_id = ?';
    const params = isExpertOrChef ? [] : [req.user.id];

    const [rows] = await pool.query(
      `SELECT a.*, u.prenom, u.nom AS user_nom,
              v.prenom AS valideur_prenom, v.nom AS valideur_nom
       FROM absences a
       JOIN utilisateurs u ON a.utilisateur_id = u.id
       LEFT JOIN utilisateurs v ON a.valide_par = v.id
       ${where}
       ORDER BY a.date_debut DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/absences — create absence request
router.post('/', verifyToken, async (req, res) => {
  const { utilisateur_id, type, date_debut, date_fin, nb_jours, commentaire } = req.body;
  const userId = utilisateur_id || req.user.id;

  if (!type || !date_debut || !date_fin) {
    return res.status(400).json({ message: 'Type et dates requis' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO absences (utilisateur_id, type, date_debut, date_fin, nb_jours, commentaire)
       VALUES (?,?,?,?,?,?)`,
      [userId, type, date_debut, date_fin, nb_jours || 1, commentaire || null]
    );

    // Notify expert
    const [[expert]] = await pool.query(
      `SELECT id FROM utilisateurs WHERE role='expert' AND actif=1 LIMIT 1`
    );
    if (expert && req.user.id !== expert.id) {
      const [[requester]] = await pool.query(
        `SELECT prenom, nom FROM utilisateurs WHERE id=?`, [userId]
      );
      await pool.query(
        `INSERT INTO notifications (utilisateur_id, type, titre, message, lien)
         VALUES (?,?,?,?,?)`,
        [expert.id, 'absence',
         `Demande de congé — ${requester?.prenom} ${requester?.nom}`,
         `${type} du ${date_debut} au ${date_fin}`,
         `/mon-espace`]
      ).catch(() => {});
    }

    const [[created]] = await pool.query('SELECT * FROM absences WHERE id=?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/absences/:id/valider — validate or refuse
router.put('/:id/valider', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { statut } = req.body;
  if (!['validee', 'refusee'].includes(statut)) {
    return res.status(400).json({ message: 'Statut invalide' });
  }

  try {
    await pool.query(
      `UPDATE absences SET statut=?, valide_par=? WHERE id=?`,
      [statut, req.user.id, req.params.id]
    );

    const [[abs]] = await pool.query('SELECT * FROM absences WHERE id=?', [req.params.id]);

    // Notify the requester
    await pool.query(
      `INSERT INTO notifications (utilisateur_id, type, titre, message, lien)
       VALUES (?,?,?,?,?)`,
      [abs.utilisateur_id, 'absence',
       statut === 'validee' ? 'Congé validé' : 'Congé refusé',
       `Votre demande du ${abs.date_debut} au ${abs.date_fin} a été ${statut === 'validee' ? 'acceptée' : 'refusée'}`,
       `/mon-espace`]
    ).catch(() => {});

    res.json(abs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/absences/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const [[abs]] = await pool.query('SELECT * FROM absences WHERE id=?', [req.params.id]);
    if (!abs) return res.status(404).json({ message: 'Absence introuvable' });
    if (abs.utilisateur_id !== req.user.id && req.user.role !== 'expert') {
      return res.status(403).json({ message: 'Non autorisé' });
    }
    if (abs.statut === 'validee') {
      return res.status(400).json({ message: 'Impossible de supprimer une absence validée' });
    }
    await pool.query('DELETE FROM absences WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/absences/feries — list jours feries
router.get('/feries', verifyToken, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const [rows] = await pool.query(
      'SELECT * FROM jours_feries WHERE annee=? ORDER BY date', [year]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
