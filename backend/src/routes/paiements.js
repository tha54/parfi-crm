const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — liste des paiements
router.get('/', verifyToken, async (req, res) => {
  try {
    const { facture_id, client_id, limit = 100 } = req.query;
    let where = '1=1';
    const params = [];
    if (facture_id) { where += ' AND p.facture_id = ?'; params.push(facture_id); }
    if (client_id) { where += ' AND f.client_id = ?'; params.push(client_id); }
    const [rows] = await pool.query(
      `SELECT p.*, f.numero AS facture_numero, c.nom AS client_nom
       FROM paiements p
       LEFT JOIN factures f ON p.facture_id = f.id
       LEFT JOIN clients c ON f.client_id = c.id
       WHERE ${where}
       ORDER BY p.datePaiement DESC
       LIMIT ?`,
      [...params, Number(limit)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// POST / — enregistrer un paiement
router.post('/', verifyToken, async (req, res) => {
  const { facture_id, montant, datePaiement, modePaiement, reference } = req.body;
  if (!facture_id || !montant) return res.status(400).json({ message: 'Facture et montant requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO paiements (facture_id, montant, datePaiement, modePaiement, reference)
       VALUES (?,?,?,?,?)`,
      [facture_id, montant, datePaiement || new Date(), modePaiement || 'virement', reference || null]
    );

    // Recalculer le montant payé sur la facture
    const [[{ total_paye }]] = await pool.query(
      'SELECT COALESCE(SUM(montant),0) AS total_paye FROM paiements WHERE facture_id = ?',
      [facture_id]
    );
    const [[facture]] = await pool.query('SELECT montantTTC FROM factures WHERE id = ?', [facture_id]);
    const nouveauStatut = total_paye >= facture.montantTTC ? 'payee' : 'envoyee';
    await pool.query('UPDATE factures SET statut = ? WHERE id = ?', [nouveauStatut, facture_id]);

    res.status(201).json({ id: r.insertId, nouveauStatut });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// DELETE /:id
router.delete('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[p]] = await pool.query('SELECT facture_id FROM paiements WHERE id = ?', [req.params.id]);
    await pool.query('DELETE FROM paiements WHERE id = ?', [req.params.id]);
    if (p) {
      const [[{ total_paye }]] = await pool.query(
        'SELECT COALESCE(SUM(montant),0) AS total_paye FROM paiements WHERE facture_id = ?',
        [p.facture_id]
      );
      const [[facture]] = await pool.query('SELECT montantTTC FROM factures WHERE id = ?', [p.facture_id]);
      const nouveauStatut = total_paye >= facture.montantTTC ? 'payee' : 'envoyee';
      await pool.query('UPDATE factures SET statut = ? WHERE id = ?', [nouveauStatut, p.facture_id]);
    }
    res.json({ message: 'Paiement supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
