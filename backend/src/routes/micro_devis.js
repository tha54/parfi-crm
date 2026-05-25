const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { randomUUID } = require('crypto');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/mailer');
const { genererPdfDevis } = require('../utils/microDevisPdf');

const PDF_DIR = '/opt/parfi-data/micro-devis';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://163.172.158.24';

// Ensure PDF storage directory exists
fs.mkdir(PDF_DIR, { recursive: true }).catch(() => {});

// ── Helper : fetch devis with context ────────────────────────────────────────
async function fetchDevis(id) {
  const [[row]] = await pool.query(
    `SELECT
       md.*,
       mc.nom_commercial, mc.siren, mc.siret, mc.adresse_facturation,
       mc.regime_tva, mc.prefixe_devis,
       c.nom AS client_nom, c.id AS client_crm_id,
       mc2.nom AS contact_nom, mc2.prenom AS contact_prenom,
       mc2.societe AS contact_societe, mc2.adresse AS contact_adresse,
       mc2.email AS contact_email
     FROM micro_devis md
     JOIN micro_clients mc ON mc.id = md.micro_client_id
     JOIN clients c ON c.id = mc.client_id
     JOIN micro_contacts mc2 ON mc2.id = md.contact_id
     WHERE md.id = ?`,
    [id]
  );
  return row || null;
}

async function fetchLignes(devisId) {
  const [rows] = await pool.query(
    'SELECT * FROM micro_devis_lignes WHERE devis_id = ? ORDER BY ordre, id',
    [devisId]
  );
  return rows;
}

