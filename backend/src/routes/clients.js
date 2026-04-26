const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// List clients — based on role
router.get('/', verifyToken, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'expert' || req.user.role === 'chef_mission') {
      [rows] = await pool.query(
        `SELECT c.*,
          GROUP_CONCAT(DISTINCT CONCAT(u.prenom, ' ', u.nom) ORDER BY u.nom SEPARATOR ', ') AS collaborateurs
         FROM clients c
         LEFT JOIN attributions a ON c.id = a.client_id
         LEFT JOIN utilisateurs u ON a.utilisateur_id = u.id
         WHERE c.actif = 1
         GROUP BY c.id
         ORDER BY c.nom`
      );
    } else {
      [rows] = await pool.query(
        `SELECT c.*,
          GROUP_CONCAT(DISTINCT CONCAT(u.prenom, ' ', u.nom) ORDER BY u.nom SEPARATOR ', ') AS collaborateurs
         FROM clients c
         JOIN attributions a ON c.id = a.client_id
         LEFT JOIN utilisateurs u2 ON a.utilisateur_id = u2.id
         LEFT JOIN attributions a2 ON c.id = a2.client_id
         LEFT JOIN utilisateurs u ON a2.utilisateur_id = u.id
         WHERE c.actif = 1 AND a.utilisateur_id = ?
         GROUP BY c.id
         ORDER BY c.nom`,
        [req.user.id]
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Get one client with attributions
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [clients] = await pool.query('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (clients.length === 0) return res.status(404).json({ message: 'Client introuvable' });
    const [attributions] = await pool.query(
      `SELECT a.*, u.nom, u.prenom, u.email, u.role
       FROM attributions a JOIN utilisateurs u ON a.utilisateur_id = u.id
       WHERE a.client_id = ?`,
      [req.params.id]
    );
    res.json({ ...clients[0], attributions });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Create client — expert & chef_mission
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { nom, siren, type, regime } = req.body;
  if (!nom || !type || !regime) {
    return res.status(400).json({ message: 'Nom, type et régime requis' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO clients (nom, siren, type, regime) VALUES (?, ?, ?, ?)',
      [nom, siren || null, type, regime]
    );
    res.status(201).json({ id: result.insertId, nom, siren, type, regime });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Update client — expert & chef_mission
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { nom, siren, type, regime, actif } = req.body;
  try {
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nom); }
    if (siren !== undefined) { fields.push('siren = ?'); values.push(siren); }
    if (type !== undefined) { fields.push('type = ?'); values.push(type); }
    if (regime !== undefined) { fields.push('regime = ?'); values.push(regime); }
    if (actif !== undefined) { fields.push('actif = ?'); values.push(actif); }
    if (fields.length === 0) return res.status(400).json({ message: 'Aucun champ à modifier' });
    values.push(req.params.id);
    await pool.query(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Client mis à jour' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Delete client — expert only
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('UPDATE clients SET actif = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Client désactivé' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
