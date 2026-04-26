const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — liste des documents
router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id, type, limit = 50 } = req.query;
    let where = '1=1';
    const params = [];
    if (client_id) { where += ' AND d.client_id = ?'; params.push(client_id); }
    if (type) { where += ' AND d.type = ?'; params.push(type); }
    const [rows] = await pool.query(
      `SELECT d.*, c.nom AS client_nom, CONCAT(u.prenom,' ',u.nom) AS uploade_par_nom
       FROM documents d
       LEFT JOIN clients c ON d.client_id = c.id
       LEFT JOIN utilisateurs u ON d.uploadePar = u.id
       WHERE ${where}
       ORDER BY d.createdAt DESC
       LIMIT ?`,
      [...params, Number(limit)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      `SELECT d.*, c.nom AS client_nom FROM documents d
       LEFT JOIN clients c ON d.client_id = c.id
       WHERE d.id = ?`, [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'Document introuvable' });
    res.json(row);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST / — enregistrer un document (metadata seulement, fichier géré côté client)
router.post('/', verifyToken, async (req, res) => {
  const { client_id, nom, type, cheminFichier, taille, mimeType, tags } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO documents (client_id, nom, type, cheminFichier, taille, mimeType, tags, uploadePar)
       VALUES (?,?,?,?,?,?,?,?)`,
      [client_id || null, nom, type || 'autre', cheminFichier || null,
       taille || null, mimeType || null, tags ? JSON.stringify(tags) : null, req.user.id]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// PUT /:id — mettre à jour les métadonnées
router.put('/:id', verifyToken, async (req, res) => {
  const { nom, type, tags, statut } = req.body;
  const fields = [], values = [];
  if (nom !== undefined) { fields.push('nom = ?'); values.push(nom); }
  if (type !== undefined) { fields.push('type = ?'); values.push(type); }
  if (tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(tags)); }
  if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// DELETE /:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
