const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

// ── Middleware portal ──────────────────────────────────────────────────────────
function verifyPortalToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ message: 'Non autorisé' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.portalRole !== 'client') return res.status(403).json({ message: 'Accès refusé' });
    req.clientId = decoded.clientId;
    next();
  } catch { res.status(401).json({ message: 'Token invalide' }); }
}

// ── Login client ───────────────────────────────────────────────────────────────
// Clients use email+password stored in clients.portal_email / clients.portal_password_hash
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email et mot de passe requis' });
  try {
    const [[client]] = await pool.query(
      'SELECT id, nom, portal_email, portal_password_hash, actif FROM clients WHERE portal_email=? AND actif=1',
      [email]
    );
    if (!client) return res.status(401).json({ message: 'Identifiants incorrects' });
    const ok = await bcrypt.compare(password, client.portal_password_hash || '');
    if (!ok) return res.status(401).json({ message: 'Identifiants incorrects' });

    const token = jwt.sign(
      { clientId: client.id, portalRole: 'client', nom: client.nom },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, client: { id: client.id, nom: client.nom, email: client.portal_email } });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── Dashboard client ───────────────────────────────────────────────────────────
router.get('/dashboard', verifyPortalToken, async (req, res) => {
  try {
    const cid = req.clientId;

    const [[client]] = await pool.query(
      `SELECT c.nom, c.siren, c.email, c.telephone, c.adresse,
              CONCAT(u.prenom,' ',u.nom) AS contact_cabinet, u.email AS email_cabinet
       FROM clients c
       LEFT JOIN attributions a ON a.client_id=c.id
       LEFT JOIN utilisateurs u ON a.utilisateur_id=u.id
       WHERE c.id=? LIMIT 1`, [cid]
    );

    const [[derniereFacture]] = await pool.query(
      'SELECT numero, statut, totalTTC, dateEcheance FROM factures WHERE client_id=? ORDER BY createdAt DESC LIMIT 1', [cid]
    );

    const [[missionStats]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN statut='en_cours' THEN 1 ELSE 0 END) AS en_cours,
              ROUND(AVG(CASE WHEN tempsBudgeteH>0 THEN LEAST(tempsPasseH/tempsBudgeteH*100,100) ELSE 0 END),0) AS avancement
       FROM missions WHERE client_id=?`, [cid]
    );

    const [prochainesEcheances] = await pool.query(
      `SELECT label, date_echeance, statut FROM echeances_fiscales
       WHERE client_id=? AND statut='a_faire' AND date_echeance >= CURDATE()
       ORDER BY date_echeance LIMIT 3`, [cid]
    );

    res.json({ client, derniereFacture, missions: missionStats, prochainesEcheances });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// ── Documents du client ────────────────────────────────────────────────────────
router.get('/documents', verifyPortalToken, async (req, res) => {
  try {
    const [docs] = await pool.query(
      `SELECT id, nom, type_document, annee_fiscale, taille, mimeType, createdAt
       FROM documents WHERE client_id=?
       ORDER BY createdAt DESC`, [req.clientId]
    );
    res.json(docs);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.get('/documents/:id/download', verifyPortalToken, async (req, res) => {
  try {
    const [[doc]] = await pool.query(
      'SELECT * FROM documents WHERE id=? AND client_id=?', [req.params.id, req.clientId]
    );
    if (!doc) return res.status(404).json({ message: 'Document introuvable' });
    if (!fs.existsSync(doc.chemin)) return res.status(404).json({ message: 'Fichier manquant' });
    res.download(doc.chemin, doc.nom);
  } catch (e) { res.status(500).json({ message: 'Erreur' }); }
});

// ── Factures du client ─────────────────────────────────────────────────────────
router.get('/factures', verifyPortalToken, async (req, res) => {
  try {
    const [factures] = await pool.query(
      `SELECT id, numero, dateEmission, dateEcheance, totalTTC, statut
       FROM factures WHERE client_id=?
       ORDER BY dateEmission DESC`, [req.clientId]
    );
    res.json(factures);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── Missions du client ─────────────────────────────────────────────────────────
router.get('/missions', verifyPortalToken, async (req, res) => {
  try {
    const [missions] = await pool.query(
      `SELECT nom, categorie, statut,
              CASE WHEN tempsBudgeteH>0 THEN LEAST(ROUND(tempsPasseH/tempsBudgeteH*100),100) ELSE 0 END AS avancement_pct
       FROM missions WHERE client_id=? ORDER BY createdAt DESC`, [req.clientId]
    );
    res.json(missions);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── Messages sécurisés ─────────────────────────────────────────────────────────
router.post('/message', verifyPortalToken, async (req, res) => {
  const { objet, contenu } = req.body;
  if (!contenu) return res.status(400).json({ message: 'Contenu requis' });
  try {
    await pool.query(
      `INSERT INTO interactions_log (client_id, type, direction, objet, contenu, urgence, date_interaction)
       VALUES (?,?,?,?,?,?,NOW())`,
      [req.clientId, 'email', 'entrant', objet || 'Message portail client', contenu, 'normale']
    );
    res.json({ message: 'Message envoyé au cabinet' });
  } catch (e) { res.status(500).json({ message: 'Erreur' }); }
});

// ── Signature électronique LDM/devis ──────────────────────────────────────────
router.post('/sign/:type/:id', verifyPortalToken, async (req, res) => {
  const { signature } = req.body;
  if (!signature) return res.status(400).json({ message: 'Signature requise' });
  try {
    if (req.params.type === 'ldm') {
      const [[ldm]] = await pool.query('SELECT id FROM lettres_mission WHERE id=? AND client_id=?', [req.params.id, req.clientId]);
      if (!ldm) return res.status(404).json({ message: 'Lettre introuvable' });
      await pool.query(
        'UPDATE lettres_mission SET signatureClient=?, dateSignatureClient=NOW(), statut="signee" WHERE id=?',
        [signature, req.params.id]
      );
    } else if (req.params.type === 'devis') {
      const [[devis]] = await pool.query('SELECT id FROM devis WHERE id=? AND client_id=?', [req.params.id, req.clientId]);
      if (!devis) return res.status(404).json({ message: 'Devis introuvable' });
      await pool.query('UPDATE devis SET statut="accepte" WHERE id=?', [req.params.id]);
    } else {
      return res.status(400).json({ message: 'Type invalide' });
    }
    res.json({ message: 'Document signé' });
  } catch (e) { res.status(500).json({ message: 'Erreur' }); }
});

// ── Admin : créer/modifier accès portail d'un client ──────────────────────────
router.post('/admin/create-access', async (req, res) => {
  // This endpoint is called from the main CRM (uses main JWT)
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ message: 'Non autorisé' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    if (!['expert', 'chef_mission'].includes(decoded.role)) return res.status(403).json({ message: 'Accès refusé' });

    const { client_id, email, password } = req.body;
    if (!client_id || !email || !password) return res.status(400).json({ message: 'client_id, email et password requis' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_email VARCHAR(255), ADD COLUMN IF NOT EXISTS portal_password_hash VARCHAR(255)'
    ).catch(() => {});
    await pool.query(
      'UPDATE clients SET portal_email=?, portal_password_hash=? WHERE id=?',
      [email, hash, client_id]
    );
    res.json({ message: `Accès portail créé pour le client ${client_id}` });
  } catch (e) { res.status(500).json({ message: 'Erreur', e: e.message }); }
});

module.exports = router;
