'use strict';
/**
 * DEV_USER_SWITCH — route unique : POST /api/dev-user-switch/as
 *
 * Émet un JWT signé avec les mêmes claims que /api/auth/login pour l'un des
 * 3 comptes de démo (voir demo-users.js). Aucun mot de passe requis.
 *
 * Ce fichier N'EST PAS chargé en production : install.js vérifie NODE_ENV
 * avant même de faire le require(). En complément, le fichier est absent de
 * l'artefact de déploiement (voir .gitattributes / documentation).
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { DEMO_USERS } = require('./demo-users');

const router = express.Router();

router.post('/as', async (req, res) => {
  const { user: key } = req.body || {};
  const target = DEMO_USERS.find(u => u.key === key);
  if (!target) {
    return res.status(400).json({ message: 'DEV_USER_SWITCH: clé utilisateur inconnue', keys: DEMO_USERS.map(u => u.key) });
  }
  try {
    // Sélection identique à /api/auth/login (aucun champ supplémentaire).
    // Le grade est une info du lot 3 non requise pour l'émission du JWT.
    const [rows] = await pool.query(
      `SELECT id, email, role, role_metier, nom, prenom
         FROM utilisateurs WHERE email = ? AND actif = 1 LIMIT 1`,
      [target.email]
    );
    if (!rows.length) {
      return res.status(404).json({
        message: `DEV_USER_SWITCH: compte de démo ${target.email} absent. Lancer node src/migrations/chantier3-07-seed-demo-users.js --db parfi`,
      });
    }
    const u = rows[0];
    const token = jwt.sign(
      { id: u.id, email: u.email, role: u.role, role_metier: u.role_metier, nom: u.nom, prenom: u.prenom },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );
    res.json({
      token,
      user: { id: u.id, email: u.email, role: u.role, role_metier: u.role_metier, nom: u.nom, prenom: u.prenom },
    });
  } catch (err) {
    console.error('[DEV_USER_SWITCH]', err.message);
    res.status(500).json({ message: 'DEV_USER_SWITCH: erreur serveur' });
  }
});

module.exports = router;
