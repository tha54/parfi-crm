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
    if (statut)       { where += ' AND o.statut = ?';        params.push(statut); }
    if (intervenantId){ where += ' AND o.intervenantId = ?'; params.push(intervenantId); }

    const [rows] = await pool.query(
      `SELECT o.*,
              COALESCE(c.raisonSociale, p.nom) AS contactNom,
              CONCAT(i.prenom, ' ', i.nom)     AS intervenantNom
       FROM opportunites o
       LEFT JOIN contacts    c  ON o.contactId    = c.id
       LEFT JOIN prospects   p  ON o.prospect_id  = p.id
       LEFT JOIN intervenants i ON o.intervenantId = i.id
       WHERE ${where}
       ORDER BY o.createdAt DESC`,
      params
    );

    const [statsRows] = await pool.query(
      `SELECT statut, COUNT(*) AS nb, COALESCE(SUM(montantEstime),0) AS montant
       FROM opportunites GROUP BY statut`
    );

    const statMap = {};
    for (const s of statsRows) statMap[s.statut] = { nb: s.nb, montant: Number(s.montant) };

    const totalPipeline = statsRows.reduce((acc, s) => acc + Number(s.montant), 0);
    const gagnes  = statMap['gagne']?.nb || 0;
    const perdus  = statMap['perdu']?.nb || 0;
    const tauxConversion = (gagnes + perdus) > 0 ? Math.round((gagnes / (gagnes + perdus)) * 100) : 0;

    res.json({ opportunites: rows, stats: statMap, totalPipeline, tauxConversion });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[opp]] = await pool.query(
      `SELECT o.*, COALESCE(c.raisonSociale, p.nom) AS contactNom
       FROM opportunites o
       LEFT JOIN contacts  c ON o.contactId   = c.id
       LEFT JOIN prospects p ON o.prospect_id = p.id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!opp) return res.status(404).json({ message: 'Opportunité introuvable' });
    res.json(opp);
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST / — créer une opportunité
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { contactId, prospect_id, titre, description, statut, montantEstime, probabilite, dateEcheance, intervenantId } = req.body;
  if (!contactId && !prospect_id) return res.status(400).json({ message: 'Contact ou prospect requis' });
  if (!titre) return res.status(400).json({ message: 'Titre requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO opportunites
         (contactId, prospect_id, titre, description, statut, montantEstime, probabilite, dateEcheance, intervenantId)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        contactId || null, prospect_id || null,
        titre, description || null,
        statut || 'prospect',
        montantEstime || null, probabilite || 0,
        dateEcheance || null, intervenantId || null,
      ]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// PUT /:id — mettre à jour
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const allowed = ['titre','description','statut','montantEstime','probabilite','dateEcheance','intervenantId','raisonPerte','contactId','prospect_id'];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE opportunites SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
    res.json({ message: 'Mis à jour' });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

// DELETE /:id
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('DELETE FROM opportunites WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supprimée' });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST /:id/convertir — convertit le prospect lié en client, passe la carte à "gagne"
router.post('/:id/convertir', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { type, regime } = req.body;
  if (!type || !regime) return res.status(400).json({ message: 'Type et régime TVA requis' });

  try {
    const [[opp]] = await pool.query('SELECT * FROM opportunites WHERE id = ?', [req.params.id]);
    if (!opp) return res.status(404).json({ message: 'Opportunité introuvable' });
    if (!opp.prospect_id) return res.status(400).json({ message: 'Aucun prospect lié à cette opportunité' });

    const [[prospect]] = await pool.query('SELECT * FROM prospects WHERE id = ?', [opp.prospect_id]);
    if (!prospect) return res.status(404).json({ message: 'Prospect introuvable' });
    if (prospect.statut === 'converti') return res.status(400).json({ message: 'Ce prospect est déjà converti en client' });

    // Create client
    const [clientResult] = await pool.query(
      'INSERT INTO clients (nom, siren, type, regime) VALUES (?, ?, ?, ?)',
      [prospect.nom, prospect.siren || null, type, regime]
    );
    const clientId = clientResult.insertId;

    // Update prospect → converti
    await pool.query(
      'UPDATE prospects SET statut = ?, client_id = ? WHERE id = ?',
      ['converti', clientId, prospect.id]
    );

    // Move pipeline card → Client actif
    await pool.query(
      `UPDATE opportunites SET statut = 'gagne', updatedAt = NOW() WHERE id = ?`,
      [opp.id]
    );

    // Link any devis for this prospect to the new client
    await pool.query(
      'UPDATE devis SET client_id = ? WHERE prospect_id = ?',
      [clientId, prospect.id]
    );

    const [[client]] = await pool.query('SELECT * FROM clients WHERE id = ?', [clientId]);
    res.status(201).json({ client, prospect_id: prospect.id });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

module.exports = router;
