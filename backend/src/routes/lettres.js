const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { genererFacturesDepuisLDM } = require('../utils/facturation');

async function nextNumero() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT numero FROM lettres_mission WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
    [`LM-${year}-%`]
  );
  const seq = rows.length ? parseInt(rows[0].numero.split('-').pop(), 10) + 1 : 1;
  return `LM-${year}-${String(seq).padStart(3, '0')}`;
}

router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id } = req.query;
    let where = '1=1';
    const params = [];
    if (client_id) { where += ' AND l.client_id = ?'; params.push(client_id); }
    const [rows] = await pool.query(
      `SELECT l.*, c.nom AS client_nom
       FROM lettres_mission l LEFT JOIN clients c ON l.client_id = c.id
       WHERE ${where}
       ORDER BY l.createdAt DESC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[l]] = await pool.query(
      `SELECT l.*, c.nom AS client_nom, c.siren AS client_siren
       FROM lettres_mission l LEFT JOIN clients c ON l.client_id = c.id
       WHERE l.id = ?`, [req.params.id]
    );
    if (!l) return res.status(404).json({ message: 'Lettre introuvable' });
    // Inclure les factures liées
    const [factures] = await pool.query(
      `SELECT id, numero, dateEmission, dateEcheance, totalHT, totalTTC, statut
       FROM factures WHERE notesInternes LIKE ? ORDER BY dateEmission`,
      [`%${l.numero}%`]
    );
    res.json({ ...l, factures });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { client_id, typeMission, objetMission, montantHonorairesHT, dateDebut, dateFin, repartitionTaches, notesInternes } = req.body;
  if (!client_id || !typeMission) return res.status(400).json({ message: 'Client et type de mission requis' });
  try {
    const numero = await nextNumero();
    const repartition = repartitionTaches
      ? (typeof repartitionTaches === 'string' ? repartitionTaches : JSON.stringify(repartitionTaches))
      : null;
    const [result] = await pool.query(
      `INSERT INTO lettres_mission (numero, client_id, contactId, typeMission, objetMission, montantHonorairesHT, dateDebut, dateFin, repartitionTaches, notesInternes)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [numero, client_id, typeMission, objetMission || null, montantHonorairesHT || 0,
       dateDebut || null, dateFin || null, repartition, notesInternes || null]
    );
    res.status(201).json({ id: result.insertId, numero });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { statut, typeMission, objetMission, montantHonorairesHT, dateDebut, dateFin, client_id,
          signatureClient, dateSignatureClient } = req.body;
  try {
    // Récupérer l'ancien statut
    const [[prev]] = await pool.query('SELECT statut FROM lettres_mission WHERE id=?', [req.params.id]);

    const fields = [], values = [];
    if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }
    if (typeMission !== undefined) { fields.push('typeMission = ?'); values.push(typeMission); }
    if (objetMission !== undefined) { fields.push('objetMission = ?'); values.push(objetMission); }
    if (montantHonorairesHT !== undefined) { fields.push('montantHonorairesHT = ?'); values.push(montantHonorairesHT); }
    if (dateDebut !== undefined) { fields.push('dateDebut = ?'); values.push(dateDebut); }
    if (dateFin !== undefined) { fields.push('dateFin = ?'); values.push(dateFin); }
    if (client_id !== undefined) { fields.push('client_id = ?'); values.push(client_id); }
    if (signatureClient !== undefined) { fields.push('signatureClient = ?'); values.push(signatureClient); }
    if (dateSignatureClient !== undefined) { fields.push('dateSignatureClient = ?'); values.push(dateSignatureClient); }

    if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE lettres_mission SET ${fields.join(', ')} WHERE id = ?`, values);

    // Auto-workflow quand passage à 'signee'
    let factureIds = [];
    let missionIds = [];
    if (statut === 'signee' && prev?.statut !== 'signee') {
      factureIds = await genererFacturesDepuisLDM(req.params.id).catch(e => {
        console.error('Auto-billing error:', e.message);
        return [];
      });

      try {
        const [[ldm]] = await pool.query('SELECT * FROM lettres_mission WHERE id = ?', [req.params.id]);
        if (ldm) {
          const missionCategorie = {
            tenue_comptable: 'tenue_comptable', revision: 'revision',
            etablissement_comptes: 'etablissement_comptes', fiscal: 'fiscal',
            social_paie: 'social', conseil: 'conseil', juridique: 'juridique', autre: 'autre'
          }[ldm.typeMission] || 'autre';

          const [mr] = await pool.query(
            `INSERT INTO missions (contactId, client_id, nom, categorie, statut, honorairesBudgetes, tempsBudgeteH, dateDebut, dateFin, notes)
             VALUES (?, ?, ?, ?, 'en_cours', ?, 0, ?, ?, ?)`,
            [ldm.contactId || 0, ldm.client_id,
             `${ldm.typeMission} — LM ${ldm.numero}`,
             missionCategorie, ldm.montantHonorairesHT || 0,
             ldm.dateDebut || null, ldm.dateFin || null, ldm.objetMission || null]
          );
          missionIds.push(mr.insertId);
          await pool.query('UPDATE lettres_mission SET missionId = ? WHERE id = ?', [mr.insertId, req.params.id]);

          if (ldm.client_id) {
            const [[expert]] = await pool.query(`SELECT id FROM utilisateurs WHERE role = 'expert' LIMIT 1`);
            if (expert) {
              await pool.query(
                `INSERT INTO taches (client_id, utilisateur_id, description, duree, date_echeance, statut, priorite, mission_id, origine)
                 VALUES (?, ?, ?, 1, DATE_ADD(NOW(), INTERVAL 7 DAY), 'a_faire', 'normale', ?, 'ldm')`,
                [ldm.client_id, expert.id, `Démarrage mission : ${ldm.typeMission}`, mr.insertId]
              );
            }
          }
        }
      } catch (e) {
        console.error('Auto-mission error:', e.message);
      }
    }

    res.json({ message: 'Lettre mise à jour', factureIds, missionIds });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('DELETE FROM lettres_mission WHERE id = ?', [req.params.id]);
    res.json({ message: 'Lettre supprimée' });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
