const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — liste des attributions avec filtre optionnel ?client_id= ou ?utilisateur_id=
router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id, utilisateur_id } = req.query;
    let where = '1=1';
    const params = [];
    if (client_id) { where += ' AND a.client_id = ?'; params.push(client_id); }
    if (utilisateur_id) { where += ' AND a.utilisateur_id = ?'; params.push(utilisateur_id); }
    const [rows] = await pool.query(
      `SELECT a.*, u.nom, u.prenom, u.email, u.role
       FROM attributions a JOIN utilisateurs u ON a.utilisateur_id = u.id
       WHERE ${where}
       ORDER BY a.role_sur_dossier DESC`,
      params
    );
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Get attributions for a client (legacy path)
router.get('/client/:clientId', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, u.nom, u.prenom, u.email, u.role
       FROM attributions a JOIN utilisateurs u ON a.utilisateur_id = u.id
       WHERE a.client_id = ?`,
      [req.params.clientId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Get all clients for a user
router.get('/utilisateur/:userId', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, c.nom AS client_nom, c.siren, c.type, c.regime
       FROM attributions a JOIN clients c ON a.client_id = c.id
       WHERE a.utilisateur_id = ? AND c.actif = 1`,
      [req.params.userId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Assign collaborator to client
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { client_id, utilisateur_id, role_sur_dossier } = req.body;
  if (!client_id || !utilisateur_id || !role_sur_dossier) {
    return res.status(400).json({ message: 'client_id, utilisateur_id et role_sur_dossier requis' });
  }
  try {
    const [existing] = await pool.query(
      'SELECT id FROM attributions WHERE client_id = ? AND utilisateur_id = ?',
      [client_id, utilisateur_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Attribution déjà existante' });
    }
    const [result] = await pool.query(
      'INSERT INTO attributions (client_id, utilisateur_id, role_sur_dossier) VALUES (?, ?, ?)',
      [client_id, utilisateur_id, role_sur_dossier]
    );
    res.status(201).json({ id: result.insertId, client_id, utilisateur_id, role_sur_dossier });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Update attribution role
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { role_sur_dossier } = req.body;
  try {
    await pool.query('UPDATE attributions SET role_sur_dossier = ? WHERE id = ?', [role_sur_dossier, req.params.id]);
    res.json({ message: 'Attribution mise à jour' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Remove attribution
router.delete('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    await pool.query('DELETE FROM attributions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Attribution supprimée' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
