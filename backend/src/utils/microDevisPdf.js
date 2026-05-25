const PDFDocument = require('pdfkit');

const BLUE = '#0F1F4B';
const GRAY = '#6b7c93';
const LIGHT = '#f0f4fa';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

function fmtEur(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/**
 * Génère un buffer PDF pour un devis micro-entrepreneur.
 * @param {object} devis  - Row from micro_devis JOIN micro_clients JOIN micro_contacts
 * @param {array}  lignes - Rows from micro_devis_lignes
 * @returns {Promise<Buffer>}
 */
function genererPdfDevis(devis, lignes) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = 495; // usable width (595 - 2*50)

    // ── Header vendeur ─────────────────────────────────────────────────────────
    doc.rect(50, 50, W, 80).fill(BLUE);
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
       .text(devis.nom_commercial || devis.client_nom || 'Micro-entrepreneur', 65, 62, { width: W - 130 });
    if (devis.adresse_facturation) {
      doc.fontSize(9).font('Helvetica')
         .text(devis.adresse_facturation.replace(/\n/g, ' • '), 65, 84, { width: W - 130 });
    }
    if (devis.siren) {
      doc.fontSize(9).text(`SIREN : ${devis.siren}`, 65, 100, { width: W - 130 });
    }

    // ── DEVIS label (top right) ────────────────────────────────────────────────
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
       .text('DEVIS', 430, 62, { width: 110, align: 'right' });
    doc.fontSize(10).font('Helvetica')
       .text(devis.numero, 430, 88, { width: 110, align: 'right' });

    let y = 150;

    // ── Bloc info devis / client ────────────────────────────────────────────────
    // Info devis (gauche)
    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold')
       .text('DATE D\'ÉMISSION', 50, y);
    doc.fillColor('#111').fontSize(10).font('Helvetica')
       .text(fmtDate(devis.date_emission), 50, y + 12);

    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold')
       .text('DATE DE VALIDITÉ', 160, y);
    doc.fillColor('#111').fontSize(10).font('Helvetica')
       .text(fmtDate(devis.date_validite), 160, y + 12);

    // Client (droite)
    const clientNom = [devis.contact_prenom, devis.contact_nom].filter(Boolean).join(' ') || '—';
    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold')
       .text('CLIENT', 360, y, { width: 185, align: 'left' });
    doc.fillColor('#111').fontSize(10).font('Helvetica-Bold')
       .text(devis.contact_societe || clientNom, 360, y + 12, { width: 185 });
    if (devis.contact_societe) {
      doc.fontSize(9).font('Helvetica').text(clientNom, 360, y + 26, { width: 185 });
    }
    if (devis.contact_adresse) {
      doc.fontSize(9).font('Helvetica').fillColor(GRAY)
         .text(devis.contact_adresse, 360, y + (devis.contact_societe ? 38 : 26), { width: 185 });
    }

    y += 55;

    // ── Objet ──────────────────────────────────────────────────────────────────
    if (devis.objet) {
      doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('OBJET', 50, y);
      doc.fillColor('#111').fontSize(10).font('Helvetica').text(devis.objet, 50, y + 12, { width: W });
      y += 40;
    } else {
      y += 10;
    }

    // ── Separator ─────────────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    y += 14;

    // ── Table header ──────────────────────────────────────────────────────────
    const COL = { desc: 50, qte: 300, unite: 350, pu: 390, remise: 440, total: 480 };

    doc.rect(50, y, W, 20).fill(BLUE);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    doc.text('PRESTATION', COL.desc + 4, y + 6, { width: 245 });
    doc.text('Qté', COL.qte, y + 6, { width: 45, align: 'right' });
    doc.text('Unité', COL.unite, y + 6, { width: 35 });
    doc.text('P.U.', COL.pu, y + 6, { width: 45, align: 'right' });
    doc.text('Remise', COL.remise, y + 6, { width: 35, align: 'right' });
    doc.text('HT', COL.total, y + 6, { width: 65, align: 'right' });
    y += 20;

    // ── Table rows ────────────────────────────────────────────────────────────
    lignes.forEach((l, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : LIGHT;
      const rowH = l.description ? 32 : 20;
      doc.rect(50, y, W, rowH).fill(bg);
      doc.fillColor('#111').fontSize(9).font('Helvetica-Bold')
         .text(l.libelle, COL.desc + 4, y + 5, { width: 242 });
      if (l.description) {
        doc.fontSize(8).font('Helvetica').fillColor(GRAY)
           .text(l.description, COL.desc + 4, y + 17, { width: 242 });
      }
      doc.fillColor('#111').fontSize(9).font('Helvetica')
         .text(Number(l.quantite).toLocaleString('fr-FR'), COL.qte, y + 5, { width: 45, align: 'right' })
         .text(l.unite || '', COL.unite, y + 5, { width: 35 })
         .text(fmtEur(l.prix_unitaire), COL.pu, y + 5, { width: 45, align: 'right' });
      if (Number(l.remise_pct) > 0) {
        doc.text(`${l.remise_pct}%`, COL.remise, y + 5, { width: 35, align: 'right' });
      }
      doc.font('Helvetica-Bold')
         .text(fmtEur(l.montant_ht), COL.total, y + 5, { width: 65, align: 'right' });
      y += rowH;
    });

    y += 10;

    // ── Totaux ────────────────────────────────────────────────────────────────
    const totW = 200;
    const totX = 545 - totW;

    const drawTotalRow = (label, value, bold = false, bg = null) => {
      if (bg) doc.rect(totX - 10, y - 2, totW + 10, 20).fill(bg);
      doc.fillColor(bold ? BLUE : GRAY).fontSize(9)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(label, totX - 10, y, { width: 140, align: 'left' });
      doc.fillColor(bold ? BLUE : '#111').font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(value, totX + 130, y, { width: 60, align: 'right' });
      y += 20;
    };

    drawTotalRow('Total HT', fmtEur(devis.montant_ht));
    if (Number(devis.taux_tva) > 0) {
      drawTotalRow(`TVA (${devis.taux_tva}%)`, fmtEur(devis.montant_tva));
      drawTotalRow('Total TTC', fmtEur(devis.montant_ttc), true, LIGHT);
    } else {
      drawTotalRow('Total à payer', fmtEur(devis.montant_ttc), true, LIGHT);
    }

    y += 10;

    // ── Mention franchise TVA ──────────────────────────────────────────────────
    if (devis.regime_tva === 'franchise' || Number(devis.taux_tva) === 0) {
      doc.rect(50, y, W, 22).fill('#fef9c3');
      doc.fillColor('#854d0e').fontSize(8).font('Helvetica-Oblique')
         .text('TVA non applicable, art. 293 B du CGI', 58, y + 7, { width: W - 16 });
      y += 32;
    }

    // ── Conditions de paiement ────────────────────────────────────────────────
    if (devis.conditions_paiement) {
      doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('CONDITIONS DE PAIEMENT', 50, y);
      doc.fillColor('#111').fontSize(9).font('Helvetica')
         .text(devis.conditions_paiement, 50, y + 12, { width: W });
      y += 35;
    }

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (devis.notes) {
      doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('NOTES', 50, y);
      doc.fillColor('#111').fontSize(9).font('Helvetica')
         .text(devis.notes, 50, y + 12, { width: W });
      y += 35;
    }

    // ── Signature block ────────────────────────────────────────────────────────
    if (y > 680) { doc.addPage(); y = 50; }
    y = Math.max(y, 650);

    doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    y += 10;

    // Left: date/signature client
    doc.rect(50, y, 220, 80).strokeColor('#d1d5db').lineWidth(1).stroke();
    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('BON POUR ACCORD — SIGNATURE CLIENT', 58, y + 6, { width: 204 });
    doc.fillColor(GRAY).fontSize(8).font('Helvetica').text('Date :', 58, y + 20);
    doc.fillColor(GRAY).text('Signature précédée de la mention «Lu et approuvé» :', 58, y + 34, { width: 204 });

    // Right: totals reminder
    doc.fillColor(BLUE).fontSize(14).font('Helvetica-Bold')
       .text(fmtEur(devis.montant_ttc), 400, y + 20, { width: 145, align: 'right' });
    doc.fillColor(GRAY).fontSize(9).font('Helvetica')
       .text('Montant total', 400, y + 38, { width: 145, align: 'right' });

    // ── Pied de page ──────────────────────────────────────────────────────────
    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
       .text(
         `Devis valable jusqu'au ${fmtDate(devis.date_validite)} · En cas de litige : pénalités de retard au taux légal + indemnité forfaitaire de 40 €`,
         50, 800, { width: W, align: 'center' }
       );

    doc.end();
  });
}

module.exports = { genererPdfDevis };
