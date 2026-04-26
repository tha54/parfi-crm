const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

router.post('/login', async (req, res) => {
  const { email, mot_de_passe } = req.body;
  if (!email || !mot_de_passe) {
    return res.status(400).json({ message: 'Email et mot de passe requis' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT * FROM utilisateurs WHERE email = ? AND actif = 1',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Identifiants incorrects' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!valid) {
      return res.status(401).json({ message: 'Identifiants incorrects' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom }
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Déconnecté' });
});

module.exports = router;
