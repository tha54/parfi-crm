const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/mailer');
const { genererPdfFacture } = require('../utils/microFacturePdf');

// ── Migration : table config relances ─────────────────────────────────────────
;(async () => {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'micro_relances_config'`
  );
  if (!row.n) {
    await pool.query(`
      CREATE TABLE micro_relances_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        micro_client_id INT NOT NULL UNIQUE,
        niveau1_jours INT DEFAULT 7,
        niveau1_actif TINYINT(1) DEFAULT 1,
        niveau2_jours INT DEFAULT 21,
        niveau2_actif TINYINT(1) DEFAULT 1,
        niveau3_jours INT DEFAULT 35,
        niveau3_actif TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[micro] Table micro_relances_config créée');
  }
})().catch(e => console.error('[micro] migration relances_config:', e.message));

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtEur = (n) =>
  Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

async function getConfig(microClientId) {
  const [[cfg]] = await pool.query(
    'SELECT * FROM micro_relances_config WHERE micro_client_id = ?',
    [microClientId]
  );
  return cfg || {
    micro_client_id: microClientId,
    niveau1_jours: 7, niveau1_actif: 1,
    niveau2_jours: 21, niveau2_actif: 1,
    niveau3_jours: 35, niveau3_actif: 1,
  };
}

async function fetchFactureCtx(factureId) {
  const [[f]] = await pool.query(
    `SELECT mf.*,
            mc.nom_commercial, mc.siren, mc.adresse_facturation, mc.regime_tva,
            mc.iban, mc.bic,
            c.nom AS client_nom,
            ct.nom AS contact_nom, ct.prenom AS contact_prenom,
            ct.societe AS contact_societe, ct.adresse AS contact_adresse,
            ct.email AS contact_email
     FROM micro_factures mf
     JOIN micro_clients mc ON mc.id = mf.micro_client_id
     JOIN clients c ON c.id = mc.client_id
     JOIN micro_contacts ct ON ct.id = mf.contact_id
     WHERE mf.id = ?`,
    [factureId]
  );
  return f || null;
}

async function fetchLignes(factureId) {
  const [rows] = await pool.query(
    'SELECT * FROM micro_factures_lignes WHERE facture_id = ? ORDER BY ordre, id',
    [factureId]
  );
  return rows;
}

async function niveauxDejaEnvoyes(factureId) {
  const [rows] = await pool.query(
    'SELECT DISTINCT niveau FROM micro_relances WHERE facture_id = ? AND statut = ?',
    [factureId, 'envoyee']
  );
  return new Set(rows.map(r => r.niveau));
}

// ── Templates email ───────────────────────────────────────────────────────────
function emailNiveau1(f) {
  const vendeur = f.nom_commercial || f.client_nom;
  const client = f.contact_societe || [f.contact_prenom, f.contact_nom].filter(Boolean).join(' ');
  return {
    subject: `Rappel : facture ${f.numero} en attente de règlement — ${vendeur}`,
    html: `
<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <div style="background:#0F1F4B;padding:22px 28px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">${vendeur}</h2>
  </div>
  <div style="padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">Bonjour ${f.contact_prenom || client},</p>
    <p>Nous vous adressons ce message afin de vous rappeler que la facture ci-dessous est en attente de règlement.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;border-radius:8px;overflow:hidden">
      <tr style="background:#f9fafb">
        <td style="padding:12px 16px;color:#6b7280">Référence</td>
        <td style="padding:12px 16px;font-weight:700">${f.numero}</td>
      </tr>
      ${f.objet ? `<tr><td style="padding:12px 16px;color:#6b7280">Objet</td><td style="padding:12px 16px">${f.objet}</td></tr>` : ''}
      <tr style="background:#f9fafb">
        <td style="padding:12px 16px;color:#6b7280">Montant dû</td>
        <td style="padding:12px 16px;font-weight:700;font-size:17px;color:#0F1F4B">${fmtEur(f.solde_restant || f.montant_ttc)}</td>
      </tr>
      <tr style="background:#fef2f2">
        <td style="padding:12px 16px;color:#dc2626;font-weight:600">Échéance</td>
        <td style="padding:12px 16px;color:#dc2626;font-weight:600">${fmtDate(f.date_echeance)}</td>
      </tr>
    </table>
    ${f.iban ? `<div style="background:#f0fdf4;padding:14px;border-radius:6px;margin:16px 0;font-size:13px"><strong>Coordonnées bancaires pour virement :</strong><br>IBAN : <strong>${f.iban}</strong>${f.bic ? `<br>BIC : ${f.bic}` : ''}</div>` : ''}
    <p>Vous trouverez la facture en pièce jointe. Si votre règlement est déjà en cours, veuillez ne pas tenir compte de ce message.</p>
    <p>N'hésitez pas à nous contacter pour toute question.</p>
    <p>Cordialement,<br><strong>${vendeur}</strong></p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
    <p style="font-size:11px;color:#9ca3af">En cas de non-paiement, des pénalités de retard seront appliquées au taux légal en vigueur ainsi qu'une indemnité forfaitaire de recouvrement de 40 €.</p>
  </div>
</div>`,
  };
}

