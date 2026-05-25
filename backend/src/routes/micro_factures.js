const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/mailer');
const { genererPdfFacture } = require('../utils/microFacturePdf');

const PDF_DIR = '/opt/parfi-data/micro-factures';
fs.mkdir(PDF_DIR, { recursive: true }).catch(() => {});

// ── Helper : fetch facture avec contexte ──────────────────────────────────────
async function fetchFacture(id) {
  const [[row]] = await pool.query(
    `SELECT
       mf.*,
       mc.nom_commercial, mc.siren, mc.siret, mc.adresse_facturation,
       mc.regime_tva, mc.prefixe_facture, mc.iban, mc.bic,
       c.nom AS client_nom, c.id AS client_crm_id,
       ct.nom AS contact_nom, ct.prenom AS contact_prenom,
       ct.societe AS contact_societe, ct.adresse AS contact_adresse,
       ct.email AS contact_email
     FROM micro_factures mf
     JOIN micro_clients mc ON mc.id = mf.micro_client_id
     JOIN clients c ON c.id = mc.client_id
     JOIN micro_contacts ct ON ct.id = mf.contact_id
     WHERE mf.id = ?`,
    [id]
  );
  return row || null;
}

async function fetchLignes(factureId) {
  const [rows] = await pool.query(
    'SELECT * FROM micro_factures_lignes WHERE facture_id = ? ORDER BY ordre, id',
    [factureId]
  );
  return rows;
}

async function fetchPaiements(factureId) {
  const [rows] = await pool.query(
    'SELECT * FROM micro_paiements WHERE facture_id = ? ORDER BY date_paiement, id',
    [factureId]
  );
  return rows;
}

