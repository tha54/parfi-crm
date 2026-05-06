const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const path = require('path');
const fs = require('fs/promises');
const { verifyToken, requireRole } = require('../middleware/auth');
const { calculerLignes, calculer: calculerChiffrage } = require('../utils/dimensionnement');
const { generateDevisPdf } = require('../utils/devisGenerator');
const ldmService = require('../services/ldmService');

const PDF_DIR = path.join(__dirname, '..', '..', 'uploads', 'devis');

// Lookup map for raw INSEE nature-juridique codes stored in prospects.forme_juridique
const INSEE_NATURES = {
  '1000': 'Entrepreneur individuel', '5120': 'EURL', '5202': 'SNC',
  '5308': 'EARL', '5499': 'SARL', '5596': 'SAS', '5710': 'SAS',
  '5720': 'SASU', '5599': 'SA', '5785': 'SA cotée',
  '6317': 'SCOP', '6530': 'Société civile', '6531': 'SCI',
  '6532': 'SCI de vente', '6534': 'SCI', '6536': "SCI d'attribution",
  '6540': 'SCI', '6552': 'SCPI', '6560': 'Société civile foncière',
  '6561': 'SCI', '6599': 'Société civile',
  '9120': 'Association', '9221': 'Association loi 1901',
};

function resolveFormeJuridique(raw) {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^\d{4}[A-Z]?$/.test(trimmed)) return INSEE_NATURES[trimmed] || trimmed;
  return trimmed.replace(/^\d{4}[A-Z]?\s*[-–]?\s*/, '').trim();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function nextNumero(prefix) {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT numero FROM devis WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}-${year}-%`]
  );
  const seq = rows.length ? parseInt(rows[0].numero.split('-').pop(), 10) + 1 : 1;
  return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}

async function nextLMNumero() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT numero FROM lettres_mission WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
    [`LM-${year}-%`]
  );
  const seq = rows.length ? parseInt(rows[0].numero.split('-').pop(), 10) + 1 : 1;
  return `LM-${year}-${String(seq).padStart(3, '0')}`;
}

// Maps devis.statut → opportunites.statut for pipeline sync
const DEVIS_TO_OPP = {
  brouillon: 'devis_fait',
  envoye:    'negociation',
  accepte:   'devis_envoye',
  refuse:    'perdu',
};

// Maps section label → chapitre ENUM
function sectionToChapitre(section) {
  if (!section) return null;
  const s = section.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s === 'comptabilite' || s === 'fiscalite') return 'comptable_fiscal';
  if (s === 'social') return 'social';
  if (s === 'juridique') return 'juridique';
  return null;
}

// Upsert devis_chapitres from a list of {chapitre, tarif_ht} lines + optional accepted amounts
async function upsertDevisChapitres(conn, devisId, allLignes, chapitresRemise) {
  await conn.query('DELETE FROM devis_chapitres WHERE devis_id = ?', [devisId]);
  const totals = {};
  for (const l of allLignes) {
    const ch = l.chapitre;
    if (ch) { totals[ch] = (totals[ch] || 0) + (parseFloat(l.tarif_ht) || 0); }
  }
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  for (const [chapitre, theorique] of entries) {
    const th = Math.round(theorique * 100) / 100;
    const acc = chapitresRemise?.[chapitre]?.montant_accepte != null
      ? Math.round(parseFloat(chapitresRemise[chapitre].montant_accepte) * 100) / 100
      : th;
    const remise = Math.round((th - acc) * 100) / 100;
    await conn.query(
      `INSERT INTO devis_chapitres (devis_id, chapitre, total_theorique_ht, montant_accepte_ht, remise_ht)
       VALUES (?, ?, ?, ?, ?)`,
      [devisId, chapitre, th, acc, remise]
    );
  }
  return entries;
}

// Upsert lettres_mission_chapitres (copy from devis_chapitres)
async function copyChapitresLDM(conn, devisId, ldmId) {
  await conn.query('DELETE FROM lettres_mission_chapitres WHERE ldm_id = ?', [ldmId]);
  const [rows] = await conn.query('SELECT * FROM devis_chapitres WHERE devis_id = ?', [devisId]);
  for (const r of rows) {
    await conn.query(
      `INSERT INTO lettres_mission_chapitres (ldm_id, chapitre, total_theorique_ht, montant_accepte_ht, remise_ht)
       VALUES (?, ?, ?, ?, ?)`,
      [ldmId, r.chapitre, r.total_theorique_ht, r.montant_accepte_ht, r.remise_ht]
    );
  }
}

// Re-calculate and upsert lignes_devis for a given devis
async function recalculerLignes(devisId, params, remise_pct = 0) {
  const lignes = calculerLignes(params);

  // Delete existing lines
  await pool.query('DELETE FROM lignes_devis WHERE devisId = ?', [devisId]);

  let totalHT = 0;
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    totalHT += l.tarif_ht || 0;
    await pool.query(
      `INSERT INTO lignes_devis
         (devisId, ordre, description, quantite, prixUnitaireHT, remisePct, totalHT,
          rubrique, section, intervenant, periodicite, temps_minutes, tarif_ht, actif, mode_suivi, mode_saisie, chapitre)
       VALUES (?,?,?,1,?,0,?,?,?,?,?,?,?,1,?,?,?)`,
      [devisId, i, l.libelle, l.tarif_ht, l.tarif_ht,
       l.rubrique, l.section, l.intervenant, l.periodicite, l.temps_minutes, l.tarif_ht,
       l.mode_suivi || 'temps', 'chiffre', sectionToChapitre(l.section)]
    );
  }

  // Apply remise
  const remise = parseFloat(remise_pct) || 0;
  const totalHTNet = Math.round(totalHT * (1 - remise / 100) * 100) / 100;
  const tva = Math.round(totalHTNet * 0.2 * 100) / 100;
  const totalTTC = Math.round((totalHTNet + tva) * 100) / 100;
  const mensuel = Math.round(totalHTNet / 12 * 100) / 100;

  await pool.query(
    `UPDATE devis SET totalHT=?, tauxTVA=20, totalTVA=?, totalTTC=?, total_ht_net=?,
     total_theorique_ht=?, remise_commerciale_ht=?, total_accepte_ht=?, remise_pct=? WHERE id=?`,
    [totalHT, tva, totalTTC, totalHTNet, totalHT,
     Math.round(totalHT - totalHTNet), totalHTNet, remise, devisId]
  );

  return { totalHT, totalHTNet, tva, totalTTC, mensuel, count: lignes.length };
}

// ── HTML generator ────────────────────────────────────────────────────────────

function generateDevisHTML(devis, lignesGrouped, cabinet) {
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtLabel = {
    ei: 'Entreprise individuelle', societe: 'Société', association: 'Association',
    micro: 'Micro-entreprise', reel_simplifie: 'Réel simplifié', reel_normal: 'Réel normal', bnc: 'BNC', ba: 'BA', sci: 'SCI (IR)',
    mensuel: 'Mensuel', trimestriel: 'Trimestriel', franchise: 'Franchise en base', neant: 'Néant',
  };

  const rubriquesHTML = lignesGrouped.map((rub, idx) => {
    const detailRows = rub.lignes.map(l => `
      <tr class="detail-row" data-rub="${idx}" style="display:none">
        <td style="padding:6px 8px 6px 32px;color:#555;">${l.description || l.libelle || ''}</td>
        <td style="padding:6px 8px;color:#888;font-size:0.85em;">${l.periodicite || ''}</td>
        <td style="padding:6px 8px;text-align:right;color:#555;">${fmt(l.tarif_ht)} €</td>
      </tr>`).join('');

    return `
      <tr class="rubrique-row" data-idx="${idx}" onclick="toggle(${idx})" style="cursor:pointer;background:#f8f9fa;">
        <td style="padding:10px 8px;font-weight:600;color:#1a3a5c;">
          <span class="chevron" id="chev-${idx}" style="display:inline-block;transition:transform .2s;margin-right:6px;">▶</span>
          ${rub.rubrique}
          <span style="margin-left:8px;font-size:0.75em;background:#e3eaf4;color:#4a6fa5;padding:2px 8px;border-radius:10px;">${rub.section}</span>
        </td>
        <td style="padding:10px 8px;color:#888;font-size:0.85em;">${rub.lignes.length} prestation(s)</td>
        <td style="padding:10px 8px;text-align:right;font-weight:600;color:#1a3a5c;">${fmt(rub.total)} €</td>
      </tr>${detailRows}`;
  }).join('');

  const remise = parseFloat(devis.remise_pct) || 0;
  const remiseHTML = remise > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 8px;text-align:right;color:#888;">Remise (${remise}%)</td>
      <td style="padding:6px 8px;text-align:right;color:#e74c3c;">- ${fmt((devis.totalHT || 0) * remise / 100)} €</td>
    </tr>` : '';

  const mensuel = Math.round((devis.total_ht_net || 0) / 12 * 100) / 100;

  const dateEmission = devis.dateEmission ? new Date(devis.dateEmission).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const dateValidite = devis.dateValidite ? new Date(devis.dateValidite).toLocaleDateString('fr-FR') : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Devis ${devis.numero}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; background: #fff; font-size: 14px; }
  .page { max-width: 900px; margin: 0 auto; padding: 40px 30px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #1a3a5c; }
  .cabinet-name { font-size: 1.6em; font-weight: 700; color: #1a3a5c; }
  .cabinet-info { font-size: 0.85em; color: #555; margin-top: 6px; }
  .devis-meta { text-align: right; }
  .devis-num { font-size: 1.3em; font-weight: 700; color: #1a3a5c; }
  .devis-date { font-size: 0.85em; color: #555; margin-top: 4px; }
  .client-block { background: #f0f4f9; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
  .client-block h3 { color: #1a3a5c; margin-bottom: 10px; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.05em; }
  .client-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  .client-item label { font-size: 0.75em; color: #888; display: block; }
  .client-item span { font-weight: 600; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #1a3a5c; color: #fff; padding: 10px 8px; text-align: left; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; }
  thead th:last-child { text-align: right; }
  tbody tr:nth-child(even) { background: #fafbfc; }
  .totals-table { width: 350px; margin-left: auto; }
  .totals-table td { padding: 6px 8px; }
  .totals-table .total-ttc { font-size: 1.1em; font-weight: 700; color: #1a3a5c; border-top: 2px solid #1a3a5c; }
  .totals-table .mensuel { color: #4a6fa5; font-size: 0.9em; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 0.75em; color: #888; display: flex; justify-content: space-between; }
  @media print { .page { padding: 20px; } }
</style>
<script>
function toggle(idx) {
  var rows = document.querySelectorAll('[data-rub="' + idx + '"]');
  var chev = document.getElementById('chev-' + idx);
  var open = rows[0] && rows[0].style.display !== 'none';
  rows.forEach(function(r) { r.style.display = open ? 'none' : 'table-row'; });
  chev.style.transform = open ? '' : 'rotate(90deg)';
}
</script>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="cabinet-name">${cabinet.nomCabinet || 'ParFi France'}</div>
      <div class="cabinet-info">
        ${cabinet.adresse || '5 Place Langrand'}, ${cabinet.codePostal || '54400'} ${cabinet.ville || 'Longwy'}<br>
        SIREN : ${cabinet.siren || '---'} — Ordre : ${cabinet.numeroOrdre || '---'}<br>
        ${cabinet.email || 'contact@parfi.fr'} — ${cabinet.telephone || ''}
      </div>
    </div>
    <div class="devis-meta">
      <div class="devis-num">Devis n° ${devis.numero}</div>
      <div class="devis-date">Émis le ${dateEmission}</div>
      ${dateValidite ? `<div class="devis-date">Valable jusqu'au ${dateValidite}</div>` : ''}
    </div>
  </div>

  <div class="client-block">
    <h3>Client / Prospect</h3>
    <div class="client-grid">
      <div class="client-item"><label>Nom</label><span>${devis.display_nom || devis.client_nom || '—'}</span></div>
      <div class="client-item"><label>SIREN</label><span>${devis.display_siren || devis.client_siren || '—'}</span></div>
      ${(devis.display_adresse || devis.display_cp || devis.display_ville) ? `<div class="client-item" style="grid-column:span 2"><label>Adresse</label><span>${[devis.display_adresse, devis.display_cp, devis.display_ville].filter(Boolean).join(', ')}</span></div>` : ''}
      <div class="client-item"><label>Type entité</label><span>${fmtLabel[devis.type_entite] || devis.type_entite || '—'}</span></div>
      <div class="client-item"><label>Régime fiscal</label><span>${fmtLabel[devis.regime_fiscal] || devis.regime_fiscal || '—'}</span></div>
      <div class="client-item"><label>Régime TVA</label><span>${fmtLabel[devis.regime_tva] || devis.regime_tva || '—'}</span></div>
      <div class="client-item"><label>Effectif</label><span>${devis.effectif || 0} salarié(s)</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Rubrique / Prestation</th>
        <th>Périodicité</th>
        <th style="text-align:right">Montant HT</th>
      </tr>
    </thead>
    <tbody>
      ${rubriquesHTML}
    </tbody>
  </table>

  <table class="totals-table">
    <tbody>
      <tr>
        <td>Total HT brut</td>
        <td style="text-align:right">${fmt(devis.totalHT)} €</td>
      </tr>
      ${remiseHTML}
      <tr>
        <td style="font-weight:600">Total HT net</td>
        <td style="text-align:right;font-weight:600">${fmt(devis.total_ht_net || devis.totalHT)} €</td>
      </tr>
      <tr>
        <td>TVA 20 %</td>
        <td style="text-align:right">${fmt(devis.totalTVA)} €</td>
      </tr>
      <tr class="total-ttc">
        <td>Total TTC</td>
        <td style="text-align:right">${fmt(devis.totalTTC)} €</td>
      </tr>
      <tr class="mensuel">
        <td>Soit / mois</td>
        <td style="text-align:right">${fmt(mensuel)} € HT/mois</td>
      </tr>
    </tbody>
  </table>

  ${devis.notesClient ? `<div style="background:#fffbe6;border-left:4px solid #f0c040;padding:12px 16px;border-radius:4px;margin-bottom:24px;font-size:0.9em;">${devis.notesClient}</div>` : ''}

  <div class="footer">
    <div>Devis valable 30 jours à compter de la date d'émission.<br>Expert-comptable inscrit à l'Ordre des Experts-Comptables.</div>
    <div style="text-align:right">Signature client :<br><br><br>Date :</div>
  </div>
</div>
</body>
</html>`;
}

// ── LDM HTML generator ────────────────────────────────────────────────────────

function generateLDMHTML(ldm, lignesGrouped, mandats, cabinet) {
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rubriquesHTML = lignesGrouped.map((rub, idx) => {
    const detailRows = rub.lignes.map(l => `
      <tr class="detail-row" data-rub="${idx}" style="display:none">
        <td style="padding:6px 8px 6px 32px;color:#555;">${l.description || l.libelle || ''}</td>
        <td style="padding:6px 8px;color:#888;font-size:0.85em;">${l.periodicite || ''}</td>
        <td style="padding:6px 8px;text-align:right;color:#555;">${fmt(l.tarif_ht)} €</td>
      </tr>`).join('');

    return `
      <tr class="rubrique-row" data-idx="${idx}" onclick="toggle(${idx})" style="cursor:pointer;background:#f8f9fa;">
        <td style="padding:10px 8px;font-weight:600;color:#1a3a5c;">
          <span class="chevron" id="chev-${idx}" style="display:inline-block;transition:transform .2s;margin-right:6px;">▶</span>
          ${rub.rubrique}
          <span style="margin-left:8px;font-size:0.75em;background:#e3eaf4;color:#4a6fa5;padding:2px 8px;border-radius:10px;">${rub.section}</span>
        </td>
        <td style="padding:10px 8px;color:#888;font-size:0.85em;">${rub.lignes.length} prestation(s)</td>
        <td style="padding:10px 8px;text-align:right;font-weight:600;color:#1a3a5c;">${fmt(rub.total)} €</td>
      </tr>${detailRows}`;
  }).join('');

  const mensuel = Math.round((ldm.montantHonorairesHT || 0) / 12 * 100) / 100;
  const tva = Math.round((ldm.montantHonorairesHT || 0) * 0.2 * 100) / 100;
  const ttc = Math.round(((ldm.montantHonorairesHT || 0) + tva) * 100) / 100;

  const mandatsHTML = mandats && mandats.length ? `
    <h3 style="color:#1a3a5c;margin:24px 0 10px;">Mandats</h3>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#1a3a5c;color:#fff;">
        <th style="padding:8px;text-align:left;">Type</th>
        <th style="padding:8px;text-align:left;">Libellé</th>
        <th style="padding:8px;text-align:center;">Signé</th>
        <th style="padding:8px;text-align:left;">Date</th>
      </tr></thead>
      <tbody>${mandats.map(m => `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;">${m.type}</td>
          <td style="padding:8px;">${m.libelle}</td>
          <td style="padding:8px;text-align:center;">${m.signe ? '✓' : '—'}</td>
          <td style="padding:8px;">${m.date_signature ? new Date(m.date_signature).toLocaleDateString('fr-FR') : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '';

  const dateDebut = ldm.dateDebut ? new Date(ldm.dateDebut).toLocaleDateString('fr-FR') : '—';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Lettre de Mission ${ldm.numero}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; background: #fff; font-size: 14px; line-height: 1.5; }
  .page { max-width: 900px; margin: 0 auto; padding: 40px 30px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #1a3a5c; }
  .cabinet-name { font-size: 1.6em; font-weight: 700; color: #1a3a5c; }
  .cabinet-info { font-size: 0.85em; color: #555; margin-top: 6px; }
  h2 { color: #1a3a5c; font-size: 1.3em; margin: 28px 0 14px; padding-bottom: 6px; border-bottom: 1px solid #ddd; }
  .clause { background: #f9f9f9; border-left: 3px solid #c5d3e8; padding: 12px 16px; margin-bottom: 12px; border-radius: 0 4px 4px 0; font-size: 0.9em; }
  .sig-block { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
  .sig-box { border: 1px solid #ccc; border-radius: 6px; padding: 16px; min-height: 120px; }
  .sig-box label { font-size: 0.8em; color: #888; display: block; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #1a3a5c; color: #fff; padding: 10px 8px; text-align: left; font-size: 0.85em; }
  thead th:last-child { text-align: right; }
  .totals-table { width: 350px; margin-left: auto; }
  .totals-table td { padding: 6px 8px; }
  .totals-table .total-ttc { font-weight: 700; color: #1a3a5c; border-top: 2px solid #1a3a5c; }
  @media print { .page { padding: 20px; } }
</style>
<script>
function toggle(idx) {
  var rows = document.querySelectorAll('[data-rub="' + idx + '"]');
  var chev = document.getElementById('chev-' + idx);
  var open = rows[0] && rows[0].style.display !== 'none';
  rows.forEach(function(r) { r.style.display = open ? 'none' : 'table-row'; });
  chev.style.transform = open ? '' : 'rotate(90deg)';
}
</script>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="cabinet-name">${cabinet.nomCabinet || 'ParFi France'}</div>
      <div class="cabinet-info">
        ${cabinet.adresse || '5 Place Langrand'}, ${cabinet.codePostal || '54400'} ${cabinet.ville || 'Longwy'}<br>
        SIREN : ${cabinet.siren || '---'} — Ordre : ${cabinet.numeroOrdre || '---'}<br>
        ${cabinet.email || 'contact@parfi.fr'} — ${cabinet.telephone || ''}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:1.2em;font-weight:700;color:#1a3a5c;">Lettre de Mission n° ${ldm.numero}</div>
      <div style="font-size:0.85em;color:#555;">Statut : ${ldm.statut}</div>
      ${dateDebut !== '—' ? `<div style="font-size:0.85em;color:#555;">À compter du ${dateDebut}</div>` : ''}
    </div>
  </div>

  <h2>Parties</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
    <div style="background:#f0f4f9;padding:14px;border-radius:6px;">
      <strong>Cabinet</strong><br>
      ${cabinet.nomCabinet || 'ParFi France'}<br>
      SIREN : ${cabinet.siren || '---'}
    </div>
    <div style="background:#f0f4f9;padding:14px;border-radius:6px;">
      <strong>Client</strong><br>
      ${ldm.client_nom || '—'}<br>
      SIREN : ${ldm.client_siren || '—'}
    </div>
  </div>

  ${ldm.objetMission ? `
  <h2>Objet de la mission</h2>
  <p style="margin-bottom:16px;">${ldm.objetMission}</p>` : ''}

  ${lignesGrouped.length > 0 ? `
  <h2>Détail des prestations</h2>
  <table>
    <thead>
      <tr>
        <th>Rubrique / Prestation</th>
        <th>Périodicité</th>
        <th style="text-align:right">Montant HT</th>
      </tr>
    </thead>
    <tbody>${rubriquesHTML}</tbody>
  </table>` : ''}

  <h2>Honoraires</h2>
  <table class="totals-table">
    <tbody>
      <tr><td>Total HT</td><td style="text-align:right">${fmt(ldm.montantHonorairesHT)} €</td></tr>
      <tr><td>TVA 20 %</td><td style="text-align:right">${fmt(tva)} €</td></tr>
      <tr class="total-ttc"><td>Total TTC</td><td style="text-align:right">${fmt(ttc)} €</td></tr>
      <tr><td style="color:#4a6fa5;">Soit / mois</td><td style="text-align:right;color:#4a6fa5;">${fmt(mensuel)} € HT/mois</td></tr>
    </tbody>
  </table>

  ${mandatsHTML}

  <h2>Clauses contractuelles</h2>

  <div class="clause">
    <strong>Révision des honoraires</strong><br>
    Les honoraires sont révisés chaque année au 1er janvier selon l'indice INSEE du coût de la vie. Toute modification substantielle de la mission fera l'objet d'un avenant.
  </div>

  <div class="clause">
    <strong>Résiliation</strong><br>
    Chaque partie peut résilier la présente lettre de mission avec un préavis de ${ldm.dureePreavis || 3} mois par lettre recommandée avec accusé de réception. En cas de résiliation, les honoraires restent dus jusqu'à la fin du préavis.
  </div>

  <div class="clause">
    <strong>Confidentialité</strong><br>
    Le cabinet s'engage à maintenir la stricte confidentialité de toutes les informations communiquées par le client dans le cadre de la présente mission.
  </div>

  <div class="clause">
    <strong>Protection des données (RGPD)</strong><br>
    Les données personnelles collectées sont traitées conformément au Règlement Général sur la Protection des Données (UE) 2016/679 et à la loi Informatique et Libertés. Le client dispose d'un droit d'accès, de rectification et d'effacement de ses données.
  </div>

  <div class="clause">
    <strong>Responsabilité</strong><br>
    La responsabilité du cabinet est couverte par une assurance responsabilité civile professionnelle. Elle est limitée aux honoraires perçus au titre de la mission concernée, sauf faute intentionnelle.
  </div>

  <div class="clause">
    <strong>Déontologie</strong><br>
    La présente mission est exercée conformément aux normes professionnelles de l'Ordre des Experts-Comptables, notamment le Code de déontologie. Le cabinet respecte les obligations d'indépendance, d'objectivité et de compétence.
  </div>

  <div class="sig-block">
    <div class="sig-box">
      <label>Signature du Client</label>
      ${ldm.signatureClient ? `<div style="font-style:italic;color:#555;">Signé le ${ldm.dateSignatureClient ? new Date(ldm.dateSignatureClient).toLocaleDateString('fr-FR') : '—'}</div>` : '<div style="height:60px;"></div><div style="border-top:1px solid #999;padding-top:6px;font-size:0.8em;color:#888;">Date :</div>'}
    </div>
    <div class="sig-box">
      <label>Signature du Cabinet — ${cabinet.nomCabinet || 'ParFi France'}</label>
      ${ldm.signatureCabinet ? `<div style="font-style:italic;color:#555;">Signé le ${ldm.dateSignatureCabinet ? new Date(ldm.dateSignatureCabinet).toLocaleDateString('fr-FR') : '—'}</div>` : '<div style="height:60px;"></div><div style="border-top:1px solid #999;padding-top:6px;font-size:0.8em;color:#888;">Date :</div>'}
    </div>
  </div>

  <div style="margin-top:30px;padding-top:16px;border-top:1px solid #ddd;font-size:0.75em;color:#888;text-align:center;">
    Expert-comptable inscrit à l'Ordre des Experts-Comptables — ${cabinet.nomCabinet || 'ParFi France'} — SIREN ${cabinet.siren || '---'}
  </div>
</div>
</body>
</html>`;
}

// ── Helper: group lignes by rubrique ─────────────────────────────────────────

function groupByRubrique(lignes) {
  const map = new Map();
  for (const l of lignes) {
    const key = l.rubrique || l.description || 'Autres';
    if (!map.has(key)) map.set(key, { rubrique: key, section: l.section || '', lignes: [], total: 0 });
    map.get(key).lignes.push(l);
    map.get(key).total += parseFloat(l.tarif_ht || l.totalHT || 0);
  }
  return Array.from(map.values());
}

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id, statut, cree_par } = req.query;
    let where = '1=1';
    const params = [];
    if (client_id) { where += ' AND d.client_id = ?'; params.push(client_id); }
    if (statut)    { where += ' AND d.statut = ?';    params.push(statut); }
    if (cree_par)  { where += ' AND d.cree_par = ?';  params.push(cree_par); }

    const [rows] = await pool.query(
      `SELECT d.*,
              c.nom AS client_nom,
              c.siren AS client_siren,
              p.nom AS prospect_nom,
              COALESCE(c.nom, p.nom) AS display_nom,
              u.prenom AS cree_par_prenom, u.nom AS cree_par_nom
       FROM devis d
       LEFT JOIN clients c ON d.client_id = c.id
       LEFT JOIN prospects p ON d.prospect_id = p.id
       LEFT JOIN utilisateurs u ON d.cree_par = u.id
       WHERE ${where}
       ORDER BY d.createdAt DESC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const {
    client_id, prospect_id, opportunite_id,
    titre,
    type_entite = 'societe',
    regime_fiscal = 'reel_normal',
    regime_tva = 'mensuel',
    nb_etablissements = 1,
    factures_achat = 0,
    factures_vente = 0,
    lignes_banque = 0,
    operations_diverses,
    immobilisations = 0,
    effectif = 0,
    remise_pct = 0,
    dateValidite,
    notesInternes,
    notesClient,
    segment,
    lignes_rapides = [],
    rubriques_forfait = [],
    chapitres_remise = null,
    run_engine = false,
  } = req.body;

  if (!client_id && !prospect_id) return res.status(400).json({ message: 'Client ou prospect requis' });
  if (!titre) return res.status(400).json({ message: 'Titre requis' });

  try {
    const numero = await nextNumero('DEV');
    let resolvedOppId = opportunite_id || null;

    if (prospect_id) {
      const [[existing]] = await pool.query(
        `SELECT id FROM opportunites WHERE prospect_id = ? AND statut NOT IN ('gagne','perdu') LIMIT 1`,
        [prospect_id]
      );
      if (existing) {
        resolvedOppId = existing.id;
        await pool.query(`UPDATE opportunites SET statut = 'devis_fait', updatedAt = NOW() WHERE id = ?`, [resolvedOppId]);
      } else if (resolvedOppId) {
        await pool.query(`UPDATE opportunites SET statut = 'devis_fait', updatedAt = NOW() WHERE id = ?`, [resolvedOppId]);
      } else {
        const [oppResult] = await pool.query(
          `INSERT INTO opportunites (prospect_id, titre, statut, probabilite) VALUES (?, ?, 'devis_fait', 50)`,
          [prospect_id, titre]
        );
        resolvedOppId = oppResult.insertId;
      }
    }

    const odVal = operations_diverses != null ? Number(operations_diverses) : null;
    const calcParams = { type_entite, regime_fiscal, regime_tva, nb_etablissements, factures_achat, factures_vente, lignes_banque, immobilisations, effectif, operations_diverses: odVal };

    // Build all lines: mode chiffré (engine, only if requested) + mode rapide (manual)
    const { lignes: lignesChiffre } = run_engine
      ? calculerChiffrage({ params: calcParams, rubriques_forfait })
      : { lignes: [] };
    const lignesRapide = (lignes_rapides || []).filter(l => l.libelle && parseFloat(l.montant_ht) > 0).map(l => ({
      libelle: l.libelle, rubrique: l.libelle, section: l.section || null,
      intervenant: null, periodicite: l.periodicite || 'Annuel',
      temps_minutes: 0, tarif_ht: Math.round(parseFloat(l.montant_ht) * 100) / 100,
      mode_suivi: 'forfait', mode_saisie: 'rapide', chapitre: l.chapitre || null,
    }));

    const allLignes = [
      ...lignesChiffre.map(l => ({ ...l, mode_saisie: 'chiffre', chapitre: sectionToChapitre(l.section) })),
      ...lignesRapide,
    ];

    const totalHT = allLignes.reduce((s, l) => s + (parseFloat(l.tarif_ht) || 0), 0);

    // Compute total_accepte_ht from chapitres_remise or legacy remise_pct
    let totalAccepte;
    if (chapitres_remise) {
      const chapTotals = {};
      for (const l of allLignes) {
        if (l.chapitre) chapTotals[l.chapitre] = (chapTotals[l.chapitre] || 0) + l.tarif_ht;
      }
      totalAccepte = Object.entries(chapTotals).reduce((s, [ch, th]) => {
        const acc = chapitres_remise[ch]?.montant_accepte != null
          ? parseFloat(chapitres_remise[ch].montant_accepte)
          : th;
        return s + acc;
      }, 0);
      // Add lines with no chapitre (Conseil/Autre) at full price
      const sansChapitre = allLignes.filter(l => !l.chapitre).reduce((s, l) => s + l.tarif_ht, 0);
      totalAccepte += sansChapitre;
    } else {
      const remise = parseFloat(remise_pct) || 0;
      totalAccepte = Math.round(totalHT * (1 - remise / 100) * 100) / 100;
    }
    totalAccepte = Math.round(totalAccepte * 100) / 100;
    const remiseTotal = Math.round((totalHT - totalAccepte) * 100) / 100;
    const tva = Math.round(totalAccepte * 0.2 * 100) / 100;
    const totalTTC = Math.round((totalAccepte + tva) * 100) / 100;
    const remisePctEffective = totalHT > 0 ? Math.round((remiseTotal / totalHT) * 10000) / 100 : 0;

    const [result] = await pool.query(
      `INSERT INTO devis
         (numero, client_id, prospect_id, opportunite_id, contactId,
          titre, dateValidite, totalHT, tauxTVA, totalTVA, totalTTC,
          notesInternes, notesClient, cree_par,
          type_entite, regime_fiscal, regime_tva, nb_etablissements,
          factures_achat, factures_vente, lignes_banque, operations_diverses, immobilisations, effectif,
          remise_pct, total_ht_net, total_theorique_ht, remise_commerciale_ht, total_accepte_ht)
       VALUES (?,?,?,?,0,?,?,?,20,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        numero, client_id || null, prospect_id || null, resolvedOppId,
        titre, dateValidite || null,
        totalHT, tva, totalTTC,
        notesInternes || null, notesClient || null,
        req.user.id,
        type_entite, regime_fiscal, regime_tva, nb_etablissements,
        factures_achat, factures_vente, lignes_banque,
        odVal ?? Math.round((Number(factures_achat) + Number(factures_vente)) * 0.1),
        immobilisations, effectif,
        remisePctEffective, totalAccepte, totalHT, remiseTotal, totalAccepte,
      ]
    );
    const devisId = result.insertId;

    if (resolvedOppId) {
      await pool.query(`UPDATE opportunites SET devis_id = ? WHERE id = ?`, [devisId, resolvedOppId]);
    }

    for (let i = 0; i < allLignes.length; i++) {
      const l = allLignes[i];
      await pool.query(
        `INSERT INTO lignes_devis
           (devisId, ordre, description, quantite, prixUnitaireHT, remisePct, totalHT,
            rubrique, section, intervenant, periodicite, temps_minutes, tarif_ht, actif, mode_suivi, mode_saisie, chapitre)
         VALUES (?,?,?,1,?,0,?,?,?,?,?,?,?,1,?,?,?)`,
        [devisId, i, l.libelle, l.tarif_ht, l.tarif_ht,
         l.rubrique, l.section, l.intervenant, l.periodicite, l.temps_minutes, l.tarif_ht,
         l.mode_suivi || 'temps', l.mode_saisie || 'chiffre', l.chapitre || null]
      );
    }

    // Insert chapitres summary
    const conn = await pool.getConnection();
    try {
      await upsertDevisChapitres(conn, devisId, allLignes, chapitres_remise);
    } finally { conn.release(); }

    // Synchro prospect
    if (prospect_id) {
      const enrichFields = [];
      const enrichValues = [];
      const add = (col, val) => { if (val != null && val !== '') { enrichFields.push(`${col} = IF(${col} IS NULL OR ${col} = '', ?, ${col})`); enrichValues.push(val); } };
      const { siren: pSiren, adresse: pAdresse, code_postal: pCp, ville: pVille } = req.body;
      add('siren', pSiren); add('adresse', pAdresse); add('code_postal', pCp); add('ville', pVille);
      if (type_entite === 'societe' || type_entite === 'ei') add('type_prospect', 'entreprise');
      if (type_entite === 'association') add('type_prospect', 'association');
      if (enrichFields.length > 0) {
        await pool.query(`UPDATE prospects SET ${enrichFields.join(', ')} WHERE id = ?`, [...enrichValues, prospect_id]).catch(() => {});
      }
      if (segment) {
        await pool.query('UPDATE prospects SET segment = ? WHERE id = ?', [segment, prospect_id]).catch(() => {});
      }
    }

    res.status(201).json({ id: devisId, numero, opportunite_id: resolvedOppId, totalHT, totalHTNet: totalAccepte, totalTTC, lignesCount: allLignes.length });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── GET /:id ──────────────────────────────────────────────────────────────────

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[d]] = await pool.query(
      `SELECT d.*,
              c.nom AS client_nom, c.siren AS client_siren,
              p.nom AS prospect_nom,
              COALESCE(c.nom, p.nom) AS display_nom,
              u.prenom AS cree_par_prenom, u.nom AS cree_par_nom,
              lm.id AS ldm_id, lm.numero AS ldm_numero, lm.statut AS ldm_statut
       FROM devis d
       LEFT JOIN clients c ON d.client_id = c.id
       LEFT JOIN prospects p ON d.prospect_id = p.id
       LEFT JOIN utilisateurs u ON d.cree_par = u.id
       LEFT JOIN lettres_mission lm ON lm.devis_id = d.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!d) return res.status(404).json({ message: 'Devis introuvable' });

    const [lignes] = await pool.query(
      'SELECT * FROM lignes_devis WHERE devisId = ? ORDER BY ordre', [d.id]
    );
    const [chapitres] = await pool.query(
      'SELECT chapitre, total_theorique_ht, montant_accepte_ht, remise_ht FROM devis_chapitres WHERE devis_id = ?', [d.id]
    );
    const grouped = groupByRubrique(lignes);
    res.json({ ...d, lignes, lignes_grouped: grouped, chapitres });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────

router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[cur]] = await pool.query('SELECT * FROM devis WHERE id = ?', [req.params.id]);
    if (!cur) return res.status(404).json({ message: 'Devis introuvable' });
    if (cur.statut !== 'brouillon') return res.status(400).json({ message: 'Seul un devis brouillon peut être modifié' });

    const {
      titre, dateValidite, notesInternes, notesClient, client_id,
      type_entite, regime_fiscal, regime_tva, nb_etablissements,
      factures_achat, factures_vente, lignes_banque, operations_diverses, immobilisations, effectif,
      remise_pct,
    } = req.body;

    const fields = [], values = [];
    if (titre !== undefined)              { fields.push('titre = ?');              values.push(titre); }
    if (dateValidite !== undefined)       { fields.push('dateValidite = ?');       values.push(dateValidite); }
    if (notesInternes !== undefined)      { fields.push('notesInternes = ?');      values.push(notesInternes); }
    if (notesClient !== undefined)        { fields.push('notesClient = ?');        values.push(notesClient); }
    if (client_id !== undefined)          { fields.push('client_id = ?');          values.push(client_id); }
    if (type_entite !== undefined)        { fields.push('type_entite = ?');        values.push(type_entite); }
    if (regime_fiscal !== undefined)      { fields.push('regime_fiscal = ?');      values.push(regime_fiscal); }
    if (regime_tva !== undefined)         { fields.push('regime_tva = ?');         values.push(regime_tva); }
    if (nb_etablissements !== undefined)  { fields.push('nb_etablissements = ?');  values.push(nb_etablissements); }
    if (factures_achat !== undefined)     { fields.push('factures_achat = ?');     values.push(factures_achat); }
    if (factures_vente !== undefined)     { fields.push('factures_vente = ?');     values.push(factures_vente); }
    if (lignes_banque !== undefined)      { fields.push('lignes_banque = ?');      values.push(lignes_banque); }
    if (operations_diverses !== undefined){ fields.push('operations_diverses = ?');values.push(operations_diverses); }
    if (immobilisations !== undefined)    { fields.push('immobilisations = ?');    values.push(immobilisations); }
    if (effectif !== undefined)           { fields.push('effectif = ?');           values.push(effectif); }
    if (remise_pct !== undefined)         { fields.push('remise_pct = ?');         values.push(remise_pct); }

    if (fields.length) {
      values.push(req.params.id);
      await pool.query(`UPDATE devis SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    // Re-calculate lines from updated params
    const newParams = {
      type_entite:          type_entite          ?? cur.type_entite,
      regime_fiscal:        regime_fiscal        ?? cur.regime_fiscal,
      regime_tva:           regime_tva           ?? cur.regime_tva,
      nb_etablissements:    nb_etablissements    ?? cur.nb_etablissements,
      factures_achat:       factures_achat       ?? cur.factures_achat,
      factures_vente:       factures_vente       ?? cur.factures_vente,
      lignes_banque:        lignes_banque        ?? cur.lignes_banque,
      operations_diverses:  operations_diverses  != null ? Number(operations_diverses) : (cur.operations_diverses != null ? cur.operations_diverses : null),
      immobilisations:      immobilisations      ?? cur.immobilisations,
      effectif:             effectif             ?? cur.effectif,
    };
    const newRemise = remise_pct !== undefined ? remise_pct : cur.remise_pct;
    const totals = await recalculerLignes(Number(req.params.id), newParams, newRemise);

    res.json({ message: 'Devis mis à jour', ...totals });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── POST /:id/envoyer ─────────────────────────────────────────────────────────

router.post('/:id/envoyer', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[d]] = await pool.query(
      `SELECT d.*,
              c.nom AS client_nom, c.siren AS client_siren,
              c.adresse AS client_adresse, c.code_postal AS client_cp, c.ville AS client_ville,
              COALESCE(c.email_dirigeant, c.portal_email) AS client_email,
              p.nom AS prospect_nom, p.siren AS prospect_siren,
              p.adresse AS prospect_adresse, p.code_postal AS prospect_cp, p.ville AS prospect_ville,
              COALESCE(p.contact_email, p.email) AS prospect_email,
              p.contact_prenom, p.contact_nom, p.forme_juridique, p.segment AS prospect_segment,
              COALESCE(c.nom, p.nom) AS display_nom,
              COALESCE(c.siren, p.siren) AS display_siren,
              u.prenom AS cree_par_prenom, u.nom AS cree_par_nom, u.email AS cree_par_email
       FROM devis d
       LEFT JOIN clients c ON d.client_id = c.id
       LEFT JOIN prospects p ON d.prospect_id = p.id
       LEFT JOIN utilisateurs u ON d.cree_par = u.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!d) return res.status(404).json({ message: 'Devis introuvable' });
    if (d.statut !== 'brouillon') return res.status(400).json({ message: 'Ce devis a déjà été envoyé' });

    // ── Check email before touching status ──────────────────────────────────
    const destinataire = req.body.emailOverride || d.client_email || d.prospect_email;
    if (!destinataire) {
      return res.json({ missingEmail: true, nomContact: d.display_nom || '' });
    }

    // ── Update status ───────────────────────────────────────────────────────
    await pool.query(
      `UPDATE devis SET statut = 'envoye', dateEmission = COALESCE(dateEmission, NOW()) WHERE id = ?`,
      [req.params.id]
    );
    if (d.opportunite_id) {
      pool.query(`UPDATE opportunites SET statut = 'negociation', probabilite = 50, updatedAt = NOW() WHERE id = ?`, [d.opportunite_id]).catch(() => {});
    }
    if (d.client_id) {
      pool.query(`UPDATE opportunites SET statut = 'negociation', probabilite = 50, updatedAt = NOW() WHERE client_id = ? AND statut NOT IN ('gagne','perdu')`, [d.client_id]).catch(() => {});
    }

    // ── Send email ──────────────────────────────────────────────────────────
    if (destinataire) {
      try {
        // Generate or reuse PDF
        const [lignes] = await pool.query(
          'SELECT * FROM lignes_devis WHERE devisId = ? AND actif = 1 ORDER BY ordre', [d.id]
        );
        const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
        const cabinet = cab || {};

        const ENTITE_LABELS = { ei: 'Entreprise individuelle', societe: 'Société', association: 'Association' };
        const formeClean = resolveFormeJuridique(d.forme_juridique || ENTITE_LABELS[d.type_entite] || '');

        const dateEmission = new Date().toISOString().split('T')[0];
        const validiteBase = new Date(dateEmission); validiteBase.setDate(validiteBase.getDate() + 30);
        const dateValidite = (d.dateValidite ? new Date(d.dateValidite) : validiteBase).toISOString().split('T')[0];

        const payload = {
          numero:                 d.numero,
          date_emission:          dateEmission,
          date_validite:          dateValidite,
          prospect: {
            raison_sociale:       d.display_nom || '',
            forme:                formeClean,
            siren:                d.display_siren || '',
            adresse:              d.client_id ? (d.client_adresse || '') : (d.prospect_adresse || ''),
            cp_ville:             d.client_id
              ? [d.client_cp, d.client_ville].filter(Boolean).join(' ')
              : [d.prospect_cp, d.prospect_ville].filter(Boolean).join(' '),
            interlocuteur:        d.contact_prenom || d.contact_nom
              ? `${d.contact_prenom || ''} ${d.contact_nom || ''}`.trim()
              : '',
          },
          comprehension_besoin:   d.notesInternes || '',
          prestations_detaillees: lignes.map(l => ({
            libelle:   l.libelle || l.description || '',
            rubrique:  l.rubrique || '',
            section:   l.section || '',
            periodicite: l.periodicite || '',
            tarif_ht:  parseFloat(l.tarif_ht || l.totalHT || 0),
          })),
          honoraires_ht_brut:              parseFloat(d.totalHT || 0),
          honoraires_total_ht_annuel:      parseFloat(d.total_ht_net || d.totalHT || 0),
          remise_pct:                      parseFloat(d.remise_pct || 0),
          cabinet: {
            adresse:    cabinet.adresse    || '5 Place Langrand',
            codePostal: cabinet.codePostal || '54400',
            ville:      cabinet.ville      || 'Longwy',
            pays:       'France',
            siteWeb:    cabinet.siteWeb    || 'www.parfi-france.fr',
            telephone:  cabinet.telephone  || '',
            email:      cabinet.email      || 'thierry.alcaraz@parfi-france.fr',
          },
          signataire: {
            nom_complet: d.cree_par_prenom ? `${d.cree_par_prenom} ${d.cree_par_nom}`.trim() : 'ParFi France',
            fonction:    'Expert-Comptable',
            email:       d.cree_par_email || cabinet.email || 'thierry.alcaraz@parfi-france.fr',
            telephone:   cabinet.telephone || '',
          },
        };

        // Inject segment template if no custom notes
        if (!d.notesInternes && d.prospect_segment) {
          const [[tpl]] = await pool.query(
            'SELECT texte FROM devis_comprehension_templates WHERE segment = ?',
            [d.prospect_segment]
          ).catch(() => [[null]]);
          if (tpl && tpl.texte) {
            payload.comprehension_besoin = tpl.texte.replace(/\[RAISON_SOCIALE\]/g, d.display_nom || '');
          }
        }

        const pdfBuffer = await generateDevisPdf(payload);

        // Save PDF
        await fs.mkdir(PDF_DIR, { recursive: true });
        const filename = `${d.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
        const filepath = path.join(PDF_DIR, filename);
        await fs.writeFile(filepath, pdfBuffer);
        await pool.query('UPDATE devis SET pdf_path = ? WHERE id = ?', [filepath, d.id]);

        const nomClient = d.display_nom || destinataire;
        const ht = parseFloat(d.total_ht_net || d.totalHT || 0);
        const mensuel = (ht / 12).toFixed(2).replace('.', ',');
        const ttc = (ht * 1.2).toFixed(2).replace('.', ',');

        const htmlContent = `
<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1a3a5c;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:22px;">ParFi France</h1>
    <p style="color:#c5d3e8;margin:4px 0 0;font-size:13px;">Expert-Comptable & Commissaire aux Comptes</p>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p style="font-size:15px;">Madame, Monsieur,</p>
    <p>Veuillez trouver ci-joint notre <strong>proposition d'honoraires n° ${d.numero}</strong> établie à l'attention de <strong>${nomClient}</strong>.</p>
    <div style="background:#f0f4f9;border-left:4px solid #1a3a5c;padding:16px;border-radius:4px;margin:20px 0;">
      <p style="margin:0;font-size:13px;color:#555;">Récapitulatif :</p>
      <p style="margin:6px 0 0;font-size:16px;font-weight:bold;color:#1a3a5c;">${ht.toFixed(2).replace('.', ',')} € HT / an  ·  ${mensuel} € HT / mois</p>
      <p style="margin:4px 0 0;font-size:13px;color:#888;">Total TTC : ${ttc} €</p>
    </div>
    <p>Cette proposition est valable <strong>30 jours</strong> à compter de sa date d'émission. Pour l'accepter, il vous suffit de nous retourner le document signé.</p>
    <p>Nous restons à votre disposition pour toute question.</p>
    <p style="margin-top:28px;">Cordialement,<br>
    <strong>${d.cree_par_prenom || 'ParFi France'} ${d.cree_par_nom || ''}</strong><br>
    <span style="color:#888;font-size:13px;">Expert-Comptable — ParFi France</span></p>
  </div>
  <p style="font-size:11px;color:#aaa;text-align:center;margin-top:16px;">
    ParFi France · ${cabinet.adresse || '5 Place Langrand'} · ${cabinet.codePostal || '54400'} ${cabinet.ville || 'Longwy'}
  </p>
</body></html>`;

        const { sendEmail } = require('../utils/mailer');
        await sendEmail({
          to:          destinataire,
          toName:      nomClient,
          subject:     `Proposition d'honoraires ${d.numero} — ParFi France`,
          htmlContent,
          attachments: [{ base64: pdfBuffer.toString('base64'), filename: `${d.numero}.pdf` }],
        });

        return res.json({ message: 'Devis envoyé par email', statut: 'envoye', email: destinataire });
      } catch (emailErr) {
        // Email failed but status is already updated — report warning
        console.error('[envoyer devis] email error:', emailErr.message);
        return res.json({
          message: `Statut mis à jour mais envoi email échoué : ${emailErr.message}`,
          statut: 'envoye',
          emailError: emailErr.message,
        });
      }
    }

  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── POST /:id/accepter ────────────────────────────────────────────────────────

router.post('/:id/accepter', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[d]] = await pool.query('SELECT * FROM devis WHERE id = ?', [req.params.id]);
    if (!d) return res.status(404).json({ message: 'Devis introuvable' });
    await pool.query(`UPDATE devis SET statut = 'accepte' WHERE id = ?`, [req.params.id]);
    if (d.opportunite_id) {
      pool.query(`UPDATE opportunites SET statut = 'devis_envoye', probabilite = 70, updatedAt = NOW() WHERE id = ?`, [d.opportunite_id]).catch(() => {});
    }
    if (d.client_id) {
      pool.query(`UPDATE opportunites SET statut = 'devis_envoye', probabilite = 70, updatedAt = NOW() WHERE client_id = ? AND statut NOT IN ('gagne','perdu')`, [d.client_id]).catch(() => {});
    }

    // Générer la LDM via le service (idempotent + snapshot + audit)
    const acteurNom = req.user ? `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() : null;
    const { ldm } = await ldmService.genererDepuisDevis(d.id, req.user?.id, acteurNom);

    res.json({ message: 'Devis signé — LDM créée', statut: 'accepte', ldmId: ldm.id, ldmNumero: ldm.numero });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── POST /:id/refuser ─────────────────────────────────────────────────────────

router.post('/:id/refuser', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[d]] = await pool.query('SELECT * FROM devis WHERE id = ?', [req.params.id]);
    if (!d) return res.status(404).json({ message: 'Devis introuvable' });
    await pool.query(`UPDATE devis SET statut = 'refuse' WHERE id = ?`, [req.params.id]);
    if (d.opportunite_id) {
      pool.query(`UPDATE opportunites SET statut = 'perdu', updatedAt = NOW() WHERE id = ?`, [d.opportunite_id]).catch(() => {});
    }
    res.json({ message: 'Devis refusé', statut: 'refuse' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── POST /:id/dupliquer ───────────────────────────────────────────────────────

router.post('/:id/dupliquer', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[src]] = await pool.query('SELECT * FROM devis WHERE id = ?', [req.params.id]);
    if (!src) return res.status(404).json({ message: 'Devis source introuvable' });

    const numero = await nextNumero('DEV');
    const [result] = await pool.query(
      `INSERT INTO devis
         (numero, client_id, prospect_id, contactId,
          titre, totalHT, tauxTVA, totalTVA, totalTTC, total_ht_net,
          notesInternes, notesClient, cree_par, statut,
          type_entite, regime_fiscal, regime_tva, nb_etablissements,
          factures_achat, factures_vente, lignes_banque, operations_diverses, immobilisations, effectif,
          remise_pct, duplique_de)
       VALUES (?,?,?,0,?,?,?,?,?,?,?,?,?,'brouillon',?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        numero, src.client_id, src.prospect_id,
        `Copie - ${src.titre}`,
        src.totalHT, src.tauxTVA, src.totalTVA, src.totalTTC, src.total_ht_net,
        src.notesInternes, src.notesClient, req.user.id,
        src.type_entite, src.regime_fiscal, src.regime_tva, src.nb_etablissements,
        src.factures_achat, src.factures_vente, src.lignes_banque, src.operations_diverses,
        src.immobilisations, src.effectif,
        src.remise_pct, src.id,
      ]
    );
    const newId = result.insertId;

    // Rattacher le nouveau devis à l'opportunité source
    if (src.opportunite_id) {
      await pool.query(`UPDATE opportunites SET devis_id = ? WHERE id = ?`, [newId, src.opportunite_id]);
    }

    // Copy lignes
    const [lignes] = await pool.query('SELECT * FROM lignes_devis WHERE devisId = ? ORDER BY ordre', [src.id]);
    for (const l of lignes) {
      await pool.query(
        `INSERT INTO lignes_devis
           (devisId, ordre, description, quantite, prixUnitaireHT, remisePct, totalHT,
            rubrique, section, intervenant, periodicite, temps_minutes, tarif_ht, actif)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [newId, l.ordre, l.description, l.quantite, l.prixUnitaireHT, l.remisePct, l.totalHT,
         l.rubrique, l.section, l.intervenant, l.periodicite, l.temps_minutes, l.tarif_ht, l.actif]
      );
    }

    res.status(201).json({ id: newId, numero, message: 'Devis dupliqué' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── POST /:id/convertir-ldm ───────────────────────────────────────────────────

router.post('/:id/convertir-ldm', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[d]] = await pool.query('SELECT * FROM devis WHERE id = ?', [req.params.id]);
    if (!d) return res.status(404).json({ message: 'Devis introuvable' });
    if (d.statut !== 'accepte') return res.status(400).json({ message: 'Le devis doit être accepté pour créer une LDM' });

    const acteurNom = req.user ? `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() : null;
    const { ldm, created } = await ldmService.genererDepuisDevis(d.id, req.user?.id, acteurNom);

    if (!created) {
      return res.status(200).json({ id: ldm.id, numero: ldm.numero, message: 'LDM déjà existante', ldm_id: ldm.id });
    }

    // Copy chapitres from devis to LDM
    const conn = await pool.getConnection();
    try {
      await copyChapitresLDM(conn, d.id, ldm.id);
      // Copy totaux
      await conn.query(
        `UPDATE lettres_mission SET total_theorique_ht=?, remise_commerciale_ht=?, total_accepte_ht=? WHERE id=?`,
        [d.total_theorique_ht, d.remise_commerciale_ht, d.total_accepte_ht, ldm.id]
      );
    } finally { conn.release(); }

    res.status(201).json({ id: ldm.id, numero: ldm.numero, message: 'Lettre de mission créée' });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ message: e.message || 'Erreur serveur' });
  }
});

// ── GET /:id/html ─────────────────────────────────────────────────────────────

router.get('/:id/html', verifyToken, async (req, res) => {
  try {
    const [[d]] = await pool.query(
      `SELECT d.*,
              c.nom AS client_nom, c.siren AS client_siren,
              c.adresse AS client_adresse, c.code_postal AS client_cp, c.ville AS client_ville,
              p.nom AS prospect_nom, p.siren AS prospect_siren,
              p.adresse AS prospect_adresse, p.code_postal AS prospect_cp, p.ville AS prospect_ville,
              COALESCE(c.nom, p.nom) AS display_nom,
              COALESCE(c.siren, p.siren) AS display_siren,
              COALESCE(c.adresse, p.adresse) AS display_adresse,
              COALESCE(c.code_postal, p.code_postal) AS display_cp,
              COALESCE(c.ville, p.ville) AS display_ville
       FROM devis d
       LEFT JOIN clients c ON d.client_id = c.id
       LEFT JOIN prospects p ON d.prospect_id = p.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!d) return res.status(404).json({ message: 'Devis introuvable' });

    const [lignes] = await pool.query('SELECT * FROM lignes_devis WHERE devisId = ? ORDER BY ordre', [d.id]);
    const grouped = groupByRubrique(lignes);

    // Fetch cabinet info
    const [[cabinet]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);

    const html = generateDevisHTML(d, grouped, cabinet || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────

// ── POST /:id/generer-plan-facturation — génère les factures récurrentes depuis un devis accepté ──
router.post('/:id/generer-plan-facturation', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[devis]] = await pool.query(
      `SELECT d.*, c.nom AS client_nom, lm.id AS ldm_id_real
       FROM devis d
       LEFT JOIN clients c ON d.client_id = c.id
       LEFT JOIN lettres_mission lm ON lm.devis_id = d.id
       WHERE d.id = ?`, [req.params.id]
    );
    if (!devis) return res.status(404).json({ message: 'Devis introuvable' });
    if (devis.statut !== 'accepte') return res.status(400).json({ message: 'Le devis doit être accepté' });

    // Déléguer à la LDM si elle existe
    const ldmId = devis.ldm_id || devis.ldm_id_real;
    if (ldmId) {
      const { genererFacturesDepuisLDM } = require('../utils/facturation');
      const factureIds = await genererFacturesDepuisLDM(ldmId);
      return res.json({ message: `${factureIds.length} facture(s) générée(s) depuis la LDM`, factureIds, source: 'ldm' });
    }

    // Génération directe depuis le devis (mensuel par défaut)
    const { nextFactureNumero } = require('../utils/facturation');
    const montantHT  = parseFloat(devis.total_ht_net || devis.totalHT || 0);
    const tauxTVA    = 20;
    const nbMois     = 12;
    const montantMois = parseFloat((montantHT / nbMois).toFixed(2));
    const dateDebut  = new Date();
    dateDebut.setDate(1);
    const factureIds = [];

    for (let i = 0; i < nbMois; i++) {
      const emission = new Date(dateDebut);
      const echeance = new Date(dateDebut);
      echeance.setDate(echeance.getDate() + 30);
      const tvaMois  = parseFloat((montantMois * tauxTVA / 100).toFixed(2));
      const ttcMois  = parseFloat((montantMois + tvaMois).toFixed(2));
      const numero   = await nextFactureNumero();

      const [r] = await pool.query(
        `INSERT INTO factures (numero, client_id, type, statut, dateEmission, dateEcheance,
          totalHT, tauxTVA, totalTVA, totalTTC, estRecurrente, periodeRecurrence, notesInternes)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,'mensuelle',?)`,
        [numero, devis.client_id, 'recurrence', 'brouillon',
         emission, echeance, montantMois, tauxTVA, tvaMois, ttcMois,
         `Auto-générée depuis devis ${devis.numero}`]
      );
      const fid = r.insertId;
      await pool.query(
        `INSERT INTO lignes_facture (factureId, ordre, description, quantite, prixUnitaireHT, totalHT)
         VALUES (?,1,?,1,?,?)`,
        [fid, devis.titre || 'Honoraires', montantMois, montantMois]
      );
      factureIds.push(fid);
      dateDebut.setMonth(dateDebut.getMonth() + 1);
    }

    // Plan de facturation
    await pool.query(
      `INSERT INTO plan_facturation (lettreMissionId, client_id, frequence, montantHT, tauxTVA, dateDebut, echeances, statut)
       VALUES (NULL, ?, 'mensuelle', ?, ?, CURDATE(), ?, 'actif')`,
      [devis.client_id, montantHT, tauxTVA, JSON.stringify(factureIds)]
    ).catch(() => {});

    res.json({ message: `${factureIds.length} facture(s) générée(s)`, factureIds, source: 'devis' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('DELETE FROM lignes_devis WHERE devisId = ?', [req.params.id]);
    await pool.query('DELETE FROM devis WHERE id = ?', [req.params.id]);
    res.json({ message: 'Devis supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ── POST /:id/generer-pdf ─────────────────────────────────────────────────────

router.post('/:id/generer-pdf', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[d]] = await pool.query(
      `SELECT d.*,
              c.nom AS client_nom, c.siren AS client_siren,
              c.adresse AS client_adresse, c.code_postal AS client_cp, c.ville AS client_ville,
              p.nom AS prospect_nom, p.siren AS prospect_siren,
              p.adresse AS prospect_adresse, p.code_postal AS prospect_cp, p.ville AS prospect_ville,
              p.forme_juridique, p.contact_prenom, p.contact_nom, p.segment AS prospect_segment,
              COALESCE(c.nom, p.nom) AS display_nom,
              COALESCE(c.siren, p.siren) AS display_siren,
              u.prenom AS cree_par_prenom, u.nom AS cree_par_nom, u.email AS cree_par_email
       FROM devis d
       LEFT JOIN clients c ON d.client_id = c.id
       LEFT JOIN prospects p ON d.prospect_id = p.id
       LEFT JOIN utilisateurs u ON d.cree_par = u.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!d) return res.status(404).json({ message: 'Devis introuvable' });

    const [lignes] = await pool.query(
      'SELECT * FROM lignes_devis WHERE devisId = ? AND actif = 1 ORDER BY ordre',
      [d.id]
    );

    const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
    const cabinet = cab || {};

    const ENTITE_LABELS = { ei: 'Entreprise individuelle', societe: 'Société', association: 'Association' };
    const formeClean = resolveFormeJuridique(d.forme_juridique || ENTITE_LABELS[d.type_entite] || '');

    const adresse = d.client_id
      ? d.client_adresse || ''
      : d.prospect_adresse || '';
    const cp_ville_parts = d.client_id
      ? [d.client_cp, d.client_ville]
      : [d.prospect_cp, d.prospect_ville];
    const cp_ville = cp_ville_parts.filter(Boolean).join(' ');

    const contact = d.contact_prenom || d.contact_nom
      ? `${d.contact_prenom || ''} ${d.contact_nom || ''}`.trim()
      : '';

    const dateEmission = d.dateEmission
      ? new Date(d.dateEmission).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const validiteBase = d.dateValidite ? new Date(d.dateValidite) : (() => {
      const dt = new Date(dateEmission); dt.setDate(dt.getDate() + 30); return dt;
    })();
    const dateValidite = validiteBase.toISOString().split('T')[0];

    const payload = {
      numero:                    d.numero,
      date_emission:             dateEmission,
      date_validite:             dateValidite,
      prospect: {
        raison_sociale:          d.display_nom || '',
        forme:                   formeClean,
        siren:                   d.display_siren || '',
        adresse,
        cp_ville,
        interlocuteur:           contact,
        fonction:                '',
      },
      comprehension_besoin:      d.notesInternes || '',
      prestations_detaillees:    lignes.map(l => ({
        libelle:                 l.libelle || l.description || '',
        rubrique:                l.rubrique || '',
        section:                 l.section || '',
        periodicite:             l.periodicite || '',
        tarif_ht:                parseFloat(l.tarif_ht || l.totalHT || 0),
      })),
      honoraires_ht_brut:        parseFloat(d.totalHT || 0),
      honoraires_total_ht_annuel: parseFloat(d.total_ht_net || d.totalHT || 0),
      remise_pct:                parseFloat(d.remise_pct || 0),
      cabinet: {
        adresse:                 cabinet.adresse || '5 Place Langrand',
        codePostal:              cabinet.codePostal || '54400',
        ville:                   cabinet.ville || 'Longwy',
        pays:                    'France',
        siteWeb:                 cabinet.siteWeb || 'www.parfi-france.fr',
        telephone:               cabinet.telephone || '',
        email:                   cabinet.email || 'thierry.alcaraz@parfi-france.fr',
      },
      signataire: {
        nom_complet:             d.cree_par_prenom ? `${d.cree_par_prenom} ${d.cree_par_nom}`.trim() : 'ParFi France',
        fonction:                'Expert-Comptable',
        email:                   cabinet.email || 'thierry.alcaraz@parfi-france.fr',
        telephone:               cabinet.telephone || '',
      },
    };

    // Inject segment template if no custom notes
    if (!d.notesInternes && d.prospect_segment) {
      const [[tpl]] = await pool.query(
        'SELECT texte FROM devis_comprehension_templates WHERE segment = ?',
        [d.prospect_segment]
      ).catch(() => [[null]]);
      if (tpl && tpl.texte) {
        payload.comprehension_besoin = tpl.texte.replace(/\[RAISON_SOCIALE\]/g, d.display_nom || '');
      }
    }

    const pdfBuffer = await generateDevisPdf(payload);

    await fs.mkdir(PDF_DIR, { recursive: true });
    const filename = `${d.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    await fs.writeFile(filepath, pdfBuffer);

    await pool.query('UPDATE devis SET pdf_path = ? WHERE id = ?', [filepath, d.id]);

    res.json({ ok: true, filename, size: pdfBuffer.length });
  } catch (e) {
    console.error('[devis pdf]', e);
    res.status(500).json({ message: 'Erreur génération PDF', error: e.message });
  }
});

// ── GET /:id/pdf ──────────────────────────────────────────────────────────────

router.get('/:id/pdf', verifyToken, async (req, res) => {
  try {
    const [[d]] = await pool.query(
      'SELECT numero, pdf_path FROM devis WHERE id = ?', [req.params.id]
    );
    if (!d) return res.status(404).json({ message: 'Devis introuvable' });
    if (!d.pdf_path) return res.status(404).json({ message: 'PDF non encore généré' });

    const pdfBuffer = await fs.readFile(d.pdf_path);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${d.numero}.pdf"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'private, max-age=300',
    });
    res.send(pdfBuffer);
  } catch (e) {
    res.status(500).json({ message: 'Erreur lecture PDF', error: e.message });
  }
});

module.exports = router;
