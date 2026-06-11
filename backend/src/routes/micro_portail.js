const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { randomUUID } = require('crypto');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');
const { genererPdfFacture } = require('../utils/microFacturePdf');
const { genererPdfDevis } = require('../utils/microDevisPdf');
const { sendEmail } = require('../utils/mailer');

const DEVIS_DIR   = '/opt/parfi-data/micro-devis';
const FACTURE_DIR = '/opt/parfi-data/micro-factures';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://163.172.158.24';

fs.mkdir(DEVIS_DIR,   { recursive: true }).catch(() => {});
fs.mkdir(FACTURE_DIR, { recursive: true }).catch(() => {});

// ── Migration ──────────────────────────────────────────────────────────────────
;(async () => {
  try {
    const [[exists]] = await pool.query(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'micro_portail_access'`
    );
    if (!exists) {
      await pool.query(`
        CREATE TABLE micro_portail_access (
          id INT AUTO_INCREMENT PRIMARY KEY,
          micro_client_id INT NOT NULL UNIQUE,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          actif TINYINT(1) DEFAULT 1,
          derniere_connexion DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('[micro-portail] Table micro_portail_access créée');
    }
  } catch (e) {
    console.error('[micro-portail] migration:', e.message);
  }
})();

// ── Middleware portail micro ───────────────────────────────────────────────────
function verifyMicroPortalToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  const raw = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : queryToken;
  if (!raw) return res.status(401).json({ message: 'Non autorisé' });
  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET);
    if (decoded.portalRole !== 'micro_portail') return res.status(403).json({ message: 'Accès refusé' });
    req.microClientId = decoded.microClientId;
    req.microPortalUser = decoded;
    next();
  } catch { res.status(401).json({ message: 'Token invalide ou expiré' }); }
}

