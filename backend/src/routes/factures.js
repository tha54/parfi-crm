const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

async function nextNumero() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT numero FROM factures WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
    [`FAC-${year}-%`]
  );
  const seq = rows.length ? parseInt(rows[0].numero.split('-').pop(), 10) + 1 : 1;
  return `FAC-${year}-${String(seq).padStart(3, '0')}`;
}

router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, c.nom AS client_nom
       FROM factures f LEFT JOIN clients c ON f.client_id = c.id
       ORDER BY f.createdAt DESC`
    );
    res.json(rows);
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[f]] = await pool.query(
      `SELECT f.*, c.nom AS client_nom FROM factures f LEFT JOIN clients c ON f.client_id = c.id WHERE f.id = ?`,
      [req.params.id]
    );
    if (!f) return res.status(404).json({ message: 'Facture introuvable' });
    const [lignes] = await pool.query('SELECT * FROM lignes_facture WHERE factureId = ? ORDER BY ordre', [f.id]);
    res.json({ ...f, lignes });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { client_id, type, dateEcheance, totalHT, tauxTVA, totalTVA, totalTTC, notesInternes, lignes } = req.body;
  if (!client_id) return res.status(400).json({ message: 'Client requis' });
  try {
    const numero = await nextNumero();
    const [result] = await pool.query(
      `INSERT INTO factures (numero, client_id, contactId, type, dateEcheance, totalHT, tauxTVA, totalTVA, totalTTC, notesInternes)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [numero, client_id, type || 'facture', dateEcheance || null, totalHT || 0, tauxTVA || 20, totalTVA || 0, totalTTC || 0, notesInternes || null]
    );
    const factureId = result.insertId;
    if (lignes?.length) {
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        await pool.query(
          `INSERT INTO lignes_facture (factureId, ordre, description, quantite, prixUnitaireHT, remisePct, totalHT) VALUES (?,?,?,?,?,?,?)`,
          [factureId, i, l.description, l.quantite || 1, l.prixUnitaireHT || 0, l.remisePct || 0, l.totalHT || 0]
        );
      }
    }
    res.status(201).json({ id: factureId, numero });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { statut, dateEcheance, datePaiement, totalHT, tauxTVA, totalTVA, totalTTC, montantPaye, notesInternes, client_id } = req.body;
  try {
    const fields = [], values = [];
    if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }
    if (dateEcheance !== undefined) { fields.push('dateEcheance = ?'); values.push(dateEcheance); }
    if (datePaiement !== undefined) { fields.push('datePaiement = ?'); values.push(datePaiement); }
    if (totalHT !== undefined) { fields.push('totalHT = ?'); values.push(totalHT); }
    if (tauxTVA !== undefined) { fields.push('tauxTVA = ?'); values.push(tauxTVA); }
    if (totalTVA !== undefined) { fields.push('totalTVA = ?'); values.push(totalTVA); }
    if (totalTTC !== undefined) { fields.push('totalTTC = ?'); values.push(totalTTC); }
    if (montantPaye !== undefined) { fields.push('montantPaye = ?'); values.push(montantPaye); }
    if (notesInternes !== undefined) { fields.push('notesInternes = ?'); values.push(notesInternes); }
    if (client_id !== undefined) { fields.push('client_id = ?'); values.push(client_id); }
    if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE factures SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Facture mise à jour' });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('DELETE FROM lignes_facture WHERE factureId = ?', [req.params.id]);
    await pool.query('DELETE FROM factures WHERE id = ?', [req.params.id]);
    res.json({ message: 'Facture supprimée' });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
