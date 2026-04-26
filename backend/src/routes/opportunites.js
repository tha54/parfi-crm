const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — liste des opportunités avec stats
router.get('/', verifyToken, async (req, res) => {
  try {
    const { statut, intervenantId } = req.query;
    let where = '1=1';
    const params = [];
    if (statut) { where += ' AND o.statut = ?'; params.push(statut); }
    if (intervenantId) { where += ' AND o.intervenantId = ?'; params.push(intervenantId); }

    const [rows] = await pool.query(
      `SELECT o.*, c.raisonSociale AS contactNom, CONCAT(i.prenom, ' ', i.nom) AS intervenantNom
       FROM opportunites o
       LEFT JOIN contacts c ON o.contactId = c.id
       LEFT JOIN intervenants iv ON o.intervenantId = iv.id
       LEFT JOIN intervenants i ON o.intervenantId = i.id
       WHERE ${where}
       ORDER BY o.createdAt DESC`,
      params
    );

    // Stats globales
    const [stats] = await pool.query(
      `SELECT statut, COUNT(*) AS nb, COALESCE(SUM(montantEstime),0) AS montant
       FROM opportunites GROUP BY statut`
    );

    const statMap = {};
    for (const s of stats) statMap[s.statut] = { nb: s.nb, montant: Number(s.montant) };

    const totalPipeline = stats.reduce((acc, s) => acc + Number(s.montant), 0);
    const gagnes = statMap['gagne']?.nb || 0;
    const perdus = statMap['perdu']?.nb || 0;
    const tauxConversion = (gagnes + perdus) > 0 ? Math.round((gagnes / (gagnes + perdus)) * 100) : 0;

    res.json({ opportunites: rows, stats: statMap, totalPipeline, tauxConversion });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[opp]] = await pool.query(
      `SELECT o.*, c.raisonSociale AS contactNom FROM opportunites o LEFT JOIN contacts c ON o.contactId = c.id WHERE o.id = ?`,
      [req.params.id]
    );
    if (!opp) return res.status(404).json({ message: 'Opportunité introuvable' });
    res.json(opp);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST / — créer une opportunité
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { contactId, titre, description, statut, montantEstime, probabilite, dateEcheance, intervenantId } = req.body;
  if (!contactId || !titre) return res.status(400).json({ message: 'Contact et titre requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO opportunites (contactId, titre, description, statut, montantEstime, probabilite, dateEcheance, intervenantId)
       VALUES (?,?,?,?,?,?,?,?)`,
      [contactId, titre, description || null, statut || 'prospect', montantEstime || null, probabilite || 0, dateEcheance || null, intervenantId || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// PUT /:id — mettre à jour
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const allowed = ['titre','description','statut','montantEstime','probabilite','dateEcheance','intervenantId','raisonPerte'];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE opportunites SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
    res.json({ message: 'Mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// DELETE /:id
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('DELETE FROM opportunites WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supprimée' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
