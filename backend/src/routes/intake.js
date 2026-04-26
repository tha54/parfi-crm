const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /form/:token — public, returns intake form data
router.get('/form/:token', async (req, res) => {
  try {
    const [[form]] = await pool.query(
      `SELECT * FROM intake_forms WHERE token = ?`,
      [req.params.token]
    );
    if (!form) return res.status(404).json({ message: 'Formulaire introuvable' });
    res.json(form);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /submit — public, create new intake submission
router.post('/submit', async (req, res) => {
  const { nom_societe, siren, activite, effectif, email_contact, telephone, ca_estime, besoins } = req.body;
  if (!nom_societe) return res.status(400).json({ message: 'nom_societe requis' });
  try {
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO intake_forms
         (nom_societe, siren, activite, effectif, email_contact, telephone, ca_estime, besoins, token, traite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        nom_societe,
        siren || null,
        activite || null,
        effectif || null,
        email_contact || null,
        telephone || null,
        ca_estime || null,
        besoins
          ? (typeof besoins === 'string' ? besoins : JSON.stringify(besoins))
          : null,
        token,
      ]
    );
    res.status(201).json({ token });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET / — list all intake submissions
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM intake_forms ORDER BY createdAt DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /:id/traiter — mark as treated, optionally create prospect
router.put('/:id/traiter', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[form]] = await pool.query(
      `SELECT * FROM intake_forms WHERE id = ?`,
      [req.params.id]
    );
    if (!form) return res.status(404).json({ message: 'Formulaire introuvable' });

    await pool.query(
      `UPDATE intake_forms SET traite = 1, traite_par = ?, traite_le = NOW() WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    let prospect_id = null;
    if (req.body.creer_prospect) {
      const [pr] = await pool.query(
        `INSERT INTO prospects (nom, siren, email, telephone, source, statut)
         VALUES (?, ?, ?, ?, 'intake', 'nouveau')`,
        [
          form.nom_societe,
          form.siren || null,
          form.email_contact || null,
          form.telephone || null,
        ]
      );
      prospect_id = pr.insertId;
    }

    res.json({ message: 'Formulaire traité', prospect_id });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