// ── GET /api/micro-factures/next-numero/:microClientId ────────────────────────
router.get('/next-numero/:microClientId', verifyToken, async (req, res) => {
  try {
    const [[mc]] = await pool.query(
      'SELECT prefixe_facture FROM micro_clients WHERE id = ?',
      [req.params.microClientId]
    );
    if (!mc) return res.status(404).json({ error: 'Micro-client introuvable' });

    const prefix = mc.prefixe_facture || 'FAC';
    const year = new Date().getFullYear();

    const [[{ maxNum }]] = await pool.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) AS maxNum
       FROM micro_factures
       WHERE micro_client_id = ? AND numero LIKE ?`,
      [req.params.microClientId, `${prefix}-${year}-%`]
    );

    const numero = `${prefix}-${year}-${String((maxNum || 0) + 1).padStart(4, '0')}`;
    res.json({ numero });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-factures?micro_client_id=X ─────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  const { micro_client_id } = req.query;
  if (!micro_client_id) return res.status(400).json({ error: 'micro_client_id requis' });
  try {
    const [rows] = await pool.query(
      `SELECT mf.*,
              ct.nom AS contact_nom, ct.prenom AS contact_prenom,
              ct.societe AS contact_societe
       FROM micro_factures mf
       JOIN micro_contacts ct ON ct.id = mf.contact_id
       WHERE mf.micro_client_id = ?
       ORDER BY mf.date_emission DESC, mf.id DESC`,
      [micro_client_id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-factures/:id ───────────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const facture = await fetchFacture(req.params.id);
    if (!facture) return res.status(404).json({ error: 'Non trouvé' });
    const [lignes, paiements] = await Promise.all([
      fetchLignes(facture.id),
      fetchPaiements(facture.id),
    ]);
    res.json({ ...facture, lignes, paiements });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/micro-factures — créer ──────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const {
    micro_client_id, contact_id, numero, date_emission, date_echeance,
    objet, conditions_paiement, notes, taux_tva = 0, lignes = [],
  } = req.body;

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
      `INSERT INTO micro_factures
         (micro_client_id, contact_id, numero, date_emission, date_echeance,
          objet, conditions_paiement, notes, taux_tva,
          montant_ht, montant_tva, montant_ttc, montant_regle, solde_restant, statut)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,'brouillon')`,
      [micro_client_id, contact_id, numero, date_emission, date_echeance,
       objet, conditions_paiement, notes, taux_tva,
       montantHT, montantTVA, montantTTC, montantTTC]
    );

    for (const l of lignesCalc) {
      await conn.query(
        `INSERT INTO micro_factures_lignes
           (facture_id, libelle, description, quantite, unite, prix_unitaire, remise_pct, montant_ht, ordre)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [r.insertId, l.libelle, l.description || null, l.quantite, l.unite || 'forfait',
         l.prix_unitaire, l.remise_pct || 0, l.montant_ht, l.ordre]
      );
    }

    await conn.commit();
    const facture = await fetchFacture(r.insertId);
    const lignesResult = await fetchLignes(r.insertId);
    res.status(201).json({ ...facture, lignes: lignesResult, paiements: [] });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── PUT /api/micro-factures/:id — modifier ────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const {
    contact_id, date_emission, date_echeance, objet,
    conditions_paiement, notes, taux_tva = 0, lignes = [],
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT statut, montant_regle FROM micro_factures WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Non trouvé' });
    if (['payee', 'annulee'].includes(existing.statut)) {
      return res.status(409).json({ error: 'Impossible de modifier une facture payée ou annulée' });
    }

    let montantHT = 0;
    const lignesCalc = lignes.map((l, i) => {
      const ht = Number(l.quantite) * Number(l.prix_unitaire) * (1 - (Number(l.remise_pct) || 0) / 100);
      montantHT += ht;
      return { ...l, montant_ht: ht, ordre: l.ordre ?? i };
    });
    const montantTVA = montantHT * Number(taux_tva) / 100;
    const montantTTC = montantHT + montantTVA;
    const solde = montantTTC - Number(existing.montant_regle);

    await conn.query(
      `UPDATE micro_factures SET
         contact_id=?, date_emission=?, date_echeance=?, objet=?,
         conditions_paiement=?, notes=?, taux_tva=?,
         montant_ht=?, montant_tva=?, montant_ttc=?, solde_restant=?
       WHERE id=?`,
      [contact_id, date_emission, date_echeance, objet,
       conditions_paiement, notes, taux_tva,
       montantHT, montantTVA, montantTTC, solde, req.params.id]
    );

    await conn.query('DELETE FROM micro_factures_lignes WHERE facture_id = ?', [req.params.id]);
    for (const l of lignesCalc) {
      await conn.query(
        `INSERT INTO micro_factures_lignes
           (facture_id, libelle, description, quantite, unite, prix_unitaire, remise_pct, montant_ht, ordre)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [req.params.id, l.libelle, l.description || null, l.quantite, l.unite || 'forfait',
         l.prix_unitaire, l.remise_pct || 0, l.montant_ht, l.ordre]
      );
    }

    await conn.commit();
    const facture = await fetchFacture(req.params.id);
    const [lignesResult, paiements] = await Promise.all([fetchLignes(req.params.id), fetchPaiements(req.params.id)]);
    res.json({ ...facture, lignes: lignesResult, paiements });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/micro-factures/:id/envoyer ──────────────────────────────────────
router.post('/:id/envoyer', verifyToken, async (req, res) => {
  try {
    const facture = await fetchFacture(req.params.id);
    if (!facture) return res.status(404).json({ error: 'Non trouvé' });
    if (!facture.contact_email) {
      return res.status(400).json({ error: 'Le contact n\'a pas d\'adresse email' });
    }

    const [lignes, paiements] = await Promise.all([fetchLignes(facture.id), fetchPaiements(facture.id)]);
    const pdfBuffer = await genererPdfFacture(facture, lignes, paiements);

    await fs.mkdir(PDF_DIR, { recursive: true });
    const filename = `${facture.numero.replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.pdf`;
    await fs.writeFile(path.join(PDF_DIR, filename), pdfBuffer);

    await pool.query(
      `UPDATE micro_factures SET statut = 'envoyee', pdf_url = ? WHERE id = ?`,
      [`/micro-factures-pdf/${filename}`, facture.id]
    );

    const fmtEur = (n) => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

    await sendEmail({
      to: facture.contact_email,
      toName: [facture.contact_prenom, facture.contact_nom].filter(Boolean).join(' '),
      subject: `Facture ${facture.numero} — ${facture.nom_commercial || facture.client_nom}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:600px;margin:auto">
          <div style="background:#0F1F4B;padding:24px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0">${facture.nom_commercial || facture.client_nom}</h2>
          </div>
          <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p>Bonjour ${facture.contact_prenom || facture.contact_nom || ''},</p>
            <p>Veuillez trouver ci-joint votre facture <strong>${facture.numero}</strong>${facture.objet ? ` — ${facture.objet}` : ''}.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#f9fafb"><td style="padding:10px 14px;font-weight:bold">Montant</td><td style="padding:10px 14px;text-align:right;font-weight:bold;font-size:18px">${fmtEur(facture.montant_ttc)}</td></tr>
              <tr><td style="padding:10px 14px;color:#6b7280">Date d'émission</td><td style="padding:10px 14px;text-align:right">${new Date(facture.date_emission).toLocaleDateString('fr-FR')}</td></tr>
              <tr style="background:#fee2e2"><td style="padding:10px 14px;color:#dc2626;font-weight:bold">Date d'échéance</td><td style="padding:10px 14px;text-align:right;color:#dc2626;font-weight:bold">${new Date(facture.date_echeance).toLocaleDateString('fr-FR')}</td></tr>
            </table>
            ${facture.iban ? `<p style="background:#f0fdf4;padding:12px;border-radius:6px;font-size:13px">Coordonnées bancaires :<br><strong>IBAN : ${facture.iban}</strong>${facture.bic ? `<br>BIC : ${facture.bic}` : ''}</p>` : ''}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
            <p style="font-size:11px;color:#9ca3af">En cas de retard de paiement, pénalités de retard au taux directeur BCE + 10 points et indemnité forfaitaire de recouvrement de 40 €.</p>
          </div>
        </div>
      `,
      attachments: [{ base64: pdfBuffer.toString('base64'), filename: `Facture_${facture.numero}.pdf` }],
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/micro-factures/:id/enregistrer-paiement ────────────────────────
router.post('/:id/enregistrer-paiement', verifyToken, async (req, res) => {
  const { date_paiement, montant, mode, reference, notes } = req.body;
  if (!date_paiement || !montant || !mode) {
    return res.status(400).json({ error: 'date_paiement, montant et mode requis' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[facture]] = await conn.query(
      `SELECT mf.*, mc.nom_commercial, c.nom AS client_nom, mc.id AS mc_id,
              ct.nom AS contact_nom, ct.prenom AS contact_prenom, ct.societe AS contact_societe
       FROM micro_factures mf
       JOIN micro_clients mc ON mc.id = mf.micro_client_id
       JOIN clients c ON c.id = mc.client_id
       JOIN micro_contacts ct ON ct.id = mf.contact_id
       WHERE mf.id = ?`,
      [req.params.id]
    );
    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
    if (facture.statut === 'annulee') return res.status(409).json({ error: 'Facture annulée' });

    // Insérer paiement
    const [rp] = await conn.query(
      `INSERT INTO micro_paiements (facture_id, date_paiement, montant, mode, reference, notes)
       VALUES (?,?,?,?,?,?)`,
      [req.params.id, date_paiement, montant, mode, reference || null, notes || null]
    );

    // Recalculer solde
    const newRegle = Number(facture.montant_regle) + Number(montant);
    const newSolde = Number(facture.montant_ttc) - newRegle;
    const newStatut = newSolde <= 0.01 ? 'payee' : 'partiellement_payee';

    await conn.query(
      'UPDATE micro_factures SET montant_regle = ?, solde_restant = ?, statut = ? WHERE id = ?',
      [newRegle, Math.max(0, newSolde), newStatut, req.params.id]
    );

    // Récupérer nature prestation (libellé des lignes)
    const [lig] = await conn.query(
      'SELECT libelle FROM micro_factures_lignes WHERE facture_id = ? ORDER BY ordre LIMIT 1',
      [req.params.id]
    );
    const nature = lig[0]?.libelle || facture.objet || 'Prestation';

    // Alimenter livre des recettes
    await conn.query(
      `INSERT INTO micro_livre_recettes
         (micro_client_id, paiement_id, date_encaissement, reference_facture,
          client_nom, nature_prestation, montant_encaisse, mode_reglement)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        facture.micro_client_id,
        rp.insertId,
        date_paiement,
        facture.numero,
        facture.contact_societe || [facture.contact_prenom, facture.contact_nom].filter(Boolean).join(' ') || '—',
        nature,
        montant,
        mode,
      ]
    );

    await conn.commit();

    res.json({
      success: true,
      paiement_id: rp.insertId,
      nouveau_statut: newStatut,
      solde_restant: Math.max(0, newSolde),
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/micro-factures/:id/annuler ──────────────────────────────────────
router.post('/:id/annuler', verifyToken, async (req, res) => {
  try {
    const [[f]] = await pool.query('SELECT statut FROM micro_factures WHERE id = ?', [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Non trouvé' });
    if (f.statut === 'payee') return res.status(409).json({ error: 'Impossible d\'annuler une facture payée' });
    await pool.query("UPDATE micro_factures SET statut = 'annulee' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-factures/:id/pdf ───────────────────────────────────────────
router.get('/:id/pdf', verifyToken, async (req, res) => {
  try {
    const facture = await fetchFacture(req.params.id);
    if (!facture) return res.status(404).json({ error: 'Non trouvé' });
    const [lignes, paiements] = await Promise.all([fetchLignes(facture.id), fetchPaiements(facture.id)]);
    const pdfBuffer = await genererPdfFacture(facture, lignes, paiements);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Facture_${facture.numero}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-factures/export-fec/:microClientId — FEC normé ────────────
router.get('/export-fec/:microClientId', verifyToken, async (req, res) => {
  try {
    const { annee = new Date().getFullYear() } = req.query;
    const [[mc]] = await pool.query(
      'SELECT mc.*, c.nom AS client_nom FROM micro_clients mc JOIN clients c ON c.id = mc.client_id WHERE mc.id = ?',
      [req.params.microClientId]
    );
    if (!mc) return res.status(404).json({ error: 'Micro-client introuvable' });

    // Factures de l'année
    const [factures] = await pool.query(
      `SELECT mf.*, ct.nom AS contact_nom, ct.prenom AS contact_prenom, ct.societe AS contact_societe
       FROM micro_factures mf
       JOIN micro_contacts ct ON ct.id = mf.contact_id
       WHERE mf.micro_client_id = ? AND YEAR(mf.date_emission) = ?
         AND mf.statut NOT IN ('brouillon','annulee')
       ORDER BY mf.date_emission, mf.numero`,
      [req.params.microClientId, annee]
    );

    // Paiements de l'année
    const [paiements] = await pool.query(
      `SELECT mp.*, mf.numero AS facture_numero, mf.micro_client_id,
              ct.nom AS contact_nom, ct.prenom AS contact_prenom, ct.societe AS contact_societe
       FROM micro_paiements mp
       JOIN micro_factures mf ON mf.id = mp.facture_id
       JOIN micro_contacts ct ON ct.id = mf.contact_id
       WHERE mf.micro_client_id = ? AND YEAR(mp.date_paiement) = ?
       ORDER BY mp.date_paiement, mp.id`,
      [req.params.microClientId, annee]
    );

    const fmtFecDate = (d) => d ? new Date(d).toISOString().split('T')[0].replace(/-/g, '') : '';
    const fmtFecMontant = (n) => Number(n || 0).toFixed(2).replace('.', ',');
    const clientNom = (f) => (f.contact_societe || [f.contact_prenom, f.contact_nom].filter(Boolean).join(' ')).replace(/[|;]/g, ' ');

    const cols = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum',
                  'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate',
                  'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet',
                  'ValidDate', 'Montantdevise', 'Idevise'];

    const rows = [cols.join('|')];

    factures.forEach(f => {
      const date = fmtFecDate(f.date_emission);
      const nom = clientNom(f);
      const lib = (f.objet || 'Prestation').replace(/[|;]/g, ' ').substring(0, 50);

      // Débit 411 (client) / Crédit 706 (prestation)
      rows.push([
        'VE', 'Ventes', f.numero, date,
        `411${f.id.toString().padStart(6, '0')}`, `Client ${nom}`,
        '', '', f.numero, date,
        lib, fmtFecMontant(f.montant_ttc), '0,00',
        '', '', date, fmtFecMontant(f.montant_ttc), 'EUR',
      ].join('|'));

      rows.push([
        'VE', 'Ventes', f.numero, date,
        '706000', 'Prestations de services',
        '', '', f.numero, date,
        lib, '0,00', fmtFecMontant(f.montant_ht),
        '', '', date, fmtFecMontant(f.montant_ht), 'EUR',
      ].join('|'));

      if (Number(f.montant_tva) > 0) {
        rows.push([
          'VE', 'Ventes', f.numero, date,
          '445710', 'TVA collectée',
          '', '', f.numero, date,
          lib, '0,00', fmtFecMontant(f.montant_tva),
          '', '', date, fmtFecMontant(f.montant_tva), 'EUR',
        ].join('|'));
      }
    });

    paiements.forEach((p, i) => {
      const date = fmtFecDate(p.date_paiement);
      const ref = p.reference || p.facture_numero;
      const ecrNum = `REG${String(i + 1).padStart(6, '0')}`;
      const nom = clientNom(p);

      // Débit 512 (banque) / Crédit 411 (client)
      rows.push([
        'BQ', 'Banque', ecrNum, date,
        '512000', 'Banque',
        '', '', ref, date,
        `Règlement ${p.facture_numero}`, fmtFecMontant(p.montant), '0,00',
        '', '', date, fmtFecMontant(p.montant), 'EUR',
      ].join('|'));

      rows.push([
        'BQ', 'Banque', ecrNum, date,
        `411${p.facture_id.toString().padStart(6, '0')}`, `Client ${nom}`,
        '', '', ref, date,
        `Règlement ${p.facture_numero}`, '0,00', fmtFecMontant(p.montant),
        '', '', date, fmtFecMontant(p.montant), 'EUR',
      ].join('|'));
    });

    const csvContent = rows.join('\r\n');
    const filename = `FEC_${mc.siren || mc.client_nom.replace(/\s/g, '_')}_${annee}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-factures/livre-recettes/:microClientId ────────────────────
router.get('/livre-recettes/:microClientId', verifyToken, async (req, res) => {
  const { annee = new Date().getFullYear() } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT lr.*, mp.mode AS mode_paiement, mp.reference
       FROM micro_livre_recettes lr
       LEFT JOIN micro_paiements mp ON mp.id = lr.paiement_id
       WHERE lr.micro_client_id = ? AND YEAR(lr.date_encaissement) = ?
       ORDER BY lr.date_encaissement, lr.id`,
      [req.params.microClientId, annee]
    );

    const total = rows.reduce((s, r) => s + Number(r.montant_encaisse), 0);

    // Totaux par trimestre
    const trimestres = [0, 0, 0, 0];
    rows.forEach(r => {
      const m = new Date(r.date_encaissement).getMonth();
      trimestres[Math.floor(m / 3)] += Number(r.montant_encaisse);
    });

    res.json({ rows, total, trimestres, annee });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/micro-factures/livre-recettes/:mcId/pdf ─────────────────────────
router.get('/livre-recettes/:microClientId/pdf', verifyToken, async (req, res) => {
  const { annee = new Date().getFullYear() } = req.query;
  try {
    const [[mc]] = await pool.query(
      `SELECT mc.*, c.nom AS client_nom
       FROM micro_clients mc
       JOIN clients c ON c.id = mc.client_id
       WHERE mc.id = ?`,
      [req.params.microClientId]
    );
    if (!mc) return res.status(404).json({ error: 'Micro-client introuvable' });

    const [rows] = await pool.query(
      `SELECT lr.*
       FROM micro_livre_recettes lr
       WHERE lr.micro_client_id = ? AND YEAR(lr.date_encaissement) = ?
       ORDER BY lr.date_encaissement, lr.id`,
      [req.params.microClientId, annee]
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
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
    const BLEU = '#0F1F4B';
    const W = 515;

    // Header
    doc.rect(40, 40, W, 56).fill(BLEU);
    doc.fillColor('#fff').fontSize(16).font('Helvetica-Bold')
      .text('LIVRE DES RECETTES', 52, 52);
    doc.fontSize(11).font('Helvetica')
      .text(`${mc.nom_commercial || mc.client_nom} · Exercice ${annee}`, 52, 74);

    // Mention légale
    doc.fillColor('#374151').fontSize(9).font('Helvetica')
      .text(`Édité le ${fmtDate(new Date())} · Données conformes aux obligations BOFiP pour le régime micro-entrepreneur`, 40, 108);

    // Résumé trimestriel
    const TRI_LABELS = ['T1 (Jan-Mar)', 'T2 (Avr-Jun)', 'T3 (Jul-Sep)', 'T4 (Oct-Déc)'];
    const tw = (W - 9) / 4;
    trimestres.forEach((t, i) => {
      const tx = 40 + i * (tw + 3);
      doc.rect(tx, 124, tw, 52).fill('#f3f4f6').stroke('#e5e7eb');
      doc.fillColor('#9ca3af').fontSize(8).font('Helvetica-Bold')
        .text(TRI_LABELS[i], tx + 6, 130, { width: tw - 12 });
      doc.fillColor(t > 0 ? BLEU : '#d1d5db').fontSize(13).font('Helvetica-Bold')
        .text(EUR(t), tx + 6, 144, { width: tw - 12 });
      doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
        .text('Base déclaration URSSAF', tx + 6, 161, { width: tw - 12 });
    });

    // Total
    doc.rect(40, 186, W, 32).fill(BLEU);
    doc.fillColor('#fff').fontSize(10).font('Helvetica')
      .text(`CA total encaissé ${annee}`, 52, 192);
    doc.fillColor('#fff').fontSize(14).font('Helvetica-Bold')
      .text(EUR(total), 52, 192, { align: 'right', width: W - 24 });

    // En-tête tableau
    const COL = [28, 60, 78, 120, 150, 79];
    const HEADERS = ['#', 'Date', 'N° Facture', 'Client', 'Nature prestation', 'Montant (€)'];
    let y = 232;

    doc.rect(40, y, W, 18).fill(BLEU);
    let cx = 40;
    HEADERS.forEach((h, i) => {
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
        .text(h, cx + 3, y + 5, { width: COL[i] - 6, align: i === 5 ? 'right' : 'left' });
      cx += COL[i];
    });
    y += 18;

    rows.forEach((r, idx) => {
      const rowH = 16;
      if (y + rowH > 800) {
        doc.addPage();
        y = 40;
      }
      doc.rect(40, y, W, rowH).fill(idx % 2 === 0 ? '#fff' : '#f9fafb');
      let rx = 40;
      const vals = [
        String(idx + 1),
        fmtDate(r.date_encaissement),
        r.reference_facture,
        r.client_nom,
        r.nature_prestation,
        EUR(r.montant_encaisse),
      ];
      vals.forEach((v, i) => {
        doc.fillColor('#374151').fontSize(7.5).font(i === 5 ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(v), rx + 3, y + 4, { width: COL[i] - 6, align: i === 5 ? 'right' : 'left', ellipsis: true });
        rx += COL[i];
      });
      y += rowH;
    });

    // Ligne total
    doc.rect(40, y, W, 20).fill('#f3f4f6').stroke('#e5e7eb');
    doc.fillColor(BLEU).fontSize(9).font('Helvetica-Bold')
      .text(`Total ${annee} — ${rows.length} encaissement(s)`, 43, y + 6, { width: W - 90 });
    doc.fillColor(BLEU).fontSize(10).font('Helvetica-Bold')
      .text(EUR(total), 43, y + 5, { align: 'right', width: W - 16 });

    y += 30;
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
      .text('Livre des recettes généré automatiquement · Données conformes BOFiP · Aucune suppression possible', 40, y, { width: W, align: 'center' });

    doc.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

module.exports = router;
