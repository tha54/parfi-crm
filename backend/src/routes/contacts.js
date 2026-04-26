const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — liste des contacts avec filtre type
router.get('/', verifyToken, async (req, res) => {
  try {
    const { type, search, intervenantId } = req.query;
    let where = '1=1';
    const params = [];
    if (type) { where += ' AND c.type = ?'; params.push(type); }
    if (search) { where += ' AND (c.raisonSociale LIKE ? OR c.siren LIKE ? OR c.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (intervenantId) { where += ' AND c.intervenantId = ?'; params.push(intervenantId); }
    const [rows] = await pool.query(
      `SELECT c.*, CONCAT(i.prenom, ' ', i.nom) AS intervenantNom
       FROM contacts c
       LEFT JOIN intervenants i ON c.intervenantId = i.id
       WHERE ${where}
       ORDER BY c.createdAt DESC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /personnes — liste des personnes_contact, filtrable par ?client_id= ou ?contact_id=
router.get('/personnes', verifyToken, async (req, res) => {
  try {
    const { client_id, contact_id } = req.query;
    let where = '1=1';
    const params = [];
    if (client_id) { where += ' AND p.client_id = ?'; params.push(client_id); }
    if (contact_id) { where += ' AND p.contactId = ?'; params.push(contact_id); }
    const [rows] = await pool.query(
      `SELECT p.* FROM personnes_contact p WHERE ${where} ORDER BY p.principal DESC, p.nom ASC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /stats — KPIs pipeline
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const [[{ prospects }]] = await pool.query("SELECT COUNT(*) AS prospects FROM contacts WHERE type='prospect'");
    const [[{ clients }]] = await pool.query("SELECT COUNT(*) AS clients FROM contacts WHERE type='client'");
    const [[{ nouveaux }]] = await pool.query("SELECT COUNT(*) AS nouveaux FROM contacts WHERE type='client' AND MONTH(dateDevenirClient)=MONTH(NOW()) AND YEAR(dateDevenirClient)=YEAR(NOW())");
    res.json({ prospects, clients, nouveaux, tauxConversion: prospects > 0 ? Math.round((clients / (clients + prospects)) * 100) : 0 });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// GET /:id — fiche contact complète
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[contact]] = await pool.query(
      `SELECT c.*, CONCAT(i.prenom, ' ', i.nom) AS intervenantNom
       FROM contacts c
       LEFT JOIN intervenants i ON c.intervenantId = i.id
       WHERE c.id = ?`, [req.params.id]
    );
    if (!contact) return res.status(404).json({ message: 'Contact introuvable' });
    const [personnes] = await pool.query('SELECT * FROM personnes_contact WHERE contactId = ?', [req.params.id]);
    const [missions] = await pool.query(
      'SELECT m.*, CONCAT(i.prenom, " ", i.nom) AS intervenantNom FROM missions m LEFT JOIN intervenants i ON m.intervenantId = i.id WHERE m.contactId = ? ORDER BY m.createdAt DESC',
      [req.params.id]
    );
    const [factures] = await pool.query('SELECT * FROM factures WHERE contactId = ? ORDER BY createdAt DESC LIMIT 20', [req.params.id]);
    const [interactions] = await pool.query('SELECT * FROM interactions WHERE contactId = ? ORDER BY createdAt DESC LIMIT 20', [req.params.id]);
    res.json({ ...contact, personnes, missions, factures, interactions });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// POST / — créer un contact
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const {
    type, raisonSociale, formeJuridique, siren, siret, codeNaf, activite,
    adresse, codePostal, ville, pays, telephone, email, siteWeb,
    nomDirigeant, emailDirigeant, telephoneDirigeant,
    regimeFiscal, regimeComptable, chiffreAffaires, nbSalaries, nbBulletins, presenceTns,
    intervenantId, source, notes, tags, secteur
  } = req.body;
  if (!raisonSociale) return res.status(400).json({ message: 'Raison sociale requise' });

  // Vérif SIREN unique
  if (siren) {
    const [[existing]] = await pool.query('SELECT id FROM contacts WHERE siren = ?', [siren]);
    if (existing) return res.status(409).json({ message: 'Un contact avec ce SIREN existe déjà', existingId: existing.id });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO contacts (type, raisonSociale, formeJuridique, siren, siret, codeNaf, activite,
        adresse, codePostal, ville, pays, telephone, email, siteWeb,
        nomDirigeant, emailDirigeant, telephoneDirigeant,
        regimeFiscal, regimeComptable, chiffreAffaires, nbSalaries, nbBulletins, presenceTns,
        intervenantId, source, notes, tags, secteur, origineClient)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [type || 'prospect', raisonSociale, formeJuridique || null, siren || null, siret || null,
       codeNaf || null, activite || null, adresse || null, codePostal || null, ville || null,
       pays || 'France', telephone || null, email || null, siteWeb || null,
       nomDirigeant || null, emailDirigeant || null, telephoneDirigeant || null,
       regimeFiscal || null, regimeComptable || null, chiffreAffaires || null,
       nbSalaries || 0, nbBulletins || 0, presenceTns || 0,
       intervenantId || null, source || null, notes || null,
       tags ? JSON.stringify(tags) : null, secteur || null, 'creation_directe']
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// PUT /:id — mettre à jour un contact
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const allowed = ['type','raisonSociale','formeJuridique','siren','siret','codeNaf','activite',
    'adresse','codePostal','ville','pays','telephone','email','siteWeb',
    'nomDirigeant','emailDirigeant','telephoneDirigeant',
    'regimeFiscal','regimeComptable','chiffreAffaires','nbSalaries','nbBulletins','presenceTns',
    'intervenantId','source','notes','tags','secteur'];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      fields.push(`\`${k}\` = ?`);
      values.push(k === 'tags' ? JSON.stringify(req.body[k]) : req.body[k]);
    }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE contacts SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
    res.json({ message: 'Contact mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// DELETE /:id — supprimer un contact (expert uniquement)
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Contact supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// POST /:id/convertir — convertir prospect en client
router.post('/:id/convertir', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[contact]] = await pool.query('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    if (!contact) return res.status(404).json({ message: 'Contact introuvable' });
    if (contact.type === 'client') return res.status(400).json({ message: 'Déjà un client' });

    const seq = String(Math.floor(Math.random() * 9000) + 1000);
    const numeroClient = `CLT-${seq}`;
    await pool.query(
      `UPDATE contacts SET type='client', origineClient='prospect_converti', dateDevenirClient=NOW(), numeroClient=? WHERE id=?`,
      [numeroClient, req.params.id]
    );
    res.json({ message: 'Prospect converti en client', numeroClient });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// POST /:id/personnes — ajouter une personne de contact
router.post('/:id/personnes', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { civilite, nom, prenom, poste, email, telephone, mobile, principal, notes } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  try {
    if (principal) await pool.query('UPDATE personnes_contact SET principal=0 WHERE contactId=?', [req.params.id]);
    const [r] = await pool.query(
      `INSERT INTO personnes_contact (contactId, civilite, nom, prenom, poste, email, telephone, mobile, principal, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.params.id, civilite || 'M.', nom, prenom || null, poste || null, email || null, telephone || null, mobile || null, principal ? 1 : 0, notes || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// DELETE /:id/personnes/:pid
router.delete('/:id/personnes/:pid', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    await pool.query('DELETE FROM personnes_contact WHERE id = ? AND contactId = ?', [req.params.pid, req.params.id]);
    res.json({ message: 'Personne supprimée' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST /:id/interactions — ajouter une interaction
router.post('/:id/interactions', verifyToken, async (req, res) => {
  const { type, titre, sujet, description, dateInteraction } = req.body;
  try {
    const [r] = await pool.query(
      `INSERT INTO interactions (contactId, type, titre, description, dateInteraction)
       VALUES (?,?,?,?,?)`,
      [req.params.id, type || 'note', titre || sujet || 'Note', description || null, dateInteraction || new Date()]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

module.exports = router;
