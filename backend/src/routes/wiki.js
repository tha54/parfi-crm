const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — all pages ordered for tree display
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, titre, parent_id, icone, ordre, createdAt, updatedAt, modifie_par
       FROM wiki_pages
       ORDER BY ISNULL(parent_id) DESC, parent_id ASC, ordre ASC, titre ASC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /:id — single page with content
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[page]] = await pool.query(
      `SELECT wp.*, u.prenom AS modifie_prenom, u.nom AS modifie_nom
       FROM wiki_pages wp
       LEFT JOIN utilisateurs u ON wp.modifie_par = u.id
       WHERE wp.id = ?`,
      [req.params.id]
    );
    if (!page) return res.status(404).json({ message: 'Page introuvable' });
    res.json(page);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST / — create page
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { titre, contenu, parent_id, icone } = req.body;
  if (!titre) return res.status(400).json({ message: 'Titre requis' });
  try {
    const [result] = await pool.query(
      `INSERT INTO wiki_pages (titre, contenu, parent_id, icone, modifie_par)
       VALUES (?, ?, ?, ?, ?)`,
      [titre, contenu || null, parent_id || null, icone || null, req.user.id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /:id — update page
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { titre, contenu, icone, ordre } = req.body;
  try {
    const fields = ['updatedAt = NOW()', 'modifie_par = ?'];
    const values = [req.user.id];

    if (titre !== undefined) { fields.push('titre = ?'); values.push(titre); }
    if (contenu !== undefined) { fields.push('contenu = ?'); values.push(contenu); }
    if (icone !== undefined) { fields.push('icone = ?'); values.push(icone); }
    if (ordre !== undefined) { fields.push('ordre = ?'); values.push(ordre); }

    values.push(req.params.id);
    await pool.query(`UPDATE wiki_pages SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Page mise à jour' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /:id — delete page
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM wiki_pages WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Page supprimée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