// ── Helper : fetch micro_client complet ───────────────────────────────────────
async function getMicroClient(id) {
  const [[mc]] = await pool.query(
    `SELECT mc.*, c.nom AS client_nom, c.email AS client_email
     FROM micro_clients mc
     JOIN clients c ON c.id = mc.client_id
     WHERE mc.id = ?`,
    [id]
  );
  return mc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/micro-portail/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email et mot de passe requis' });
  try {
    const [[acc]] = await pool.query(
      `SELECT mpa.*, mc.nom_commercial, mc.id AS mcId, c.nom AS client_nom
       FROM micro_portail_access mpa
       JOIN micro_clients mc ON mc.id = mpa.micro_client_id
       JOIN clients c ON c.id = mc.client_id
       WHERE mpa.email = ? AND mpa.actif = 1`,
      [email]
    );
    if (!acc) return res.status(401).json({ message: 'Identifiants incorrects' });
    const ok = await bcrypt.compare(password, acc.password_hash);
    if (!ok) return res.status(401).json({ message: 'Identifiants incorrects' });

    await pool.query('UPDATE micro_portail_access SET derniere_connexion = NOW() WHERE id = ?', [acc.id]);

    const token = jwt.sign(
      { microClientId: acc.mcId, portalRole: 'micro_portail', nom: acc.nom_commercial || acc.client_nom, email: acc.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({
      token,
      micro_client: { id: acc.mcId, nom: acc.nom_commercial || acc.client_nom, email: acc.email },
    });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// GET /api/micro-portail/me
router.get('/me', verifyMicroPortalToken, async (req, res) => {
  try {
    const mc = await getMicroClient(req.microClientId);
    if (!mc) return res.status(404).json({ message: 'Micro-client introuvable' });
    res.json(mc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/micro-portail/dashboard
router.get('/dashboard', verifyMicroPortalToken, async (req, res) => {
  const mcId = req.microClientId;
  try {
    const [[kpis]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN mf.statut='payee' AND YEAR(mf.date_emission)=YEAR(CURDATE()) THEN mf.montant_ttc ELSE 0 END),0) AS ca_ytd,
         COALESCE(SUM(CASE WHEN mf.statut='payee' AND MONTH(mf.date_emission)=MONTH(CURDATE()) AND YEAR(mf.date_emission)=YEAR(CURDATE()) THEN mf.montant_ttc ELSE 0 END),0) AS encaisse_mois,
         COALESCE(SUM(CASE WHEN mf.statut IN ('envoyee','partiellement_payee','en_retard') THEN mf.solde_restant ELSE 0 END),0) AS impayes,
         COUNT(CASE WHEN mf.statut IN ('envoyee','partiellement_payee') THEN 1 END) AS factures_attente,
         COUNT(CASE WHEN mf.statut='en_retard' THEN 1 END) AS factures_retard,
         COUNT(DISTINCT md.id) AS devis_en_attente
       FROM micro_clients mc
       LEFT JOIN micro_factures mf ON mf.micro_client_id=mc.id
       LEFT JOIN micro_devis md ON md.micro_client_id=mc.id AND md.statut='envoye'
       WHERE mc.id=?`,
      [mcId]
    );

    const [dernieresFactures] = await pool.query(
      `SELECT mf.id, mf.numero, mf.statut, mf.montant_ttc, mf.solde_restant, mf.date_echeance,
              ct.nom, ct.prenom, ct.societe
       FROM micro_factures mf
       JOIN micro_contacts ct ON ct.id = mf.contact_id
       WHERE mf.micro_client_id = ?
       ORDER BY mf.date_emission DESC LIMIT 5`,
      [mcId]
    );

    const [derniersDevis] = await pool.query(
      `SELECT md.id, md.numero, md.statut, md.montant_ttc, md.date_validite,
              ct.nom, ct.prenom, ct.societe
       FROM micro_devis md
       JOIN micro_contacts ct ON ct.id = md.contact_id
       WHERE md.micro_client_id = ?
       ORDER BY md.date_emission DESC LIMIT 5`,
      [mcId]
    );

    res.json({ kpis, dernieresFactures, derniersDevis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/micro-portail/ca-mensuel?annee=
router.get('/ca-mensuel', verifyMicroPortalToken, async (req, res) => {
  const annee = parseInt(req.query.annee) || new Date().getFullYear();
  try {
    const [rows] = await pool.query(
      `SELECT MONTH(date_encaissement) AS mois, COALESCE(SUM(montant_encaisse),0) AS ca
       FROM micro_livre_recettes
       WHERE micro_client_id=? AND YEAR(date_encaissement)=?
       GROUP BY MONTH(date_encaissement) ORDER BY mois`,
      [req.microClientId, annee]
    );
    const mois = Array.from({ length: 12 }, (_, i) => {
      const found = rows.find(r => r.mois === i + 1);
      return { mois: i + 1, ca: found ? Number(found.ca) : 0 };
    });
    res.json({ annee, mois });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEVIS
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTS & PRESTATIONS (lecture depuis portail)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/contacts', verifyMicroPortalToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM micro_contacts WHERE micro_client_id=? ORDER BY nom',
      [req.microClientId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/contacts', verifyMicroPortalToken, async (req, res) => {
  const { nom, prenom, societe, siren, email, telephone, adresse } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  try {
    const [r] = await pool.query(
      'INSERT INTO micro_contacts (micro_client_id, nom, prenom, societe, siren, email, telephone, adresse) VALUES (?,?,?,?,?,?,?,?)',
      [req.microClientId, nom, prenom||null, societe||null, siren||null, email||null, telephone||null, adresse||null]
    );
    const [[row]] = await pool.query('SELECT * FROM micro_contacts WHERE id=?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/prestations', verifyMicroPortalToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM micro_prestations WHERE micro_client_id=? ORDER BY libelle',
      [req.microClientId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEVIS — CRÉATION
// ═══════════════════════════════════════════════════════════════════════════════

// GET /devis/next-numero — DOIT être avant /devis/:id
router.get('/devis/next-numero', verifyMicroPortalToken, async (req, res) => {
  try {
    const [[mc]] = await pool.query('SELECT prefixe_devis FROM micro_clients WHERE id=?', [req.microClientId]);
    const prefix = mc?.prefixe_devis || 'DEV';
    const annee = new Date().getFullYear();
    const [[row]] = await pool.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) AS max_seq
       FROM micro_devis WHERE micro_client_id=? AND YEAR(date_emission)=?`,
      [req.microClientId, annee]
    );
    const seq = (row?.max_seq || 0) + 1;
    res.json({ numero: `${prefix}-${annee}-${String(seq).padStart(4, '0')}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /devis — créer
router.post('/devis', verifyMicroPortalToken, async (req, res) => {
  const { contact_id, numero, date_emission, date_validite, objet, conditions_paiement, notes, taux_tva = 0, lignes = [] } = req.body;
  if (!contact_id || !numero || !date_emission || !date_validite) {
    return res.status(400).json({ error: 'contact_id, numero, date_emission, date_validite requis' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let montantHT = 0;
    const lignesCalc = lignes.map((l, i) => {
      const ht = Number(l.quantite) * Number(l.prix_unitaire) * (1 - (Number(l.remise_pct) || 0) / 100);
      montantHT += ht;
      return { ...l, montant_ht: ht, ordre: l.ordre ?? i };
    });
    const montantTVA = montantHT * Number(taux_tva) / 100;
    const montantTTC = montantHT + montantTVA;

    const [r] = await conn.query(
      `INSERT INTO micro_devis
         (micro_client_id, contact_id, numero, date_emission, date_validite,
          objet, conditions_paiement, notes, taux_tva, montant_ht, montant_tva, montant_ttc, statut)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'brouillon')`,
      [req.microClientId, contact_id, numero, date_emission, date_validite,
       objet||null, conditions_paiement||null, notes||null, taux_tva, montantHT, montantTVA, montantTTC]
    );
    const devisId = r.insertId;
    for (const l of lignesCalc) {
      await conn.query(
        `INSERT INTO micro_devis_lignes (devis_id, libelle, description, quantite, unite, prix_unitaire, remise_pct, montant_ht, ordre)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [devisId, l.libelle, l.description||null, l.quantite, l.unite||'forfait', l.prix_unitaire, l.remise_pct||0, l.montant_ht, l.ordre]
      );
    }
    await conn.commit();
    const [[devis]] = await pool.query(`
      SELECT md.*, mc.nom_commercial, mc.siren, mc.siret, mc.adresse_facturation, mc.regime_tva, mc.iban, mc.bic,
             mc.prefixe_devis, c.nom AS client_nom,
             ct.nom AS contact_nom, ct.prenom AS contact_prenom, ct.societe AS contact_societe,
             ct.adresse AS contact_adresse, ct.email AS contact_email
      FROM micro_devis md
      JOIN micro_clients mc ON mc.id = md.micro_client_id
      JOIN clients c ON c.id = mc.client_id
      JOIN micro_contacts ct ON ct.id = md.contact_id
      WHERE md.id = ?`, [devisId]
    );
    const [lignesResult] = await pool.query('SELECT * FROM micro_devis_lignes WHERE devis_id=? ORDER BY ordre', [devisId]);
    res.status(201).json({ ...devis, lignes: lignesResult });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally { conn.release(); }
});

// POST /devis/:id/envoyer
router.post('/devis/:id/envoyer', verifyMicroPortalToken, async (req, res) => {
  try {
    const [[devis]] = await pool.query(`
      SELECT md.*, mc.nom_commercial, mc.siren, mc.siret, mc.adresse_facturation, mc.regime_tva, mc.iban, mc.bic,
             mc.prefixe_devis, c.nom AS client_nom,
             ct.nom AS contact_nom, ct.prenom AS contact_prenom, ct.societe AS contact_societe,
             ct.adresse AS contact_adresse, ct.email AS contact_email
      FROM micro_devis md
      JOIN micro_clients mc ON mc.id = md.micro_client_id
      JOIN clients c ON c.id = mc.client_id
      JOIN micro_contacts ct ON ct.id = md.contact_id
      WHERE md.id = ? AND md.micro_client_id = ?`, [req.params.id, req.microClientId]
    );
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' });
    if (!devis.contact_email) return res.status(400).json({ error: 'Le contact n\'a pas d\'adresse email' });

    const [lignes] = await pool.query('SELECT * FROM micro_devis_lignes WHERE devis_id=? ORDER BY ordre', [devis.id]);
    const pdfBuffer = await genererPdfDevis(devis, lignes);
    await fs.mkdir(DEVIS_DIR, { recursive: true });
    const filename = `${devis.numero.replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.pdf`;
    await fs.writeFile(path.join(DEVIS_DIR, filename), pdfBuffer);

    const token = randomUUID();
    const signatureLink = `${APP_BASE_URL}/signature/${token}`;
    await pool.query(
      `UPDATE micro_devis SET statut='envoye', signature_token=?, pdf_url=? WHERE id=?`,
      [token, `/micro-devis-pdf/${filename}`, devis.id]
    );

    const nom = devis.nom_commercial || devis.client_nom;
    await sendEmail({
      to: devis.contact_email,
      toName: [devis.contact_prenom, devis.contact_nom].filter(Boolean).join(' '),
      subject: `Devis ${devis.numero} — ${nom}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto">
          <div style="background:#0F1F4B;padding:24px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">${nom}</h2>
          </div>
          <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p>Bonjour ${devis.contact_prenom || devis.contact_nom || ''},</p>
            <p>Veuillez trouver ci-joint votre devis <strong>${devis.numero}</strong>${devis.objet ? ` — ${devis.objet}` : ''}.</p>
            <p><strong>Montant : ${Number(devis.montant_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong></p>
            <p>Ce devis est valable jusqu'au <strong>${new Date(devis.date_validite).toLocaleDateString('fr-FR')}</strong>.</p>
            <div style="margin:28px 0;text-align:center">
              <a href="${signatureLink}" style="background:#0F1F4B;color:white;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px">
                Consulter et signer le devis
              </a>
            </div>
            <p style="font-size:12px;color:#6b7280">Lien : ${signatureLink}</p>
          </div>
        </div>`,
      attachments: [{ base64: pdfBuffer.toString('base64'), filename: `Devis_${devis.numero}.pdf` }],
    });
    res.json({ success: true, signature_token: token, signature_link: signatureLink });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACTURES — CRÉATION
// ═══════════════════════════════════════════════════════════════════════════════

// GET /factures/next-numero — DOIT être avant /factures/:id
router.get('/factures/next-numero', verifyMicroPortalToken, async (req, res) => {
  try {
    const [[mc]] = await pool.query('SELECT prefixe_facture FROM micro_clients WHERE id=?', [req.microClientId]);
    const prefix = mc?.prefixe_facture || 'FAC';
    const annee = new Date().getFullYear();
    const [[row]] = await pool.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) AS max_seq
       FROM micro_factures WHERE micro_client_id=? AND YEAR(date_emission)=?`,
      [req.microClientId, annee]
    );
    const seq = (row?.max_seq || 0) + 1;
    res.json({ numero: `${prefix}-${annee}-${String(seq).padStart(4, '0')}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /factures — créer
router.post('/factures', verifyMicroPortalToken, async (req, res) => {
  const { contact_id, numero, date_emission, date_echeance, objet, conditions_paiement, notes, taux_tva = 0, lignes = [] } = req.body;
  if (!contact_id || !numero || !date_emission || !date_echeance) {
    return res.status(400).json({ error: 'contact_id, numero, date_emission, date_echeance requis' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let montantHT = 0;
    const lignesCalc = lignes.map((l, i) => {
      const ht = Number(l.quantite) * Number(l.prix_unitaire) * (1 - (Number(l.remise_pct) || 0) / 100);
      montantHT += ht;
      return { ...l, montant_ht: ht, ordre: l.ordre ?? i };
    });
    const montantTVA = montantHT * Number(taux_tva) / 100;
    const montantTTC = montantHT + montantTVA;

    const [[mc]] = await conn.query('SELECT regime_tva FROM micro_clients WHERE id=?', [req.microClientId]);
    const mention = mc?.regime_tva === 'franchise' ? 'TVA non applicable, art. 293 B du CGI' : null;

    const [r] = await conn.query(
      `INSERT INTO micro_factures
         (micro_client_id, contact_id, numero, date_emission, date_echeance,
          objet, conditions_paiement, notes, taux_tva,
          montant_ht, montant_tva, montant_ttc, montant_regle, solde_restant, statut, mention_franchise)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,'brouillon',?)`,
      [req.microClientId, contact_id, numero, date_emission, date_echeance,
       objet||null, conditions_paiement||null, notes||null, taux_tva,
       montantHT, montantTVA, montantTTC, montantTTC, mention]
    );
    const factureId = r.insertId;
    for (const l of lignesCalc) {
      await conn.query(
        `INSERT INTO micro_factures_lignes (facture_id, libelle, description, quantite, unite, prix_unitaire, remise_pct, montant_ht, ordre)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [factureId, l.libelle, l.description||null, l.quantite, l.unite||'forfait', l.prix_unitaire, l.remise_pct||0, l.montant_ht, l.ordre]
      );
    }
    await conn.commit();
    const [[facture]] = await pool.query(`
      SELECT mf.*, mc.nom_commercial, mc.siren, mc.siret, mc.adresse_facturation, mc.regime_tva, mc.iban, mc.bic,
             c.nom AS client_nom,
             ct.nom AS contact_nom, ct.prenom AS contact_prenom, ct.societe AS contact_societe,
             ct.adresse AS contact_adresse, ct.email AS contact_email
      FROM micro_factures mf
      JOIN micro_clients mc ON mc.id = mf.micro_client_id
      JOIN clients c ON c.id = mc.client_id
      JOIN micro_contacts ct ON ct.id = mf.contact_id
      WHERE mf.id = ?`, [factureId]
    );
    const [lignesResult] = await pool.query('SELECT * FROM micro_factures_lignes WHERE facture_id=? ORDER BY ordre', [factureId]);
    res.status(201).json({ ...facture, lignes: lignesResult });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally { conn.release(); }
});

// POST /factures/:id/envoyer
router.post('/factures/:id/envoyer', verifyMicroPortalToken, async (req, res) => {
  try {
    const [[facture]] = await pool.query(`
      SELECT mf.*, mc.nom_commercial, mc.siren, mc.siret, mc.adresse_facturation, mc.regime_tva, mc.iban, mc.bic,
             mc.prefixe_facture, c.nom AS client_nom,
             ct.nom AS contact_nom, ct.prenom AS contact_prenom, ct.societe AS contact_societe,
             ct.adresse AS contact_adresse, ct.email AS contact_email
      FROM micro_factures mf
      JOIN micro_clients mc ON mc.id = mf.micro_client_id
      JOIN clients c ON c.id = mc.client_id
      JOIN micro_contacts ct ON ct.id = mf.contact_id
      WHERE mf.id = ? AND mf.micro_client_id = ?`, [req.params.id, req.microClientId]
    );
    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
    if (!facture.contact_email) return res.status(400).json({ error: 'Le contact n\'a pas d\'adresse email' });

    const [lignes] = await pool.query('SELECT * FROM micro_factures_lignes WHERE facture_id=? ORDER BY ordre', [facture.id]);
    const pdfBuffer = await genererPdfFacture(facture, lignes, []);
    await fs.mkdir(FACTURE_DIR, { recursive: true });
    const filename = `${facture.numero.replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.pdf`;
    await fs.writeFile(path.join(FACTURE_DIR, filename), pdfBuffer);

    await pool.query(
      `UPDATE micro_factures SET statut='envoyee', pdf_url=? WHERE id=?`,
      [`/micro-factures-pdf/${filename}`, facture.id]
    );

    const nom = facture.nom_commercial || facture.client_nom;
    const echeance = new Date(facture.date_echeance).toLocaleDateString('fr-FR');
    await sendEmail({
      to: facture.contact_email,
      toName: [facture.contact_prenom, facture.contact_nom].filter(Boolean).join(' '),
      subject: `Facture ${facture.numero} — ${nom}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto">
          <div style="background:#0F1F4B;padding:24px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">${nom}</h2>
          </div>
          <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p>Bonjour ${facture.contact_prenom || facture.contact_nom || ''},</p>
            <p>Veuillez trouver ci-joint la facture <strong>${facture.numero}</strong>${facture.objet ? ` — ${facture.objet}` : ''}.</p>
            <p><strong>Montant : ${Number(facture.montant_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong></p>
            <p>Date d'échéance : <strong>${echeance}</strong></p>
            ${facture.iban ? `<p>Règlement par virement :<br>IBAN : <strong>${facture.iban}</strong>${facture.bic ? `<br>BIC : <strong>${facture.bic}</strong>` : ''}</p>` : ''}
            <p style="font-size:12px;color:#6b7280">Pénalités de retard : taux BCE + 10 points. Indemnité forfaitaire de recouvrement : 40 €. TVA non applicable, art. 293 B du CGI.</p>
          </div>
        </div>`,
      attachments: [{ base64: pdfBuffer.toString('base64'), filename: `Facture_${facture.numero}.pdf` }],
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/micro-portail/devis
router.get('/devis', verifyMicroPortalToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT md.*, ct.nom, ct.prenom, ct.societe
       FROM micro_devis md
       JOIN micro_contacts ct ON ct.id = md.contact_id
       WHERE md.micro_client_id = ?
       ORDER BY md.date_emission DESC`,
      [req.microClientId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/micro-portail/devis/:id
router.get('/devis/:id', verifyMicroPortalToken, async (req, res) => {
  try {
    const [[devis]] = await pool.query(
      `SELECT md.*, ct.nom, ct.prenom, ct.societe, ct.email, ct.adresse
       FROM micro_devis md
       JOIN micro_contacts ct ON ct.id = md.contact_id
       WHERE md.id = ? AND md.micro_client_id = ?`,
      [req.params.id, req.microClientId]
    );
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' });
    const [lignes] = await pool.query(
      'SELECT * FROM micro_devis_lignes WHERE devis_id = ? ORDER BY ordre',
      [devis.id]
    );
    res.json({ ...devis, lignes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/micro-portail/devis/:id/pdf
router.get('/devis/:id/pdf', verifyMicroPortalToken, async (req, res) => {
  try {
    const [[devis]] = await pool.query(
      `SELECT md.*, mc.nom_commercial, mc.siren, mc.siret, mc.adresse_facturation, mc.regime_tva, mc.iban, mc.bic,
              mc.prefixe_devis, c.nom AS client_nom,
              ct.nom AS contact_nom, ct.prenom AS contact_prenom, ct.societe AS contact_societe, ct.adresse AS contact_adresse
       FROM micro_devis md
       JOIN micro_clients mc ON mc.id = md.micro_client_id
       JOIN clients c ON c.id = mc.client_id
       JOIN micro_contacts ct ON ct.id = md.contact_id
       WHERE md.id = ? AND md.micro_client_id = ?`,
      [req.params.id, req.microClientId]
    );
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' });
    const [lignes] = await pool.query('SELECT * FROM micro_devis_lignes WHERE devis_id=? ORDER BY ordre', [devis.id]);
    const buf = await genererPdfDevis(devis, lignes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Devis_${devis.numero}.pdf"`);
    res.send(buf);
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACTURES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/micro-portail/factures
router.get('/factures', verifyMicroPortalToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT mf.*, ct.nom, ct.prenom, ct.societe
       FROM micro_factures mf
       JOIN micro_contacts ct ON ct.id = mf.contact_id
       WHERE mf.micro_client_id = ?
       ORDER BY mf.date_emission DESC`,
      [req.microClientId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/micro-portail/factures/:id
router.get('/factures/:id', verifyMicroPortalToken, async (req, res) => {
  try {
    const [[facture]] = await pool.query(
      `SELECT mf.*, mc.nom_commercial, mc.siren, mc.siret, mc.adresse_facturation, mc.regime_tva, mc.iban, mc.bic,
              c.nom AS client_nom, ct.nom AS contact_nom, ct.prenom AS contact_prenom,
              ct.societe AS contact_societe, ct.adresse AS contact_adresse, ct.email AS contact_email
       FROM micro_factures mf
       JOIN micro_clients mc ON mc.id = mf.micro_client_id
       JOIN clients c ON c.id = mc.client_id
       JOIN micro_contacts ct ON ct.id = mf.contact_id
       WHERE mf.id = ? AND mf.micro_client_id = ?`,
      [req.params.id, req.microClientId]
    );
    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
    const [lignes] = await pool.query('SELECT * FROM micro_factures_lignes WHERE facture_id=? ORDER BY ordre', [facture.id]);
    const [paiements] = await pool.query('SELECT * FROM micro_paiements WHERE facture_id=? ORDER BY date_paiement', [facture.id]);
    res.json({ ...facture, lignes, paiements });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/micro-portail/factures/:id/pdf
router.get('/factures/:id/pdf', verifyMicroPortalToken, async (req, res) => {
  try {
    const [[facture]] = await pool.query(
      `SELECT mf.*, mc.nom_commercial, mc.siren, mc.siret, mc.adresse_facturation, mc.regime_tva, mc.iban, mc.bic,
              mc.prefixe_facture, c.nom AS client_nom,
              ct.nom AS contact_nom, ct.prenom AS contact_prenom,
              ct.societe AS contact_societe, ct.adresse AS contact_adresse
       FROM micro_factures mf
       JOIN micro_clients mc ON mc.id = mf.micro_client_id
       JOIN clients c ON c.id = mc.client_id
       JOIN micro_contacts ct ON ct.id = mf.contact_id
       WHERE mf.id = ? AND mf.micro_client_id = ?`,
      [req.params.id, req.microClientId]
    );
    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
    const [lignes] = await pool.query('SELECT * FROM micro_factures_lignes WHERE facture_id=? ORDER BY ordre', [facture.id]);
    const [paiements] = await pool.query('SELECT * FROM micro_paiements WHERE facture_id=? ORDER BY date_paiement', [facture.id]);
    const buf = await genererPdfFacture(facture, lignes, paiements);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Facture_${facture.numero}.pdf"`);
    res.send(buf);
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIVRE DES RECETTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/micro-portail/livre-recettes?annee=
router.get('/livre-recettes', verifyMicroPortalToken, async (req, res) => {
  const annee = parseInt(req.query.annee) || new Date().getFullYear();
  try {
    const [rows] = await pool.query(
      `SELECT lr.* FROM micro_livre_recettes lr
       WHERE lr.micro_client_id=? AND YEAR(lr.date_encaissement)=?
       ORDER BY lr.date_encaissement, lr.id`,
      [req.microClientId, annee]
    );
    const total = rows.reduce((s, r) => s + Number(r.montant_encaisse), 0);
    const trimestres = [0, 0, 0, 0];
    rows.forEach(r => {
      const m = new Date(r.date_encaissement).getMonth();
      trimestres[Math.floor(m / 3)] += Number(r.montant_encaisse);
    });
    res.json({ rows, total, trimestres, annee });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN (CRM token requis)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/micro-portail/admin/create-access
router.post('/admin/create-access', verifyToken, async (req, res) => {
  const { micro_client_id, email, password } = req.body;
  if (!micro_client_id || !email || !password) return res.status(400).json({ error: 'micro_client_id, email et password requis' });
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe minimum 8 caractères' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO micro_portail_access (micro_client_id, email, password_hash, actif)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE email=VALUES(email), password_hash=VALUES(password_hash), actif=1, updated_at=NOW()`,
      [micro_client_id, email, hash]
    );
    res.json({ success: true, message: 'Accès portail créé / mis à jour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/micro-portail/admin/reset-password/:mcId
router.put('/admin/reset-password/:mcId', verifyToken, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Mot de passe minimum 8 caractères' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'UPDATE micro_portail_access SET password_hash=?, updated_at=NOW() WHERE micro_client_id=?',
      [hash, req.params.mcId]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Aucun accès portail pour ce micro-client' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/micro-portail/admin/revoke/:mcId
router.delete('/admin/revoke/:mcId', verifyToken, async (req, res) => {
  try {
    await pool.query('UPDATE micro_portail_access SET actif=0 WHERE micro_client_id=?', [req.params.mcId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/micro-portail/admin/access/:mcId
router.get('/admin/access/:mcId', verifyToken, async (req, res) => {
  try {
    const [[acc]] = await pool.query(
      'SELECT id, email, actif, derniere_connexion, created_at FROM micro_portail_access WHERE micro_client_id=?',
      [req.params.mcId]
    );
    res.json(acc || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/micro-portail/livre-recettes/pdf?annee= (query token supported)
router.get('/livre-recettes/pdf', verifyMicroPortalToken, async (req, res) => {
  const annee = parseInt(req.query.annee) || new Date().getFullYear();
  try {
    const mc = await getMicroClient(req.microClientId);
    if (!mc) return res.status(404).json({ error: 'Micro-client introuvable' });

    const [rows] = await pool.query(
      `SELECT lr.* FROM micro_livre_recettes lr
       WHERE lr.micro_client_id=? AND YEAR(lr.date_encaissement)=?
       ORDER BY lr.date_encaissement, lr.id`,
      [req.microClientId, annee]
    );

    const total = rows.reduce((s, r) => s + Number(r.montant_encaisse), 0);
    const trimestres = [0, 0, 0, 0];
    rows.forEach(r => {
      const m = new Date(r.date_encaissement).getMonth();
      trimestres[Math.floor(m / 3)] += Number(r.montant_encaisse);
    });

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Livre_Recettes_${annee}.pdf"`);
    doc.pipe(res);

    const EUR = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);
    const fmtD = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
    const BLEU = '#0F1F4B'; const W = 515;

    doc.rect(40, 40, W, 56).fill(BLEU);
    doc.fillColor('#fff').fontSize(16).font('Helvetica-Bold').text('LIVRE DES RECETTES', 52, 52);
    doc.fontSize(11).font('Helvetica').text(`${mc.nom_commercial || mc.client_nom} · Exercice ${annee}`, 52, 74);
    doc.fillColor('#374151').fontSize(9).font('Helvetica')
      .text(`Édité le ${fmtD(new Date())} · Données conformes BOFiP`, 40, 108);

    const TRI = ['T1 (Jan-Mar)', 'T2 (Avr-Jun)', 'T3 (Jul-Sep)', 'T4 (Oct-Déc)'];
    const tw = (W - 9) / 4;
    trimestres.forEach((t, i) => {
      const tx = 40 + i * (tw + 3);
      doc.rect(tx, 124, tw, 52).fill('#f3f4f6').stroke('#e5e7eb');
      doc.fillColor('#9ca3af').fontSize(8).font('Helvetica-Bold').text(TRI[i], tx + 6, 130, { width: tw - 12 });
      doc.fillColor(t > 0 ? BLEU : '#d1d5db').fontSize(13).font('Helvetica-Bold').text(EUR(t), tx + 6, 144, { width: tw - 12 });
      doc.fillColor('#9ca3af').fontSize(7).font('Helvetica').text('Base déclaration URSSAF', tx + 6, 161, { width: tw - 12 });
    });

    doc.rect(40, 186, W, 32).fill(BLEU);
    doc.fillColor('#fff').fontSize(10).font('Helvetica').text(`CA total encaissé ${annee}`, 52, 192);
    doc.fillColor('#fff').fontSize(14).font('Helvetica-Bold').text(EUR(total), 52, 192, { align: 'right', width: W - 24 });

    const COL = [28, 60, 78, 120, 150, 79];
    const HEADERS = ['#', 'Date', 'N° Facture', 'Client', 'Nature prestation', 'Montant (€)'];
    let y = 232;
    doc.rect(40, y, W, 18).fill(BLEU);
    let cx = 40;
    HEADERS.forEach((h, i) => {
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold').text(h, cx + 3, y + 5, { width: COL[i] - 6, align: i === 5 ? 'right' : 'left' });
      cx += COL[i];
    });
    y += 18;
    rows.forEach((r, idx) => {
      if (y + 16 > 800) { doc.addPage(); y = 40; }
      doc.rect(40, y, W, 16).fill(idx % 2 === 0 ? '#fff' : '#f9fafb');
      let rx = 40;
      [String(idx + 1), fmtD(r.date_encaissement), r.reference_facture, r.client_nom, r.nature_prestation, EUR(r.montant_encaisse)].forEach((v, i) => {
        doc.fillColor('#374151').fontSize(7.5).font(i === 5 ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(v), rx + 3, y + 4, { width: COL[i] - 6, align: i === 5 ? 'right' : 'left', ellipsis: true });
        rx += COL[i];
      });
      y += 16;
    });
    doc.rect(40, y, W, 20).fill('#f3f4f6').stroke('#e5e7eb');
    doc.fillColor(BLEU).fontSize(9).font('Helvetica-Bold').text(`Total ${annee} — ${rows.length} encaissement(s)`, 43, y + 6, { width: W - 90 });
    doc.fillColor(BLEU).fontSize(10).font('Helvetica-Bold').text(EUR(total), 43, y + 5, { align: 'right', width: W - 16 });
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
      .text('Livre des recettes généré automatiquement · Données conformes BOFiP · Aucune suppression possible', 40, y + 28, { width: W, align: 'center' });
    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

module.exports = router;
