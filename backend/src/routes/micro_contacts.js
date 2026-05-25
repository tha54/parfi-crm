const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// ─── GET /api/micro-contacts?micro_client_id=X ───────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  const { micro_client_id } = req.query;
  if (!micro_client_id) return res.status(400).json({ error: 'micro_client_id requis' });
  try {
    const [rows] = await pool.query(
      `SELECT * FROM micro_contacts WHERE micro_client_id = ? ORDER BY nom, prenom`,
      [micro_client_id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/micro-contacts ─────────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const { micro_client_id, nom, prenom, societe, siren, email, telephone, adresse } = req.body;
  if (!micro_client_id || !nom) return res.status(400).json({ error: 'micro_client_id et nom requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO micro_contacts (micro_client_id, nom, prenom, societe, siren, email, telephone, adresse)
       VALUES (?,?,?,?,?,?,?,?)`,
      [micro_client_id, nom, prenom, societe, siren, email, telephone, adresse]
    );
    const [[contact]] = await pool.query('SELECT * FROM micro_contacts WHERE id = ?', [r.insertId]);
    res.status(201).json(contact);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /api/micro-contacts/:id ──────────────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const { nom, prenom, societe, siren, email, telephone, adresse } = req.body;
  try {
    await pool.query(
      `UPDATE micro_contacts SET nom=?, prenom=?, societe=?, siren=?, email=?, telephone=?, adresse=?
       WHERE id=?`,
      [nom, prenom, societe, siren, email, telephone, adresse, req.params.id]
    );
    const [[contact]] = await pool.query('SELECT * FROM micro_contacts WHERE id = ?', [req.params.id]);
    res.json(contact);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /api/micro-contacts/:id ──────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    // Vérifier qu'aucun devis/facture ne référence ce contact
    const [[{ n }]] = await pool.query(
      `SELECT (SELECT COUNT(*) FROM micro_devis WHERE contact_id = ?) +
              (SELECT COUNT(*) FROM micro_factures WHERE contact_id = ?) AS n`,
      [req.params.id, req.params.id]
    );
    if (n > 0) return res.status(409).json({ error: 'Contact utilisé dans des devis ou factures' });
    await pool.query('DELETE FROM micro_contacts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