function emailNiveau2(f) {
  const vendeur = f.nom_commercial || f.client_nom;
  const client = f.contact_societe || [f.contact_prenom, f.contact_nom].filter(Boolean).join(' ');
  const joursRetard = Math.floor((Date.now() - new Date(f.date_echeance).getTime()) / 86400000);
  return {
    subject: `2ème rappel — Facture ${f.numero} impayée (${joursRetard} jours de retard) — ${vendeur}`,
    html: `
<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <div style="background:#c2410c;padding:22px 28px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">Deuxième rappel — ${vendeur}</h2>
  </div>
  <div style="padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p>Bonjour ${f.contact_prenom || client},</p>
    <p><strong>Malgré notre premier rappel, la facture suivante reste impayée depuis ${joursRetard} jours.</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr style="background:#fef2f2;border:1px solid #fca5a5">
        <td style="padding:12px 16px;color:#dc2626;font-weight:600">Référence</td>
        <td style="padding:12px 16px;font-weight:700;color:#dc2626">${f.numero}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280">Montant initial</td>
        <td style="padding:12px 16px">${fmtEur(f.montant_ttc)}</td>
      </tr>
      <tr style="background:#fef2f2">
        <td style="padding:12px 16px;color:#dc2626;font-weight:600">Solde restant dû</td>
        <td style="padding:12px 16px;font-weight:700;font-size:17px;color:#dc2626">${fmtEur(f.solde_restant || f.montant_ttc)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b7280">Échue depuis</td>
        <td style="padding:12px 16px;font-weight:600">${fmtDate(f.date_echeance)} (${joursRetard} jours)</td>
      </tr>
    </table>
    ${f.iban ? `<div style="background:#fff7ed;border:1px solid #fed7aa;padding:14px;border-radius:6px;margin:16px 0;font-size:13px"><strong>Pour régulariser immédiatement :</strong><br>IBAN : <strong>${f.iban}</strong>${f.bic ? `<br>BIC : ${f.bic}` : ''}</div>` : ''}
    <p>Nous vous demandons de bien vouloir procéder au règlement de cette facture dans les plus brefs délais.</p>
    <p>À défaut de règlement dans un délai de 7 jours, nous nous réservons le droit d'engager les procédures de recouvrement prévues par la loi.</p>
    <p>Cordialement,<br><strong>${vendeur}</strong></p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
    <p style="font-size:11px;color:#9ca3af">Pénalités de retard au taux directeur BCE + 10 points · Indemnité forfaitaire de recouvrement : 40 € · (art. L. 441-6 C.com.)</p>
  </div>
</div>`,
  };
}

