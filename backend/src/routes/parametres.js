const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — lire les paramètres cabinet
router.get('/', verifyToken, async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM parametres_cabinet ORDER BY id LIMIT 1');
    res.json(row || {});
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// PUT / — mettre à jour (expert uniquement)
router.put('/', verifyToken, requireRole('expert'), async (req, res) => {
  const allowed = ['nomCabinet','formeJuridique','siren','numeroOrdre','adresse','codePostal','ville',
    'telephone','email','siteWeb','iban','bic','tauxTva','prefixeLdm','prefixeDevis','prefixeFacture',
    'prefixeClients','brevoApiKey','emailExpediteur','nomExpediteur','delaiRelanceLdm','logoUrl'];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  try {
    const [[existing]] = await pool.query('SELECT id FROM parametres_cabinet LIMIT 1');
    if (existing) {
      values.push(existing.id);
      await pool.query(`UPDATE parametres_cabinet SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
    } else {
      const cols = allowed.filter(k => req.body[k] !== undefined);
      await pool.query(
        `INSERT INTO parametres_cabinet (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map(k => req.body[k])
      );
    }
    res.json({ message: 'Paramètres mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /modeles-missions — bibliothèque de modèles
router.get('/modeles-missions', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM modele_missions WHERE actif = 1 ORDER BY categorie, nom');
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// GET /clauses — bibliothèque de clauses
router.get('/clauses', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM clauses_bibliotheque ORDER BY type, nom');
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// GET /grille-tarifaire
router.get('/grille-tarifaire', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM grille_tarifaire WHERE actif = 1 ORDER BY categorie, libelle');
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// PUT /grille-tarifaire/:id
router.put('/grille-tarifaire/:id', verifyToken, requireRole('expert'), async (req, res) => {
  const { libelle, taux_horaire } = req.body;
  try {
    await pool.query('UPDATE grille_tarifaire SET libelle = ?, taux_horaire = ? WHERE id = ?',
      [libelle, taux_horaire, req.params.id]);
    res.json({ message: 'Taux mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST /grille-tarifaire
router.post('/grille-tarifaire', verifyToken, requireRole('expert'), async (req, res) => {
  const { categorie, libelle, taux_horaire } = req.body;
  try {
    const [r] = await pool.query(
      'INSERT INTO grille_tarifaire (categorie, libelle, taux_horaire) VALUES (?, ?, ?)',
      [categorie, libelle, taux_horaire]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// DELETE /grille-tarifaire/:id
router.delete('/grille-tarifaire/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('UPDATE grille_tarifaire SET actif = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
