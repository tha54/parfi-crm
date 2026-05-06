const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { CATALOGUE, TAUX } = require('../utils/dimensionnement');

// Création et seeding de la table de config des tâches dimensionnement
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS taches_dimensionnement_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rubrique VARCHAR(200) NOT NULL,
        section VARCHAR(100) NOT NULL,
        libelle VARCHAR(200) NOT NULL,
        intervenant VARCHAR(60) NOT NULL,
        taux_specifique INT NULL,
        actif TINYINT NOT NULL DEFAULT 1,
        UNIQUE KEY uk_libelle (libelle(191))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM taches_dimensionnement_config');
    if (cnt === 0) {
      for (const t of CATALOGUE) {
        await pool.query(
          'INSERT IGNORE INTO taches_dimensionnement_config (rubrique, section, libelle, intervenant, taux_specifique) VALUES (?,?,?,?,?)',
          [t.rubrique, t.section, t.libelle, t.intervenant, t.taux_defaut ?? null]
        );
      }
    }
  } catch (e) {
    console.error('taches_dimensionnement_config init error:', e.message);
  }
})();

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
    const [rows] = await pool.query('SELECT * FROM bibliotheque_clauses WHERE actif=1 ORDER BY categorie, titre');
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── Rôles métier & taux horaires ─────────────────────────────────────────────

// GET /roles-metier
router.get('/roles-metier', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM roles_metier_config ORDER BY ordre');
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// PUT /roles-metier/:code
router.put('/roles-metier/:code', verifyToken, requireRole('expert'), async (req, res) => {
  const { taux_horaire } = req.body;
  if (taux_horaire === undefined || isNaN(parseFloat(taux_horaire))) {
    return res.status(400).json({ message: 'Taux horaire invalide' });
  }
  try {
    await pool.query(
      'UPDATE roles_metier_config SET taux_horaire = ? WHERE code = ?',
      [parseFloat(taux_horaire), req.params.code]
    );
    res.json({ message: 'Taux mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── Grille tarifaire ─────────────────────────────────────────────────────────

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

// ── CRUD bibliotheque_clauses ─────────────────────────────────────────────────

router.post('/clauses', verifyToken, requireRole('expert'), async (req, res) => {
  const { titre, categorie, contenu } = req.body;
  if (!titre || !categorie || !contenu) return res.status(400).json({ message: 'titre, categorie et contenu requis' });
  try {
    const code = 'clause_' + Date.now();
    const [r] = await pool.query(
      `INSERT INTO bibliotheque_clauses (code, titre, categorie, contenu, actif) VALUES (?, ?, ?, ?, 1)`,
      [code, titre, categorie, contenu]
    );
    res.status(201).json({ id: r.insertId, code });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

router.put('/clauses/:id', verifyToken, requireRole('expert'), async (req, res) => {
  const { titre, categorie, contenu, actif } = req.body;
  try {
    const fields = [], values = [];
    if (titre !== undefined)     { fields.push('titre = ?');     values.push(titre); }
    if (categorie !== undefined) { fields.push('categorie = ?'); values.push(categorie); }
    if (contenu !== undefined)   { fields.push('contenu = ?');   values.push(contenu); }
    if (actif !== undefined)     { fields.push('actif = ?');     values.push(actif ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE bibliotheque_clauses SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Clause mise à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.delete('/clauses/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('UPDATE bibliotheque_clauses SET actif = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Clause supprimée' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── CRUD modele_missions ──────────────────────────────────────────────────────

router.post('/modeles-missions', verifyToken, requireRole('expert'), async (req, res) => {
  const { nom, categorie, description, taches, ratioSaisie } = req.body;
  if (!nom || !categorie) return res.status(400).json({ message: 'nom et categorie requis' });
  try {
    const code = 'modele_' + Date.now();
    const [r] = await pool.query(
      `INSERT INTO modele_missions (code, nom, categorie, description, taches, ratioSaisie, actif, estModele)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
      [code, nom, categorie, description || null, taches ? JSON.stringify(taches) : null, ratioSaisie || 100]
    );
    res.status(201).json({ id: r.insertId, code });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

router.put('/modeles-missions/:id', verifyToken, requireRole('expert'), async (req, res) => {
  const { nom, categorie, description, taches, ratioSaisie, actif } = req.body;
  try {
    const fields = [], values = [];
    if (nom !== undefined)         { fields.push('nom = ?');         values.push(nom); }
    if (categorie !== undefined)   { fields.push('categorie = ?');   values.push(categorie); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (taches !== undefined)      { fields.push('taches = ?');      values.push(JSON.stringify(taches)); }
    if (ratioSaisie !== undefined) { fields.push('ratioSaisie = ?'); values.push(ratioSaisie); }
    if (actif !== undefined)       { fields.push('actif = ?');       values.push(actif ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE modele_missions SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Modèle mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.delete('/modeles-missions/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('UPDATE modele_missions SET actif = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Modèle supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── Catalogue des prestations de dimensionnement ──────────────────────────────

router.get('/taches-dim', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT *, COALESCE(taux_specifique, ?) AS taux_effectif FROM taches_dimensionnement_config WHERE actif = 1 ORDER BY rubrique, libelle',
      [42]
    );
    // Enrichir avec taux_profil (taux par défaut du profil intervenant)
    const result = rows.map(r => ({
      ...r,
      taux_profil: TAUX[r.intervenant] || 42,
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.put('/taches-dim/:id', verifyToken, requireRole('expert'), async (req, res) => {
  const { taux_specifique } = req.body;
  const val = (taux_specifique === null || taux_specifique === '' || taux_specifique === undefined)
    ? null
    : Math.max(0, parseInt(taux_specifique, 10));
  try {
    await pool.query(
      'UPDATE taches_dimensionnement_config SET taux_specifique = ? WHERE id = ?',
      [val, req.params.id]
    );
    res.json({ message: 'ok' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
