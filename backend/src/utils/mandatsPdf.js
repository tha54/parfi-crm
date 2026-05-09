'use strict';
/**
 * Génération des 3 mandats envoyés au client avec la LDM :
 *   - Mandat de prélèvement SEPA (SDD CORE récurrent)
 *   - Procuration fiscale
 *   - Procuration sociale
 *
 * Retourne des Buffers PDF (pdfkit).
 */

const PDFDocument = require('pdfkit');

const BLUE  = '#0F1F4B';
const GRAY  = '#6b7c93';
const LIGHT = '#f0f4fa';

function fmtDate(d) {
  if (!d) return new Date().toLocaleDateString('fr-FR');
  return new Date(d).toLocaleDateString('fr-FR');
}

function buildPdf(callback) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try { callback(doc); doc.end(); } catch (e) { reject(e); }
  });
}

function headerBande(doc, title, subtitle) {
  const W = 495;
  doc.rect(50, 50, W, 55).fill(BLUE);
  doc.fillColor('white').fontSize(15).font('Helvetica-Bold')
     .text(title, 65, 60, { width: W - 20 });
  if (subtitle) {
    doc.fontSize(9).font('Helvetica')
       .text(subtitle, 65, 78, { width: W - 20 });
  }
  doc.moveDown(3.5);
}

function section(doc, titre) {
  doc.moveDown(0.6);
  doc.rect(50, doc.y, 495, 1).fill('#dde3ee');
  doc.moveDown(0.4);
  doc.fillColor(BLUE).fontSize(10).font('Helvetica-Bold').text(titre);
  doc.moveDown(0.3);
}

function field(doc, label, value, blank) {
  const y = doc.y;
  doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(label, 55, y, { width: 170 });
  if (blank) {
    doc.rect(230, y - 2, 260, 14).stroke('#aab4c8');
    doc.fillColor('#888').fontSize(8).text('(à compléter)', 234, y + 1, { width: 250 });
  } else {
    doc.fillColor('#1a202c').fontSize(9).font('Helvetica').text(value || '—', 230, y, { width: 260 });
  }
  doc.y = y + 18;
}

function signatureZone(doc, label, x, y) {
  doc.rect(x, y, 190, 60).stroke('#aab4c8');
  doc.fillColor(GRAY).fontSize(8).font('Helvetica')
     .text(label, x + 5, y + 5, { width: 180 });
  doc.fillColor('#bbb').fontSize(7)
     .text('Signature :', x + 5, y + 43, { width: 180 });
}

// ─── Mandat SEPA ──────────────────────────────────────────────────────────────
async function genMandatSepa({ client, cabinet, ldm }) {
  const rum = `RUM-${ldm.numero}-${new Date().getFullYear()}`;
  const montantMensuel = ldm.montantHonorairesHT
    ? (parseFloat(ldm.montantHonorairesHT) / 12).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' € HT'
    : '—';

  return buildPdf(doc => {
    headerBande(doc,
      'MANDAT DE PRÉLÈVEMENT SEPA',
      `Référence Unique du Mandat (RUM) : ${rum} — Type : Récurrent (CORE)`
    );

    doc.fillColor('#333').fontSize(9).font('Helvetica')
       .text(
         'En signant ce formulaire de mandat, vous autorisez le cabinet ci-dessous à envoyer des instructions à votre banque ' +
         'pour débiter votre compte, et votre banque à débiter votre compte conformément aux instructions du cabinet. ' +
         'Vous bénéficiez du droit d\'être remboursé par votre banque selon les conditions décrites dans la convention que ' +
         'vous avez passée avec elle.',
         50, doc.y, { width: 495, lineGap: 3 }
       );

    section(doc, 'CRÉANCIER');
    field(doc, 'Nom du créancier', cabinet.nomCabinet || 'ParFi France');
    field(doc, 'Adresse', `${cabinet.adresse || ''} ${cabinet.codePostal || ''} ${cabinet.ville || ''}`);
    field(doc, 'Identifiant Créancier SEPA (ICS)', cabinet.ics || '— (à compléter par le cabinet)');

    section(doc, 'DÉBITEUR — INFORMATIONS BANCAIRES');
    field(doc, 'Nom / Raison sociale', client.nom || '—');
    field(doc, 'Adresse', [client.adresse, client.code_postal, client.ville].filter(Boolean).join(' ') || '—');
    field(doc, 'IBAN', null, true);
    field(doc, 'BIC / SWIFT', null, true);
    field(doc, 'Banque domiciliataire', null, true);

    section(doc, 'OBJET DU PRÉLÈVEMENT');
    field(doc, 'Objet', ldm.objetMission || ldm.typeMission || 'Honoraires de mission comptable');
    field(doc, 'Montant mensuel estimatif HT', montantMensuel);
    field(doc, 'Périodicité', 'Mensuelle');
    field(doc, 'Date du premier prélèvement', ldm.date_premiere_facture ? fmtDate(ldm.date_premiere_facture) : '—');

    doc.moveDown(1.5);
    const sigY = doc.y;
    signatureZone(doc, `Fait à : ________________\nLe : ${fmtDate(new Date())}`, 50, sigY);
    signatureZone(doc, 'Signature du débiteur\n(précédée de la mention « Lu et approuvé »)', 305, sigY);

    doc.moveDown(4.5);
    doc.fillColor(GRAY).fontSize(7)
       .text(
         'Ce mandat est soumis aux règles du Règlement UE n°260/2012 et aux dispositions du Code monétaire et financier. ' +
         'Toute réclamation peut être adressée à votre établissement bancaire.',
         50, doc.y, { width: 495, lineGap: 2 }
       );
  });
}

