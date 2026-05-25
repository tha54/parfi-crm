const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');
const { genererPdfFacture } = require('../utils/microFacturePdf');
const { genererPdfDevis } = require('../utils/microDevisPdf');

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
      `SELECT md.*, mc.nom_commercial, mc.siren, mc.adresse_facturation, mc.regime_tva, mc.iban, mc.bic,
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
      `SELECT mf.*, mc.nom_commercial, mc.siren, mc.adresse_facturation, mc.regime_tva, mc.iban, mc.bic,
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
