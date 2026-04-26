const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /tache/:tacheId — all comments for a task, JOIN utilisateurs
router.get('/tache/:tacheId', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tc.*, u.nom, u.prenom, u.email
       FROM tache_commentaires tc
       LEFT JOIN utilisateurs u ON tc.utilisateur_id = u.id
       WHERE tc.tache_id = ?
       ORDER BY tc.createdAt ASC`,
      [req.params.tacheId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /tache/:tacheId — create comment, notify mentions
router.post('/tache/:tacheId', verifyToken, async (req, res) => {
  const { contenu, mentions } = req.body;
  if (!contenu) return res.status(400).json({ message: 'Contenu requis' });
  try {
    const mentionsJson = mentions && mentions.length
      ? JSON.stringify(mentions)
      : null;
    const [result] = await pool.query(
      `INSERT INTO tache_commentaires (tache_id, utilisateur_id, contenu, mentions)
       VALUES (?, ?, ?, ?)`,
      [req.params.tacheId, req.user.id, contenu, mentionsJson]
    );

    // Notify each mentioned user
    if (mentions && mentions.length) {
      const prenom = req.user.prenom || req.user.nom || 'Quelqu\'un';
      for (const uid of mentions) {
        if (uid === req.user.id) continue;
        await pool.query(
          `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
           VALUES (?, 'mention', 'Vous avez été mentionné', ?, '/taches', 0)`,
          [uid, `${prenom} vous a mentionné dans une tâche`]
        );
      }
    }

    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /:id — edit comment (author only)
router.put('/:id', verifyToken, async (req, res) => {
  const { contenu } = req.body;
  if (!contenu) return res.status(400).json({ message: 'Contenu requis' });
  try {
    const [[comment]] = await pool.query(
      `SELECT * FROM tache_commentaires WHERE id = ?`,
      [req.params.id]
    );
    if (!comment) return res.status(404).json({ message: 'Commentaire introuvable' });
    if (comment.utilisateur_id !== req.user.id) {
      return res.status(403).json({ message: 'Modification réservée à l\'auteur' });
    }
    await pool.query(
      `UPDATE tache_commentaires SET contenu = ?, updatedAt = NOW() WHERE id = ?`,
      [contenu, req.params.id]
    );
    res.json({ message: 'Commentaire mis à jour' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /:id — author or expert/chef_mission
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const [[comment]] = await pool.query(
      `SELECT * FROM tache_commentaires WHERE id = ?`,
      [req.params.id]
    );
    if (!comment) return res.status(404).json({ message: 'Commentaire introuvable' });

    const isAuthor = comment.utilisateur_id === req.user.id;
    const isPrivileged = ['expert', 'chef_mission'].includes(req.user.role);

    if (!isAuthor && !isPrivileged) {
      return res.status(403).json({ message: 'Suppression réservée à l\'auteur ou à un expert' });
    }
    await pool.query(`DELETE FROM tache_commentaires WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Commentaire supprimé' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