// ─── Procuration fiscale ──────────────────────────────────────────────────────
async function genProcurationFiscale({ client, cabinet, ldm }) {
  const dirigeant = [client.prenom_dirigeant, client.nom_dirigeant].filter(Boolean).join(' ') || client.nom || '—';

  return buildPdf(doc => {
    headerBande(doc,
      'PROCURATION FISCALE',
      `Mission : ${ldm.numero} — Cabinet ${cabinet.nomCabinet || 'ParFi France'}`
    );

    doc.fillColor('#333').fontSize(10).font('Helvetica-Bold')
       .text('Je soussigné(e)', 50, doc.y);
    doc.moveDown(0.3);

    section(doc, 'MANDANT');
    field(doc, 'Nom / Raison sociale', client.nom || '—');
    field(doc, 'SIREN', client.siren || '—');
    field(doc, 'Adresse', [client.adresse, client.code_postal, client.ville].filter(Boolean).join(' ') || '—');
    field(doc, 'Représenté(e) par', dirigeant);
    field(doc, 'Qualité / Fonction', null, true);

    section(doc, 'MANDATAIRE');
    field(doc, 'Cabinet', cabinet.nomCabinet || 'ParFi France');
    field(doc, 'Adresse', `${cabinet.adresse || ''} ${cabinet.codePostal || ''} ${cabinet.ville || ''}`);
    field(doc, 'SIREN', cabinet.siren || '—');
    field(doc, 'N° inscription OEC', cabinet.numero_inscription_oec || '—');

    section(doc, 'OBJET DE LA PROCURATION');
    doc.fillColor('#333').fontSize(9).font('Helvetica')
       .text(
         'Donne pouvoir au cabinet mentionné ci-dessus pour accomplir en son nom et pour son compte les missions suivantes :',
         50, doc.y, { width: 495, lineGap: 3 }
       );
    doc.moveDown(0.4);

    const missions = [
      'Établir, déposer et signer toutes déclarations fiscales (IS, TVA, CFE, CVAE, liasses fiscales…)',
      'Représenter le mandant devant l\'administration fiscale et les services des impôts',
      'Accéder aux comptes fiscaux en ligne (impots.gouv.fr, espace professionnel)',
      'Répondre aux demandes de renseignements et aux contrôles fiscaux',
      'Effectuer toutes démarches auprès du Service des Impôts des Entreprises (SIE)',
      'Souscrire toutes demandes de remboursement de crédit de TVA ou d\'impôts',
    ];
    for (const m of missions) {
      doc.fillColor('#1a202c').fontSize(9).font('Helvetica')
         .text(`• ${m}`, 60, doc.y, { width: 475, lineGap: 2 });
      doc.moveDown(0.2);
    }

    doc.moveDown(0.5);
    doc.fillColor('#333').fontSize(9)
       .text(
         'Cette procuration est valable pour la durée de la lettre de mission et révocable à tout moment par écrit.',
         50, doc.y, { width: 495 }
       );

    doc.moveDown(1.2);
    if (doc.y > 680) { doc.addPage(); }
    const sigY = doc.y;
    signatureZone(doc, `Fait à : ________________\nLe : ${fmtDate(new Date())}`, 50, sigY);
    signatureZone(doc, 'Signature du mandant\n(précédée de la mention « Bon pour pouvoir »)', 305, sigY);

    doc.y = sigY + 70;
    doc.moveDown(0.5);
    doc.fillColor(GRAY).fontSize(7)
       .text(
         'Document confidentiel — établi dans le cadre de la mission définie par la lettre de mission associée. ' +
         `Cabinet inscrit au tableau de l'OEC ${cabinet.conseil_regional_oec || 'Grand Est'}.`,
         50, doc.y, { width: 495 }
       );
  });
}

