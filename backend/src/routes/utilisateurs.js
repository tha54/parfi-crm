const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// List all users — expert & chef only
router.get('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nom, prenom, email, role, actif, cree_le FROM utilisateurs ORDER BY nom'
    );
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Get one user
router.get('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nom, prenom, email, role, actif, cree_le FROM utilisateurs WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Create user — expert only
router.post('/', verifyToken, requireRole('expert'), async (req, res) => {
  const { nom, prenom, email, mot_de_passe, role } = req.body;
  if (!nom || !prenom || !email || !mot_de_passe || !role) {
    return res.status(400).json({ message: 'Tous les champs sont requis' });
  }
  const validRoles = ['expert', 'chef_mission', 'collaborateur'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Rôle invalide' });
  }
  try {
    const hash = await bcrypt.hash(mot_de_passe, 12);
    const [result] = await pool.query(
      'INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role) VALUES (?, ?, ?, ?, ?)',
      [nom, prenom, email, hash, role]
    );
    res.status(201).json({ id: result.insertId, nom, prenom, email, role });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Update user — expert only
router.put('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  const { nom, prenom, email, role, actif, mot_de_passe } = req.body;
  try {
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nom); }
    if (prenom !== undefined) { fields.push('prenom = ?'); values.push(prenom); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (role !== undefined) { fields.push('role = ?'); values.push(role); }
    if (actif !== undefined) { fields.push('actif = ?'); values.push(actif); }
    if (mot_de_passe) {
      const hash = await bcrypt.hash(mot_de_passe, 12);
      fields.push('mot_de_passe = ?');
      values.push(hash);
    }
    if (fields.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    values.push(req.params.id);
    await pool.query(`UPDATE utilisateurs SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Utilisateur mis à jour' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Delete (deactivate) user — expert only
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ message: 'Impossible de se supprimer soi-même' });
  }
  try {
    await pool.query('UPDATE utilisateurs SET actif = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Utilisateur désactivé' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
