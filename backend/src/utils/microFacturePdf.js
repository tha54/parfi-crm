const PDFDocument = require('pdfkit');

const BLUE  = '#0F1F4B';
const GREEN = '#065f46';
const GRAY  = '#6b7c93';
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
 * Génère un buffer PDF pour une facture micro-entrepreneur (mentions légales complètes).
 * @param {object} facture - Row avec colonnes micro_clients + micro_contacts joinées
 * @param {array}  lignes  - Rows from micro_factures_lignes
 * @param {array}  paiements - Rows from micro_paiements (pour récapitulatif règlements)
 * @returns {Promise<Buffer>}
 */
function genererPdfFacture(facture, lignes, paiements = []) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = 495;
    const estAnnulee = facture.statut === 'annulee';

    // ── Header ─────────────────────────────────────────────────────────────────
    doc.rect(50, 50, W, 80).fill(estAnnulee ? '#6b7280' : BLUE);
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
       .text(facture.nom_commercial || facture.client_nom || 'Micro-entrepreneur', 65, 62, { width: W - 130 });
    if (facture.adresse_facturation) {
      doc.fontSize(9).font('Helvetica')
         .text(facture.adresse_facturation.replace(/\n/g, ' • '), 65, 84, { width: W - 130 });
    }
    if (facture.siren) {
      doc.fontSize(9).text(`SIREN : ${facture.siren}`, 65, 100, { width: W - 130 });
    }

    // ── FACTURE label ──────────────────────────────────────────────────────────
    const docLabel = estAnnulee ? 'FACTURE ANNULÉE' : 'FACTURE';
    doc.fillColor('white').fontSize(estAnnulee ? 16 : 22).font('Helvetica-Bold')
       .text(docLabel, 380, 62, { width: 160, align: 'right' });
    doc.fontSize(10).font('Helvetica')
       .text(facture.numero, 380, estAnnulee ? 84 : 88, { width: 160, align: 'right' });

    let y = 150;

    // ── Infos facture / client ─────────────────────────────────────────────────
    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('DATE D\'ÉMISSION', 50, y);
    doc.fillColor('#111').fontSize(10).font('Helvetica').text(fmtDate(facture.date_emission), 50, y + 12);

    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('DATE D\'ÉCHÉANCE', 165, y);
    doc.fillColor('#111').fontSize(10).font('Helvetica-Bold').fillColor('#dc2626')
       .text(fmtDate(facture.date_echeance), 165, y + 12);

    const clientNom = [facture.contact_prenom, facture.contact_nom].filter(Boolean).join(' ') || '—';
    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('CLIENT', 360, y, { width: 185 });
    doc.fillColor('#111').fontSize(10).font('Helvetica-Bold')
       .text(facture.contact_societe || clientNom, 360, y + 12, { width: 185 });
    if (facture.contact_societe) {
      doc.fontSize(9).font('Helvetica').text(clientNom, 360, y + 26, { width: 185 });
    }
    if (facture.contact_adresse) {
      doc.fontSize(9).font('Helvetica').fillColor(GRAY)
         .text(facture.contact_adresse, 360, y + (facture.contact_societe ? 38 : 26), { width: 185 });
    }

    y += 55;

    if (facture.objet) {
      doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('OBJET', 50, y);
      doc.fillColor('#111').fontSize(10).font('Helvetica').text(facture.objet, 50, y + 12, { width: W });
      y += 38;
    } else {
      y += 10;
    }

    doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    y += 14;

    // ── Table header ───────────────────────────────────────────────────────────
    const COL = { desc: 50, qte: 300, unite: 350, pu: 390, remise: 440, total: 480 };
    doc.rect(50, y, W, 20).fill(estAnnulee ? '#6b7280' : BLUE);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    doc.text('DÉSIGNATION', COL.desc + 4, y + 6, { width: 245 });
    doc.text('Qté', COL.qte, y + 6, { width: 45, align: 'right' });
    doc.text('Unité', COL.unite, y + 6, { width: 35 });
    doc.text('P.U. HT', COL.pu, y + 6, { width: 45, align: 'right' });
    doc.text('Remise', COL.remise, y + 6, { width: 35, align: 'right' });
    doc.text('HT', COL.total, y + 6, { width: 65, align: 'right' });
    y += 20;

    // ── Lignes ─────────────────────────────────────────────────────────────────
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

    // ── Totaux ─────────────────────────────────────────────────────────────────
    const totX = 350;
    const totW = 195;

    const drawTotalRow = (label, value, bold = false, bg = null, color = null) => {
      if (bg) doc.rect(totX - 10, y - 2, totW + 10, 20).fill(bg);
      doc.fillColor(color || (bold ? BLUE : GRAY)).fontSize(9)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(label, totX - 10, y, { width: 140, align: 'left' });
      doc.fillColor(color || (bold ? BLUE : '#111')).font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(value, totX + 130, y, { width: 55, align: 'right' });
      y += 20;
    };

    drawTotalRow('Total HT', fmtEur(facture.montant_ht));
    if (Number(facture.taux_tva) > 0) {
      drawTotalRow(`TVA (${facture.taux_tva}%)`, fmtEur(facture.montant_tva));
      drawTotalRow('Total TTC', fmtEur(facture.montant_ttc), true, LIGHT);
    } else {
      drawTotalRow('Total', fmtEur(facture.montant_ttc), true, LIGHT);
    }

    if (Number(facture.montant_regle) > 0) {
      drawTotalRow('Déjà réglé', `- ${fmtEur(facture.montant_regle)}`, false, null, GREEN);
      drawTotalRow(
        'SOLDE RESTANT DÛ',
        fmtEur(facture.solde_restant),
        true,
        facture.solde_restant <= 0 ? '#dcfce7' : '#fee2e2',
        facture.solde_restant <= 0 ? GREEN : '#dc2626'
      );
    }

    y += 8;

    // ── Mention franchise TVA ──────────────────────────────────────────────────
    if (facture.regime_tva === 'franchise' || !Number(facture.taux_tva)) {
      doc.rect(50, y, W, 22).fill('#fef9c3');
      doc.fillColor('#854d0e').fontSize(8).font('Helvetica-Oblique')
         .text('TVA non applicable, art. 293 B du CGI', 58, y + 7, { width: W - 16 });
      y += 32;
    }

    // ── Paiements reçus ───────────────────────────────────────────────────────
    if (paiements.length > 0) {
      doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('RÈGLEMENTS REÇUS', 50, y);
      y += 12;
      paiements.forEach(p => {
        doc.fillColor('#111').fontSize(9).font('Helvetica')
           .text(`${fmtDate(p.date_paiement)} — ${p.mode} ${p.reference ? `(${p.reference})` : ''} : ${fmtEur(p.montant)}`, 58, y, { width: W });
        y += 14;
      });
      y += 6;
    }

    // ── Conditions et mentions légales ────────────────────────────────────────
    if (facture.conditions_paiement) {
      doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('CONDITIONS DE PAIEMENT', 50, y);
      doc.fillColor('#111').fontSize(9).font('Helvetica')
         .text(facture.conditions_paiement, 50, y + 12, { width: W });
      y += 30;
    }

    // ── Bloc pied page légal ───────────────────────────────────────────────────
    const footerY = Math.max(y + 10, 750);
    doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

    const legalText = [
      `En cas de retard de paiement, des pénalités de retard seront exigibles au taux directeur de la BCE majoré de 10 points`,
      `(art. L. 441-6 C.com.), ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 € (décret n° 2012-1115).`,
      `Pas d'escompte pour paiement anticipé.`,
    ].join(' ');

    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
       .text(legalText, 50, footerY + 6, { width: W, align: 'justify' });

    doc.end();
  });
}

module.exports = { genererPdfFacture };
