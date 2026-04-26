const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

async function nextNumero(prefix) {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT numero FROM devis WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}-${year}-%`]
  );
  const seq = rows.length ? parseInt(rows[0].numero.split('-').pop(), 10) + 1 : 1;
  return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}

router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, c.nom AS client_nom
       FROM devis d LEFT JOIN clients c ON d.client_id = c.id
       ORDER BY d.createdAt DESC`
    );
    res.json(rows);
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[d]] = await pool.query(
      `SELECT d.*, c.nom AS client_nom FROM devis d LEFT JOIN clients c ON d.client_id = c.id WHERE d.id = ?`,
      [req.params.id]
    );
    if (!d) return res.status(404).json({ message: 'Devis introuvable' });
    const [lignes] = await pool.query('SELECT * FROM lignes_devis WHERE devisId = ? ORDER BY ordre', [d.id]);
    res.json({ ...d, lignes });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { client_id, titre, dateValidite, totalHT, tauxTVA, totalTVA, totalTTC, notesInternes, notesClient, lignes } = req.body;
  if (!client_id || !titre) return res.status(400).json({ message: 'Client et titre requis' });
  try {
    const numero = await nextNumero('DEV');
    const [result] = await pool.query(
      `INSERT INTO devis (numero, client_id, contactId, titre, dateValidite, totalHT, tauxTVA, totalTVA, totalTTC, notesInternes, notesClient)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [numero, client_id, titre, dateValidite || null, totalHT || 0, tauxTVA || 20, totalTVA || 0, totalTTC || 0, notesInternes || null, notesClient || null]
    );
    const devisId = result.insertId;
    if (lignes?.length) {
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        await pool.query(
          `INSERT INTO lignes_devis (devisId, ordre, description, quantite, prixUnitaireHT, remisePct, totalHT) VALUES (?,?,?,?,?,?,?)`,
          [devisId, i, l.description, l.quantite || 1, l.prixUnitaireHT || 0, l.remisePct || 0, l.totalHT || 0]
        );
      }
    }
    res.status(201).json({ id: devisId, numero });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { statut, titre, dateValidite, totalHT, tauxTVA, totalTVA, totalTTC, notesInternes, notesClient, client_id } = req.body;
  try {
    const fields = [], values = [];
    if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }
    if (titre !== undefined) { fields.push('titre = ?'); values.push(titre); }
    if (dateValidite !== undefined) { fields.push('dateValidite = ?'); values.push(dateValidite); }
    if (totalHT !== undefined) { fields.push('totalHT = ?'); values.push(totalHT); }
    if (tauxTVA !== undefined) { fields.push('tauxTVA = ?'); values.push(tauxTVA); }
    if (totalTVA !== undefined) { fields.push('totalTVA = ?'); values.push(totalTVA); }
    if (totalTTC !== undefined) { fields.push('totalTTC = ?'); values.push(totalTTC); }
    if (notesInternes !== undefined) { fields.push('notesInternes = ?'); values.push(notesInternes); }
    if (notesClient !== undefined) { fields.push('notesClient = ?'); values.push(notesClient); }
    if (client_id !== undefined) { fields.push('client_id = ?'); values.push(client_id); }
    if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE devis SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Devis mis à jour' });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('DELETE FROM lignes_devis WHERE devisId = ?', [req.params.id]);
    await pool.query('DELETE FROM devis WHERE id = ?', [req.params.id]);
    res.json({ message: 'Devis supprimé' });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
