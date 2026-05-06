const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const DOCS_BASE = '/opt/parfi-data/documents';

const TYPE_MISSION_LABEL = {
  tenue_comptable:        'Tenue de comptabilité',
  revision:               'Révision',
  etablissement_comptes:  'Établissement des comptes',
  fiscal:                 'Fiscal',
  social_paie:            'Social / Paie',
  conseil:                'Conseil',
  juridique:              'Juridique',
  autre:                  'Autre',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

function fmtMontant(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' € HT';
}

/**
 * Generates a PDF for a signed LDM and registers it in the GED.
 * Returns the inserted document id.
 */
async function genererEtSauvegarderPdfLDM(ldmId, signataire_id) {
  const [[ldm]] = await pool.query(
    `SELECT l.*, c.nom AS client_nom, c.siren AS client_siren,
            CONCAT(u.prenom,' ',u.nom) AS collaborateur_nom
     FROM lettres_mission l
     LEFT JOIN clients c ON l.client_id = c.id
     LEFT JOIN utilisateurs u ON l.collaborateur_id = u.id
     WHERE l.id = ?`,
    [ldmId]
  );
  if (!ldm) throw new Error('LDM introuvable');

  // Prepare output path
  const year    = new Date().getFullYear();
  const clientId = ldm.client_id || 'general';
  const dir     = path.join(DOCS_BASE, String(clientId), String(year));
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}_LDM_${ldm.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
  const filePath = path.join(dir, filename);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);

    const W = 495; // usable width
    const BLUE = '#0F1F4B';
    const GRAY = '#6b7c93';

    // ── Header ──────────────────────────────────────────────────────────────────
    doc.rect(50, 50, W, 70).fill(BLUE);
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
       .text(ldm.cabinetNom || 'Cabinet Parfi France', 65, 65, { width: W - 30 });
    if (ldm.cabinetAdresse) {
      doc.fontSize(9).font('Helvetica')
         .text(ldm.cabinetAdresse.replace(/\n/g, ' — '), 65, 90, { width: W - 30 });
    }
    if (ldm.cabinetSiren) {
      doc.text(`SIREN : ${ldm.cabinetSiren}`, 65, 103, { width: W - 30 });
    }

    // ── Title ────────────────────────────────────────────────────────────────────
    doc.moveDown(3);
    doc.fillColor(BLUE).fontSize(20).font('Helvetica-Bold')
       .text('LETTRE DE MISSION', { align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor(GRAY)
       .text(`N° ${ldm.numero}`, { align: 'center' });
    doc.moveDown(0.5);

    // ── Infos principales ────────────────────────────────────────────────────────
    const boxY = doc.y;
    doc.rect(50, boxY, W, 1).fill('#e2e8f0');
    doc.moveDown(0.5);

    function row(label, value) {
      const y = doc.y;
      doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(label, 55, y, { width: 150 });
      doc.fillColor('#1a202c').fontSize(10).font('Helvetica').text(value || '—', 210, y, { width: W - 160 });
      doc.moveDown(0.7);
    }

    row('Client',            ldm.client_nom || '—');
    if (ldm.client_siren) row('SIREN client', ldm.client_siren);
    row('Type de mission',   TYPE_MISSION_LABEL[ldm.typeMission] || ldm.typeMission || '—');
    row('Date de début',     fmtDate(ldm.dateDebut));
    row('Date de fin',       ldm.dateFin ? fmtDate(ldm.dateFin) : 'Reconduction tacite');
    row('Honoraires HT/an',  fmtMontant(ldm.montantHonorairesHT || ldm.montant_annuel_ht));
    if (ldm.collaborateur_nom) row('Collaborateur affecté', ldm.collaborateur_nom);

    // ── Objet de la mission ───────────────────────────────────────────────────────
    if (ldm.objetMission) {
      doc.moveDown(0.5);
      doc.rect(50, doc.y, W, 1).fill('#e2e8f0');
      doc.moveDown(0.5);
      doc.fillColor(BLUE).fontSize(11).font('Helvetica-Bold').text('Objet de la mission');
      doc.moveDown(0.3);
      doc.fillColor('#1a202c').fontSize(10).font('Helvetica')
         .text(ldm.objetMission, { width: W, lineGap: 3 });
    }

    // ── Description ───────────────────────────────────────────────────────────────
    if (ldm.descriptionMission) {
      doc.moveDown(0.5);
      doc.fillColor(BLUE).fontSize(11).font('Helvetica-Bold').text('Description');
      doc.moveDown(0.3);
      doc.fillColor('#1a202c').fontSize(10).font('Helvetica')
         .text(ldm.descriptionMission, { width: W, lineGap: 3 });
    }

    // ── Modalités de paiement ─────────────────────────────────────────────────────
    if (ldm.modalitesPaiement) {
      doc.moveDown(0.5);
      doc.rect(50, doc.y, W, 1).fill('#e2e8f0');
      doc.moveDown(0.5);
      doc.fillColor(BLUE).fontSize(11).font('Helvetica-Bold').text('Modalités de paiement');
      doc.moveDown(0.3);
      doc.fillColor('#1a202c').fontSize(10).font('Helvetica')
         .text(ldm.modalitesPaiement, { width: W, lineGap: 3 });
    }

    // ── Signatures ────────────────────────────────────────────────────────────────
    doc.moveDown(1);
    doc.rect(50, doc.y, W, 1).fill('#e2e8f0');
    doc.moveDown(0.5);
    doc.fillColor(BLUE).fontSize(11).font('Helvetica-Bold').text('Signatures');
    doc.moveDown(0.5);

    const sigY = doc.y;
    // Cabinet side
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text('Pour le cabinet', 55, sigY);
    doc.fillColor('#1a202c').fontSize(10)
       .text(ldm.cabinetNom || 'Cabinet Parfi France', 55, sigY + 14);

    // Client side
    doc.fillColor(GRAY).fontSize(9).text('Le client', 310, sigY);
    doc.fillColor('#1a202c').fontSize(10)
       .text(ldm.client_nom || '—', 310, sigY + 14);
    if (ldm.dateSignatureClient) {
      doc.fillColor(GRAY).fontSize(9)
         .text(`Signé le ${fmtDate(ldm.dateSignatureClient)}`, 310, sigY + 28);
    }

    // ── Footer ────────────────────────────────────────────────────────────────────
    const pageHeight = doc.page.height;
    doc.rect(50, pageHeight - 45, W, 1).fill('#e2e8f0');
    doc.fillColor(GRAY).fontSize(8)
       .text(
         `Document généré le ${fmtDate(new Date())} — ${ldm.numero}`,
         50, pageHeight - 35, { align: 'center', width: W }
       );

    doc.end();
  });

  // File stats
  const stats = fs.statSync(filePath);

  // Register in GED
  const [result] = await pool.query(
    `INSERT INTO documents
       (nom, description, chemin, type_document, type, lettreMissionId, client_id, taille, mimeType, uploadePar)
     VALUES (?, ?, ?, 'ldm', 'lettre_mission', ?, ?, ?, 'application/pdf', ?)`,
    [
      `LDM_${ldm.numero}.pdf`,
      `Lettre de mission signée — ${ldm.client_nom || ''} — ${fmtDate(ldm.dateSignatureClient || new Date())}`,
      filePath,
      ldmId,
      ldm.client_id || null,
      stats.size,
      signataire_id || null,
    ]
  );

  return result.insertId;
}

module.exports = { genererEtSauvegarderPdfLDM };
