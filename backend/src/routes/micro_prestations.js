const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// ─── GET /api/micro-prestations?micro_client_id=X ────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  const { micro_client_id } = req.query;
  if (!micro_client_id) return res.status(400).json({ error: 'micro_client_id requis' });
  try {
    const [rows] = await pool.query(
      `SELECT * FROM micro_prestations WHERE micro_client_id = ? ORDER BY libelle`,
      [micro_client_id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/micro-prestations ─────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const { micro_client_id, libelle, description, unite, prix_unitaire } = req.body;
  if (!micro_client_id || !libelle || prix_unitaire == null) {
    return res.status(400).json({ error: 'micro_client_id, libelle et prix_unitaire requis' });
  }
  try {
    const [r] = await pool.query(
      `INSERT INTO micro_prestations (micro_client_id, libelle, description, unite, prix_unitaire)
       VALUES (?,?,?,?,?)`,
      [micro_client_id, libelle, description, unite || 'forfait', prix_unitaire]
    );
    const [[p]] = await pool.query('SELECT * FROM micro_prestations WHERE id = ?', [r.insertId]);
    res.status(201).json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /api/micro-prestations/:id ──────────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const { libelle, description, unite, prix_unitaire } = req.body;
  try {
    await pool.query(
      `UPDATE micro_prestations SET libelle=?, description=?, unite=?, prix_unitaire=? WHERE id=?`,
      [libelle, description, unite, prix_unitaire, req.params.id]
    );
    const [[p]] = await pool.query('SELECT * FROM micro_prestations WHERE id = ?', [req.params.id]);
    res.json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /api/micro-prestations/:id ───────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM micro_prestations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