function emailNiveau3(f) {
  const vendeur = f.nom_commercial || f.client_nom;
  const client = f.contact_societe || [f.contact_prenom, f.contact_nom].filter(Boolean).join(' ');
  const joursRetard = Math.floor((Date.now() - new Date(f.date_echeance).getTime()) / 86400000);
  const dateLettre = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return {
    subject: `MISE EN DEMEURE — Facture ${f.numero} — ${fmtEur(f.solde_restant || f.montant_ttc)} — ${vendeur}`,
    html: `
<div style="font-family:serif;max-width:620px;margin:auto;border:2px solid #111">
  <div style="background:#111;padding:18px 28px">
    <h2 style="color:#fff;margin:0;font-size:16px;text-transform:uppercase;letter-spacing:2px">Mise en demeure</h2>
  </div>
  <div style="padding:32px">
    <p style="font-size:13px;color:#6b7280;margin-bottom:24px">${dateLettre}</p>
    <p><strong>${client}</strong><br>Objet : MISE EN DEMEURE DE PAYER — Facture ${f.numero}</p>
    <p>Par la présente lettre, nous vous mettons en demeure de régler sans délai la somme de :</p>
    <div style="text-align:center;margin:24px 0;padding:20px;border:2px solid #111">
      <div style="font-size:28px;font-weight:700">${fmtEur(f.solde_restant || f.montant_ttc)}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px">correspondant à la facture ${f.numero} du ${fmtDate(f.date_emission)}, échue le ${fmtDate(f.date_echeance)} (${joursRetard} jours de retard)</div>
    </div>
    <p>Des <strong>pénalités de retard</strong> au taux directeur de la BCE majoré de 10 points sont exigibles de plein droit depuis la date d'échéance, sans qu'un rappel soit nécessaire (art. L. 441-6 C.com.).</p>
    <p>Une <strong>indemnité forfaitaire de recouvrement de 40 €</strong> est également due (décret n° 2012-1115).</p>
    <p>À défaut de règlement sous <strong>8 jours</strong> à compter de la réception de la présente, nous nous réservons le droit d'engager toute procédure judiciaire de recouvrement sans autre préavis, les frais engagés étant à votre charge.</p>
    ${f.iban ? `<div style="background:#f9fafb;border:1px solid #d1d5db;padding:14px;margin:20px 0;font-size:13px"><strong>Coordonnées bancaires :</strong><br>IBAN : ${f.iban}${f.bic ? `<br>BIC : ${f.bic}` : ''}</div>` : ''}
    <p style="margin-top:32px">Fait pour valoir ce que de droit.</p>
    <p><strong>${vendeur}</strong>${f.siren ? `<br>SIREN : ${f.siren}` : ''}</p>
  </div>
</div>`,
  };
}

const EMAIL_BUILDERS = [null, emailNiveau1, emailNiveau2, emailNiveau3];

// ── Logique principale check-and-send ─────────────────────────────────────────
async function checkAndSendRelances() {
  // Toutes les factures en retard potentiel
  const [factures] = await pool.query(
    `SELECT mf.id, mf.micro_client_id, mf.date_echeance, mf.statut,
            mf.montant_ttc, mf.solde_restant, mf.numero, mf.contact_id
     FROM micro_factures mf
     WHERE mf.statut IN ('envoyee','partiellement_payee')
       AND mf.date_echeance <= CURDATE()`
  );

  if (!factures.length) return { processed: 0, sent: 0 };

  let sent = 0;

  // Grouper par micro_client pour n'appeler getConfig qu'une fois par client
  const byClient = {};
  factures.forEach(f => {
    if (!byClient[f.micro_client_id]) byClient[f.micro_client_id] = [];
    byClient[f.micro_client_id].push(f);
  });

  for (const [mcId, facs] of Object.entries(byClient)) {
    const cfg = await getConfig(mcId);

    for (const f of facs) {
      const joursRetard = Math.floor((Date.now() - new Date(f.date_echeance).getTime()) / 86400000);

      // Marquer en_retard si ce n'est pas encore fait
      if (joursRetard >= 1 && f.statut !== 'en_retard') {
        await pool.query(
          "UPDATE micro_factures SET statut = 'en_retard' WHERE id = ?",
          [f.id]
        ).catch(() => {});
      }

      const dejaEnvoyes = await niveauxDejaEnvoyes(f.id);

      const niveaux = [
        { niveau: 1, jours: cfg.niveau1_jours, actif: cfg.niveau1_actif },
        { niveau: 2, jours: cfg.niveau2_jours, actif: cfg.niveau2_actif },
        { niveau: 3, jours: cfg.niveau3_jours, actif: cfg.niveau3_actif },
      ];

      for (const { niveau, jours, actif } of niveaux) {
        if (!actif) continue;
        if (dejaEnvoyes.has(niveau)) continue;
        if (joursRetard < jours) continue;

        try {
          const factureCtx = await fetchFactureCtx(f.id);
          if (!factureCtx?.contact_email) continue;

          const lignes = await fetchLignes(f.id);
          const paiements = [];

          const pdfBuffer = await genererPdfFacture(factureCtx, lignes, paiements);
          const { subject, html } = EMAIL_BUILDERS[niveau](factureCtx);

          await sendEmail({
            to: factureCtx.contact_email,
            toName: [factureCtx.contact_prenom, factureCtx.contact_nom].filter(Boolean).join(' '),
            subject,
            htmlContent: html,
            attachments: [{ base64: pdfBuffer.toString('base64'), filename: `Facture_${factureCtx.numero}.pdf` }],
          });

          await pool.query(
            `INSERT INTO micro_relances (facture_id, niveau, date_envoi, email_destinataire, statut)
             VALUES (?,?,NOW(),?,'envoyee')`,
            [f.id, niveau, factureCtx.contact_email]
          );

          dejaEnvoyes.add(niveau);
          sent++;
          console.log(`[micro-relances] Niveau ${niveau} envoyé — facture ${factureCtx.numero}`);
        } catch (e) {
          console.error(`[micro-relances] Erreur niveau ${niveau} facture ${f.id}:`, e.message);
          await pool.query(
            `INSERT INTO micro_relances (facture_id, niveau, date_envoi, email_destinataire, statut)
             VALUES (?,?,NOW(),'','echec')`,
            [f.id, niveau]
          ).catch(() => {});
        }
      }
    }
  }

  return { processed: factures.length, sent };
}