// ─── Procuration sociale ──────────────────────────────────────────────────────
async function genProcurationSociale({ client, cabinet, ldm }) {
  const dirigeant = [client.prenom_dirigeant, client.nom_dirigeant].filter(Boolean).join(' ') || client.nom || '—';

  return buildPdf(doc => {
    headerBande(doc,
      'PROCURATION SOCIALE',
      `Organismes de sécurité sociale — Mission : ${ldm.numero}`
    );

    doc.fillColor('#333').fontSize(10).font('Helvetica-Bold')
       .text('Je soussigné(e)', 50, doc.y);
    doc.moveDown(0.3);

    section(doc, 'MANDANT');
    field(doc, 'Nom / Raison sociale', client.nom || '—');
    field(doc, 'SIREN / SIRET', client.siren || '—');
    field(doc, 'Adresse', [client.adresse, client.code_postal, client.ville].filter(Boolean).join(' ') || '—');
    field(doc, 'Représenté(e) par', dirigeant);
    field(doc, 'Qualité / Fonction', null, true);

    section(doc, 'MANDATAIRE');
    field(doc, 'Cabinet', cabinet.nomCabinet || 'ParFi France');
    field(doc, 'Adresse', `${cabinet.adresse || ''} ${cabinet.codePostal || ''} ${cabinet.ville || ''}`);
    field(doc, 'SIREN', cabinet.siren || '—');

    section(doc, 'OBJET DE LA PROCURATION');
    doc.fillColor('#333').fontSize(9).font('Helvetica')
       .text(
         'Donne pouvoir au cabinet mentionné ci-dessus pour accomplir en son nom et pour son compte les missions sociales suivantes :',
         50, doc.y, { width: 495, lineGap: 3 }
       );
    doc.moveDown(0.4);

    const missions = [
      'Établir et déposer les déclarations sociales (DSN mensuelle et événementielle, DPAE…)',
      'Représenter le mandant auprès de l\'URSSAF, des caisses de retraite (AGIRC-ARRCO) et de prévoyance',
      'Accéder aux espaces en ligne URSSAF, Net-entreprises, Mon compte Pro',
      'Répondre aux contrôles URSSAF et aux demandes des organismes sociaux',
      'Effectuer les déclarations auprès de Pôle Emploi (France Travail)',
      'Gérer les affiliations et radiations auprès des organismes de protection sociale',
      'Établir les bulletins de salaire et le livre de paie',
    ];
    for (const m of missions) {
      doc.fillColor('#1a202c').fontSize(9).font('Helvetica')
         .text(`• ${m}`, 60, doc.y, { width: 475, lineGap: 2 });
      doc.moveDown(0.2);
    }

    doc.moveDown(0.5);
    doc.fillColor('#333').fontSize(9)
       .text(
         'Cette procuration est valable pour la durée de la lettre de mission et révocable à tout moment par écrit.',
         50, doc.y, { width: 495 }
       );

    doc.moveDown(1.2);
    if (doc.y > 680) { doc.addPage(); }
    const sigY = doc.y;
    signatureZone(doc, `Fait à : ________________\nLe : ${fmtDate(new Date())}`, 50, sigY);
    signatureZone(doc, 'Signature du mandant\n(précédée de la mention « Bon pour pouvoir »)', 305, sigY);

    doc.y = sigY + 70;
    doc.moveDown(0.5);
    doc.fillColor(GRAY).fontSize(7)
       .text(
         'Document confidentiel — établi dans le cadre de la mission définie par la lettre de mission associée. ' +
         `Cabinet inscrit au tableau de l'OEC ${cabinet.conseil_regional_oec || 'Grand Est'}.`,
         50, doc.y, { width: 495 }
       );
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────
async function genererTousMandats({ client, cabinet, ldm }) {
  const [sepa, fiscal, social] = await Promise.all([
    genMandatSepa({ client, cabinet, ldm }),
    genProcurationFiscale({ client, cabinet, ldm }),
    genProcurationSociale({ client, cabinet, ldm }),
  ]);
  return [
    { buffer: sepa,   filename: `Mandat_SEPA_${ldm.numero}.pdf`,    type: 'prelevement', libelle: 'Mandat de prélèvement SEPA' },
    { buffer: fiscal, filename: `Procuration_Fiscale_${ldm.numero}.pdf`, type: 'impots', libelle: 'Procuration fiscale' },
    { buffer: social, filename: `Procuration_Sociale_${ldm.numero}.pdf`, type: 'urssaf', libelle: 'Procuration sociale' },
  ];
}

module.exports = { genererTousMandats };
