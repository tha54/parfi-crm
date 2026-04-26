const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const INTERNAL_SECRET = 'parfi2024';

// GET / — notifications for req.user.id, newest first, limit 50
router.get('/', verifyToken, async (req, res) => {
  try {
    const [notifications] = await pool.query(
      `SELECT * FROM notifications WHERE utilisateur_id = ? ORDER BY createdAt DESC LIMIT 50`,
      [req.user.id]
    );
    const [[{ non_lues }]] = await pool.query(
      `SELECT COUNT(*) AS non_lues FROM notifications WHERE utilisateur_id = ? AND lue = 0`,
      [req.user.id]
    );
    res.json({ notifications, non_lues });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /:id/lire — mark one as read
router.put('/:id/lire', verifyToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET lue = 1 WHERE id = ? AND utilisateur_id = ?`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Notification marquée comme lue' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /lire-tout — mark all as read for current user
router.put('/lire-tout', verifyToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET lue = 1 WHERE utilisateur_id = ?`,
      [req.user.id]
    );
    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /:id — delete one notification
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM notifications WHERE id = ? AND utilisateur_id = ?`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Notification supprimée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /internal — internal use only, no auth, check X-Internal header
router.post('/internal', async (req, res) => {
  if (req.headers['x-internal'] !== INTERNAL_SECRET) {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  const { utilisateur_id, type, titre, message, lien, meta } = req.body;
  if (!utilisateur_id || !type || !titre) {
    return res.status(400).json({ message: 'utilisateur_id, type, titre requis' });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, meta, lue)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [utilisateur_id, type, titre, message || null, lien || null,
       meta ? (typeof meta === 'string' ? meta : JSON.stringify(meta)) : null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