// ── GET /api/micro-relances/config/:microClientId ─────────────────────────────
router.get('/config/:microClientId', verifyToken, async (req, res) => {
  try {
    const cfg = await getConfig(req.params.microClientId);
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/micro-relances/config/:microClientId ─────────────────────────────
router.put('/config/:microClientId', verifyToken, async (req, res) => {
  const { niveau1_jours, niveau1_actif, niveau2_jours, niveau2_actif, niveau3_jours, niveau3_actif } = req.body;
  try {
    await pool.query(
      `INSERT INTO micro_relances_config
         (micro_client_id, niveau1_jours, niveau1_actif, niveau2_jours, niveau2_actif, niveau3_jours, niveau3_actif)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         niveau1_jours=VALUES(niveau1_jours), niveau1_actif=VALUES(niveau1_actif),
         niveau2_jours=VALUES(niveau2_jours), niveau2_actif=VALUES(niveau2_actif),
         niveau3_jours=VALUES(niveau3_jours), niveau3_actif=VALUES(niveau3_actif),
         updated_at=NOW()`,
      [req.params.microClientId, niveau1_jours, niveau1_actif ? 1 : 0,
       niveau2_jours, niveau2_actif ? 1 : 0, niveau3_jours, niveau3_actif ? 1 : 0]
    );
    const cfg = await getConfig(req.params.microClientId);
    res.json(cfg);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-relances/historique/:microClientId ─────────────────────────
router.get('/historique/:microClientId', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT mr.*, mf.numero AS facture_numero, mf.montant_ttc,
              ct.nom AS contact_nom, ct.prenom AS contact_prenom, ct.societe AS contact_societe
       FROM micro_relances mr
       JOIN micro_factures mf ON mf.id = mr.facture_id
       JOIN micro_contacts ct ON ct.id = mf.contact_id
       WHERE mf.micro_client_id = ?
       ORDER BY mr.date_envoi DESC`,
      [req.params.microClientId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-relances/by-facture/:factureId ─────────────────────────────
router.get('/by-facture/:factureId', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM micro_relances WHERE facture_id = ? ORDER BY date_envoi',
      [req.params.factureId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/micro-relances/envoyer-manuel/:factureId ────────────────────────
router.post('/envoyer-manuel/:factureId', verifyToken, async (req, res) => {
  const { niveau } = req.body;
  if (![1, 2, 3].includes(Number(niveau))) {
    return res.status(400).json({ error: 'niveau doit être 1, 2 ou 3' });
  }
  try {
    const factureCtx = await fetchFactureCtx(req.params.factureId);
    if (!factureCtx) return res.status(404).json({ error: 'Facture introuvable' });
    if (!factureCtx.contact_email) return res.status(400).json({ error: 'Pas d\'email sur ce contact' });

    const lignes = await fetchLignes(req.params.factureId);
    const pdfBuffer = await genererPdfFacture(factureCtx, lignes, []);
    const { subject, html } = EMAIL_BUILDERS[Number(niveau)](factureCtx);

    await sendEmail({
      to: factureCtx.contact_email,
      toName: [factureCtx.contact_prenom, factureCtx.contact_nom].filter(Boolean).join(' '),
      subject,
      htmlContent: html,
      attachments: [{ base64: pdfBuffer.toString('base64'), filename: `Facture_${factureCtx.numero}.pdf` }],
    });

    await pool.query(
      `INSERT INTO micro_relances (facture_id, niveau, date_envoi, email_destinataire, statut)
       VALUES (?,?,NOW(),?,'envoyee')`,
      [req.params.factureId, niveau, factureCtx.contact_email]
    );

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/micro-relances/check-and-send ─── déclenché manuellement ou cron
router.post('/check-and-send', verifyToken, async (req, res) => {
  try {
    const result = await checkAndSendRelances();
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router, checkAndSendRelances };
