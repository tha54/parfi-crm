const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/prospects
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*,
              u.prenom AS cree_par_prenom, u.nom AS cree_par_nom
       FROM prospects p
       LEFT JOIN utilisateurs u ON u.id = p.cree_par
       ORDER BY p.cree_le DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/prospects/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Prospect introuvable' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/prospects
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const {
    nom, siren, siret, forme_juridique, adresse, code_postal, ville,
    capital, code_naf, activite, date_creation_ent,
    email, telephone,
    contact_nom, contact_prenom, contact_email, contact_telephone,
    notes, statut, source,
  } = req.body;

  if (!nom?.trim()) return res.status(400).json({ message: 'Le nom est requis' });

  try {
    const [result] = await pool.query(
      `INSERT INTO prospects
         (nom, siren, siret, forme_juridique, adresse, code_postal, ville,
          capital, code_naf, activite, date_creation_ent,
          email, telephone,
          contact_nom, contact_prenom, contact_email, contact_telephone,
          notes, statut, source, cree_par)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        nom.trim(),
        siren  || null, siret  || null, forme_juridique || null,
        adresse || null, code_postal || null, ville || null,
        capital || null, code_naf || null, activite || null, date_creation_ent || null,
        email || null, telephone || null,
        contact_nom || null, contact_prenom || null,
        contact_email || null, contact_telephone || null,
        notes || null, statut || 'nouveau', source || null,
        req.user.id,
      ]
    );
    const [[created]] = await pool.query('SELECT * FROM prospects WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/prospects/:id
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const FIELDS = [
    'nom', 'siren', 'siret', 'forme_juridique', 'adresse', 'code_postal', 'ville',
    'capital', 'code_naf', 'activite', 'date_creation_ent',
    'email', 'telephone',
    'contact_nom', 'contact_prenom', 'contact_email', 'contact_telephone',
    'notes', 'statut', 'source',
  ];

  const updates = [];
  const values = [];
  for (const f of FIELDS) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[f] === '' ? null : req.body[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });

  values.push(req.params.id);
  try {
    await pool.query(`UPDATE prospects SET ${updates.join(', ')} WHERE id = ?`, values);
    const [[updated]] = await pool.query('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/prospects/:id
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    const [[p]] = await pool.query('SELECT id FROM prospects WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ message: 'Prospect introuvable' });
    await pool.query('DELETE FROM prospects WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/prospects/:id/convertir  →  crée un client depuis le prospect
router.post('/:id/convertir', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { type, regime } = req.body;
  if (!type || !regime) return res.status(400).json({ message: 'Type et régime TVA requis' });

  try {
    const [[p]] = await pool.query('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ message: 'Prospect introuvable' });
    if (p.statut === 'converti') return res.status(400).json({ message: 'Ce prospect est déjà converti en client' });

    const [result] = await pool.query(
      'INSERT INTO clients (nom, siren, type, regime) VALUES (?, ?, ?, ?)',
      [p.nom, p.siren || null, type, regime]
    );

    await pool.query(
      'UPDATE prospects SET statut = ?, client_id = ? WHERE id = ?',
      ['converti', result.insertId, p.id]
    );

    const [[client]] = await pool.query('SELECT * FROM clients WHERE id = ?', [result.insertId]);
    res.status(201).json({ client, prospect_id: p.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