// ── GET /api/micro-devis/next-numero/:microClientId ───────────────────────────
// Doit être AVANT /:id pour ne pas être capturé
router.get('/next-numero/:microClientId', verifyToken, async (req, res) => {
  try {
    const [[mc]] = await pool.query(
      'SELECT prefixe_devis FROM micro_clients WHERE id = ?',
      [req.params.microClientId]
    );
    if (!mc) return res.status(404).json({ error: 'Micro-client introuvable' });

    const prefix = mc.prefixe_devis || 'DEV';
    const year = new Date().getFullYear();
    const pattern = `${prefix}-${year}-%`;

    const [[{ maxNum }]] = await pool.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) AS maxNum
       FROM micro_devis
       WHERE micro_client_id = ? AND numero LIKE ?`,
      [req.params.microClientId, pattern]
    );

    const next = (maxNum || 0) + 1;
    const numero = `${prefix}-${year}-${String(next).padStart(4, '0')}`;
    res.json({ numero });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-devis/signature/:token — PUBLIC (no auth) ─────────────────
router.get('/signature/:token', async (req, res) => {
  try {
    const [[devis]] = await pool.query(
      `SELECT md.*, mc.nom_commercial, mc.siren, mc.adresse_facturation, mc.regime_tva,
              c.nom AS client_nom,
              mc2.nom AS contact_nom, mc2.prenom AS contact_prenom,
              mc2.societe AS contact_societe, mc2.adresse AS contact_adresse, mc2.email AS contact_email
       FROM micro_devis md
       JOIN micro_clients mc ON mc.id = md.micro_client_id
       JOIN clients c ON c.id = mc.client_id
       JOIN micro_contacts mc2 ON mc2.id = md.contact_id
       WHERE md.signature_token = ?`,
      [req.params.token]
    );
    if (!devis) return res.status(404).json({ error: 'Devis introuvable ou lien invalide' });
    if (devis.statut === 'refuse') return res.status(410).json({ error: 'Ce devis a été refusé' });
    if (devis.statut === 'converti') return res.status(410).json({ error: 'Ce devis a déjà été converti en facture' });

    const lignes = await fetchLignes(devis.id);
    res.json({ devis, lignes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/micro-devis/signature/:token/signer — PUBLIC (no auth) ─────────
router.post('/signature/:token/signer', async (req, res) => {
  try {
    const [[devis]] = await pool.query(
      `SELECT md.*, mc2.email AS contact_email, mc2.nom AS contact_nom,
              mc.nom_commercial, c.nom AS client_nom, mc.client_id
       FROM micro_devis md
       JOIN micro_clients mc ON mc.id = md.micro_client_id
       JOIN clients c ON c.id = mc.client_id
       JOIN micro_contacts mc2 ON mc2.id = md.contact_id
       WHERE md.signature_token = ?`,
      [req.params.token]
    );
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' });
    if (devis.signature_date) return res.status(409).json({ error: 'Devis déjà signé' });
    if (!['envoye', 'brouillon'].includes(devis.statut)) {
      return res.status(409).json({ error: 'Ce devis ne peut plus être signé' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    await pool.query(
      `UPDATE micro_devis SET signature_date = NOW(), signature_ip = ?, statut = 'signe'
       WHERE id = ?`,
      [ip, devis.id]
    );

    // Email de confirmation au cabinet
    try {
      const [[cab]] = await pool.query('SELECT emailExpediteur FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
      if (cab?.emailExpediteur) {
        await sendEmail({
          to: cab.emailExpediteur,
          subject: `Devis ${devis.numero} signé par ${devis.contact_nom}`,
          htmlContent: `<p>Le devis <strong>${devis.numero}</strong> a été signé en ligne par <strong>${devis.contact_nom}</strong> le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} (IP : ${ip}).</p>`,
        });
      }
    } catch (_) { /* non-bloquant */ }

    res.json({ success: true, message: 'Devis signé avec succès' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-devis?micro_client_id=X ────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  const { micro_client_id } = req.query;
  if (!micro_client_id) return res.status(400).json({ error: 'micro_client_id requis' });
  try {
    const [rows] = await pool.query(
      `SELECT md.*,
              mc2.nom AS contact_nom, mc2.prenom AS contact_prenom,
              mc2.societe AS contact_societe, mc2.email AS contact_email
       FROM micro_devis md
       JOIN micro_contacts mc2 ON mc2.id = md.contact_id
       WHERE md.micro_client_id = ?
       ORDER BY md.date_emission DESC, md.id DESC`,
      [micro_client_id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-devis/:id ──────────────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const devis = await fetchDevis(req.params.id);
    if (!devis) return res.status(404).json({ error: 'Non trouvé' });
    const lignes = await fetchLignes(devis.id);
    res.json({ ...devis, lignes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/micro-devis — créer ─────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const {
    micro_client_id, contact_id, numero, date_emission, date_validite,
    objet, conditions_paiement, notes, taux_tva = 0,
    lignes = [],
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Calcul totaux depuis les lignes
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
          objet, conditions_paiement, notes, taux_tva,
          montant_ht, montant_tva, montant_ttc, statut)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'brouillon')`,
      [micro_client_id, contact_id, numero, date_emission, date_validite,
       objet, conditions_paiement, notes, taux_tva,
       montantHT, montantTVA, montantTTC]
    );

    const devisId = r.insertId;

    for (const l of lignesCalc) {
      await conn.query(
        `INSERT INTO micro_devis_lignes
           (devis_id, libelle, description, quantite, unite, prix_unitaire, remise_pct, montant_ht, ordre)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [devisId, l.libelle, l.description || null, l.quantite, l.unite || 'forfait',
         l.prix_unitaire, l.remise_pct || 0, l.montant_ht, l.ordre]
      );
    }

    await conn.commit();

    const devis = await fetchDevis(devisId);
    const lignesResult = await fetchLignes(devisId);
    res.status(201).json({ ...devis, lignes: lignesResult });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── PUT /api/micro-devis/:id — modifier ───────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const {
    contact_id, date_emission, date_validite, objet,
    conditions_paiement, notes, taux_tva = 0, lignes = [],
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT statut FROM micro_devis WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Non trouvé' });
    if (existing.statut === 'signe' || existing.statut === 'converti') {
      return res.status(409).json({ error: 'Impossible de modifier un devis signé ou converti' });
    }

    let montantHT = 0;
    const lignesCalc = lignes.map((l, i) => {
      const ht = Number(l.quantite) * Number(l.prix_unitaire) * (1 - (Number(l.remise_pct) || 0) / 100);
      montantHT += ht;
      return { ...l, montant_ht: ht, ordre: l.ordre ?? i };
    });

    const montantTVA = montantHT * Number(taux_tva) / 100;
    const montantTTC = montantHT + montantTVA;

    await conn.query(
      `UPDATE micro_devis SET
         contact_id=?, date_emission=?, date_validite=?, objet=?,
         conditions_paiement=?, notes=?, taux_tva=?,
         montant_ht=?, montant_tva=?, montant_ttc=?
       WHERE id=?`,
      [contact_id, date_emission, date_validite, objet,
       conditions_paiement, notes, taux_tva,
       montantHT, montantTVA, montantTTC, req.params.id]
    );

    // Remplacer toutes les lignes
    await conn.query('DELETE FROM micro_devis_lignes WHERE devis_id = ?', [req.params.id]);
    for (const l of lignesCalc) {
      await conn.query(
        `INSERT INTO micro_devis_lignes
           (devis_id, libelle, description, quantite, unite, prix_unitaire, remise_pct, montant_ht, ordre)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [req.params.id, l.libelle, l.description || null, l.quantite, l.unite || 'forfait',
         l.prix_unitaire, l.remise_pct || 0, l.montant_ht, l.ordre]
      );
    }

    await conn.commit();

    const devis = await fetchDevis(req.params.id);
    const lignesResult = await fetchLignes(req.params.id);
    res.json({ ...devis, lignes: lignesResult });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/micro-devis/:id ───────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const [[d]] = await pool.query('SELECT statut FROM micro_devis WHERE id = ?', [req.params.id]);
    if (!d) return res.status(404).json({ error: 'Non trouvé' });
    if (d.statut !== 'brouillon') {
      return res.status(409).json({ error: 'Seuls les devis en brouillon peuvent être supprimés' });
    }
    await pool.query('DELETE FROM micro_devis WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/micro-devis/:id/envoyer — génère PDF + email + token ────────────
router.post('/:id/envoyer', verifyToken, async (req, res) => {
  try {
    const devis = await fetchDevis(req.params.id);
    if (!devis) return res.status(404).json({ error: 'Non trouvé' });

    if (!devis.contact_email) {
      return res.status(400).json({ error: 'Le contact n\'a pas d\'adresse email' });
    }

    const lignes = await fetchLignes(devis.id);

    // Générer PDF
    const pdfBuffer = await genererPdfDevis(devis, lignes);
    await fs.mkdir(PDF_DIR, { recursive: true });
    const filename = `${devis.numero.replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    await fs.writeFile(filepath, pdfBuffer);

    // Générer token signature
    const token = randomUUID();
    const signatureLink = `${APP_BASE_URL}/signature/${token}`;

    await pool.query(
      `UPDATE micro_devis SET statut = 'envoye', signature_token = ?, pdf_url = ? WHERE id = ?`,
      [token, `/micro-devis-pdf/${filename}`, devis.id]
    );

    // Envoyer email
    await sendEmail({
      to: devis.contact_email,
      toName: [devis.contact_prenom, devis.contact_nom].filter(Boolean).join(' '),
      subject: `Devis ${devis.numero} — ${devis.nom_commercial || devis.client_nom}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto">
          <div style="background:#0F1F4B;padding:24px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">${devis.nom_commercial || devis.client_nom}</h2>
          </div>
          <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p>Bonjour ${devis.contact_prenom || devis.contact_nom || ''},</p>
            <p>Veuillez trouver ci-joint votre devis <strong>${devis.numero}</strong>${devis.objet ? ` — ${devis.objet}` : ''}.</p>
            <p><strong>Montant : ${Number(devis.montant_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong></p>
            <p>Ce devis est valable jusqu'au <strong>${new Date(devis.date_validite).toLocaleDateString('fr-FR')}</strong>.</p>
            <div style="margin:28px 0;text-align:center">
              <a href="${signatureLink}"
                 style="background:#0F1F4B;color:white;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px">
                Consulter et signer le devis
              </a>
            </div>
            <p style="font-size:12px;color:#6b7280">Ou copiez ce lien dans votre navigateur :<br>${signatureLink}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
            <p style="font-size:12px;color:#6b7280">La validation de ce devis en ligne vaut acceptation selon nos conditions générales. En cas de litige : pénalités de retard au taux légal en vigueur + indemnité forfaitaire de recouvrement de 40 €.</p>
          </div>
        </div>
      `,
      attachments: [{ base64: pdfBuffer.toString('base64'), filename: `Devis_${devis.numero}.pdf` }],
    });

    res.json({ success: true, signature_token: token, signature_link: signatureLink });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/micro-devis/:id/refuser ─────────────────────────────────────────
router.post('/:id/refuser', verifyToken, async (req, res) => {
  try {
    await pool.query("UPDATE micro_devis SET statut = 'refuse' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/micro-devis/:id/dupliquer ───────────────────────────────────────
router.post('/:id/dupliquer', verifyToken, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const devis = await fetchDevis(req.params.id);
    if (!devis) return res.status(404).json({ error: 'Non trouvé' });
    const lignes = await fetchLignes(devis.id);

    // Calcul du nouveau numéro
    const numRes = await pool.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) AS maxNum
       FROM micro_devis WHERE micro_client_id = ? AND numero LIKE ?`,
      [devis.micro_client_id, `${devis.prefixe_devis}-${new Date().getFullYear()}-%`]
    );
    const next = (numRes[0][0].maxNum || 0) + 1;
    const newNumero = `${devis.prefixe_devis}-${new Date().getFullYear()}-${String(next).padStart(4, '0')}`;

    const today = new Date().toISOString().split('T')[0];
    const validite = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const [r] = await conn.query(
      `INSERT INTO micro_devis
         (micro_client_id, contact_id, numero, date_emission, date_validite,
          objet, conditions_paiement, notes, taux_tva,
          montant_ht, montant_tva, montant_ttc, statut)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'brouillon')`,
      [devis.micro_client_id, devis.contact_id, newNumero, today, validite,
       devis.objet, devis.conditions_paiement, devis.notes, devis.taux_tva,
       devis.montant_ht, devis.montant_tva, devis.montant_ttc]
    );

    for (const l of lignes) {
      await conn.query(
        `INSERT INTO micro_devis_lignes
           (devis_id, libelle, description, quantite, unite, prix_unitaire, remise_pct, montant_ht, ordre)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [r.insertId, l.libelle, l.description, l.quantite, l.unite, l.prix_unitaire, l.remise_pct, l.montant_ht, l.ordre]
      );
    }

    await conn.commit();
    const newDevis = await fetchDevis(r.insertId);
    res.status(201).json(newDevis);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/micro-devis/:id/convertir-facture ───────────────────────────────
router.post('/:id/convertir-facture', verifyToken, async (req, res) => {
  const { date_echeance, conditions_paiement } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const devis = await fetchDevis(req.params.id);
    if (!devis) return res.status(404).json({ error: 'Non trouvé' });
    if (!['signe', 'envoye'].includes(devis.statut)) {
      return res.status(409).json({ error: 'Seuls les devis envoyés ou signés peuvent être convertis' });
    }

    const lignes = await fetchLignes(devis.id);

    // Numéro facture
    const [[mc]] = await conn.query('SELECT prefixe_facture FROM micro_clients WHERE id = ?', [devis.micro_client_id]);
    const prefix = mc?.prefixe_facture || 'FAC';
    const year = new Date().getFullYear();
    const [[{ maxNum }]] = await conn.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) AS maxNum
       FROM micro_factures WHERE micro_client_id = ? AND numero LIKE ?`,
      [devis.micro_client_id, `${prefix}-${year}-%`]
    );
    const factureNumero = `${prefix}-${year}-${String((maxNum || 0) + 1).padStart(4, '0')}`;

    const today = new Date().toISOString().split('T')[0];
    const echeance = date_echeance || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const [r] = await conn.query(
      `INSERT INTO micro_factures
         (micro_client_id, contact_id, devis_id, numero, date_emission, date_echeance,
          objet, montant_ht, taux_tva, montant_tva, montant_ttc, montant_regle, solde_restant,
          conditions_paiement, statut)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?,'brouillon')`,
      [devis.micro_client_id, devis.contact_id, devis.id, factureNumero, today, echeance,
       devis.objet, devis.montant_ht, devis.taux_tva, devis.montant_tva, devis.montant_ttc,
       devis.montant_ttc, conditions_paiement || devis.conditions_paiement]
    );

    for (const l of lignes) {
      await conn.query(
        `INSERT INTO micro_factures_lignes
           (facture_id, libelle, description, quantite, unite, prix_unitaire, remise_pct, montant_ht, ordre)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [r.insertId, l.libelle, l.description, l.quantite, l.unite, l.prix_unitaire, l.remise_pct, l.montant_ht, l.ordre]
      );
    }

    await conn.query("UPDATE micro_devis SET statut = 'converti' WHERE id = ?", [devis.id]);
    await conn.commit();

    res.status(201).json({ success: true, facture_id: r.insertId, facture_numero: factureNumero });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── GET /api/micro-devis/:id/pdf ── téléchargement PDF ───────────────────────
router.get('/:id/pdf', verifyToken, async (req, res) => {
  try {
    const devis = await fetchDevis(req.params.id);
    if (!devis) return res.status(404).json({ error: 'Non trouvé' });
    const lignes = await fetchLignes(devis.id);
    const pdfBuffer = await genererPdfDevis(devis, lignes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Devis_${devis.numero}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
