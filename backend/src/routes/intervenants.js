const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — liste des intervenants
router.get('/', verifyToken, async (req, res) => {
  try {
    const { actif } = req.query;
    let where = '1=1';
    const params = [];
    if (actif !== undefined) { where += ' AND actif = ?'; params.push(actif === 'true' ? 1 : 0); }
    const [rows] = await pool.query(
      `SELECT i.*, COUNT(m.id) AS nbMissions
       FROM intervenants i
       LEFT JOIN missions m ON m.intervenantId = i.id AND m.statut = 'en_cours'
       WHERE ${where}
       GROUP BY i.id
       ORDER BY i.nom`, params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /:id — portefeuille d'un intervenant
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[iv]] = await pool.query('SELECT * FROM intervenants WHERE id = ?', [req.params.id]);
    if (!iv) return res.status(404).json({ message: 'Intervenant introuvable' });
    const [missions] = await pool.query(
      `SELECT m.*, c.raisonSociale AS contactNom FROM missions m
       LEFT JOIN contacts c ON m.contactId = c.id
       WHERE m.intervenantId = ? AND m.statut = 'en_cours'`, [req.params.id]
    );
    const [contacts] = await pool.query(
      `SELECT c.* FROM contacts c WHERE c.intervenantId = ?`, [req.params.id]
    );
    const totalBudget = missions.reduce((s, m) => s + Number(m.honorairesBudgetes || 0), 0);
    const totalTempsBudgete = missions.reduce((s, m) => s + Number(m.tempsBudgeteH || 0), 0);
    const totalTempsPasse = missions.reduce((s, m) => s + Number(m.tempsPasseH || 0), 0);
    res.json({
      ...iv, missions, contacts,
      stats: {
        nbMissions: missions.length,
        nbContacts: contacts.length,
        totalBudget,
        totalTempsBudgete,
        totalTempsPasse,
        tauxUtilisation: totalTempsBudgete > 0 ? Math.round((totalTempsPasse / totalTempsBudgete) * 100) : 0
      }
    });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// POST / — créer un intervenant (expert uniquement)
router.post('/', verifyToken, requireRole('expert'), async (req, res) => {
  const { code, civilite, nom, prenom, categorie, prixRevient, prixVente, utilisateurId } = req.body;
  if (!nom || !categorie) return res.status(400).json({ message: 'Nom et catégorie requis' });
  try {
    const autoCode = code || `INT${Date.now().toString().slice(-4)}`;
    const [r] = await pool.query(
      `INSERT INTO intervenants (code, civilite, nom, prenom, categorie, prixRevient, prixVente, utilisateurId)
       VALUES (?,?,?,?,?,?,?,?)`,
      [autoCode, civilite || 'M.', nom, prenom || null, categorie, prixRevient || 0, prixVente || 0, utilisateurId || null]
    );
    res.status(201).json({ id: r.insertId, code: autoCode });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// PUT /:id — mettre à jour
router.put('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  const allowed = ['code','civilite','nom','prenom','categorie','prixRevient','prixVente','actif','utilisateurId'];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE intervenants SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
    res.json({ message: 'Intervenant mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// DELETE /:id — désactiver (ne pas supprimer pour garder l'historique)
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('UPDATE intervenants SET actif = 0, updatedAt = NOW() WHERE id = ?', [req.params.id]);
    res.json({ message: 'Intervenant désactivé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
