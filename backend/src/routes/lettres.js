const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { genererFacturesDepuisLDM } = require('../utils/facturation');
const { genererEtSauvegarderPdfLDM } = require('../utils/ldmPdf');
const ldmService = require('../services/ldmService');

// ── LDM HTML helper ───────────────────────────────────────────────────────────
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

function generateLDMHTML(ldm, lignesGrouped, mandats, cabinet) {
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rubriquesHTML = lignesGrouped.map((rub, idx) => {
    const detailRows = rub.lignes.map(l => `
      <tr class="detail-row" data-rub="${idx}" style="display:none">
        <td style="padding:6px 8px 6px 32px;color:#555;">${l.libelle || l.description || ''}</td>
        <td style="padding:6px 8px;color:#888;font-size:0.85em;">${l.periodicite || ''}</td>
        <td style="padding:6px 8px;text-align:right;color:#555;">${fmt(l.tarif_ht || l.totalHT)} €</td>
      </tr>`).join('');
    return `
      <tr class="rubrique-row" data-idx="${idx}" onclick="toggle(${idx})" style="cursor:pointer;background:#f8f9fa;">
        <td style="padding:10px 8px;font-weight:600;color:#1a3a5c;">
          <span id="chev-${idx}" style="display:inline-block;transition:transform .2s;margin-right:6px;">▶</span>
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
    <h2>Mandats</h2>
    <table><thead><tr style="background:#1a3a5c;color:#fff;">
      <th style="padding:8px;text-align:left;">Type</th>
      <th style="padding:8px;text-align:left;">Libellé</th>
      <th style="padding:8px;text-align:center;">Signé</th>
      <th style="padding:8px;text-align:left;">Date</th>
    </tr></thead><tbody>${mandats.map(m => `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:8px;">${m.type}</td>
        <td style="padding:8px;">${m.libelle}</td>
        <td style="padding:8px;text-align:center;">${m.signe ? '✓' : '—'}</td>
        <td style="padding:8px;">${m.date_signature ? new Date(m.date_signature).toLocaleDateString('fr-FR') : '—'}</td>
      </tr>`).join('')}
    </tbody></table>` : '';

  const dateDebut = ldm.dateDebut ? new Date(ldm.dateDebut).toLocaleDateString('fr-FR') : '—';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Lettre de Mission ${ldm.numero}</title>
<style>
* { box-sizing:border-box;margin:0;padding:0; }
body { font-family:'Helvetica Neue',Arial,sans-serif;color:#333;background:#fff;font-size:14px;line-height:1.5; }
.page { max-width:900px;margin:0 auto;padding:40px 30px; }
.header { display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1a3a5c; }
.cabinet-name { font-size:1.6em;font-weight:700;color:#1a3a5c; }
.cabinet-info { font-size:0.85em;color:#555;margin-top:6px; }
h2 { color:#1a3a5c;font-size:1.1em;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid #ddd; }
.clause { background:#f9f9f9;border-left:3px solid #c5d3e8;padding:12px 16px;margin-bottom:12px;border-radius:0 4px 4px 0;font-size:0.9em; }
.sig-block { display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px; }
.sig-box { border:1px solid #ccc;border-radius:6px;padding:16px;min-height:120px; }
.sig-box label { font-size:0.8em;color:#888;display:block;margin-bottom:8px; }
table { width:100%;border-collapse:collapse;margin-bottom:16px; }
thead th { background:#1a3a5c;color:#fff;padding:10px 8px;text-align:left;font-size:0.85em; }
.totals-table { width:350px;margin-left:auto; }
.totals-table td { padding:6px 8px; }
.total-line { font-weight:700;color:#1a3a5c;border-top:2px solid #1a3a5c; }
</style>
<script>
function toggle(idx){
  var rows=document.querySelectorAll('[data-rub="'+idx+'"]');
  var chev=document.getElementById('chev-'+idx);
  var open=rows[0]&&rows[0].style.display!=='none';
  rows.forEach(function(r){r.style.display=open?'none':'table-row';});
  chev.style.transform=open?'':'rotate(90deg)';
}
</script>
</head>
<body><div class="page">
  <div class="header">
    <div>
      <div class="cabinet-name">${cabinet.nomCabinet || 'ParFi France'}</div>
      <div class="cabinet-info">
        ${cabinet.adresse || '5 Place Langrand'}, ${cabinet.codePostal || '54400'} ${cabinet.ville || 'Longwy'}<br>
        SIREN : ${cabinet.siren || '---'} — Ordre : ${cabinet.numeroOrdre || '---'}<br>
        ${cabinet.email || 'contact@parfi.fr'}${cabinet.telephone ? ' — ' + cabinet.telephone : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:1.2em;font-weight:700;color:#1a3a5c;">Lettre de Mission n° ${ldm.numero}</div>
      <div style="font-size:0.85em;color:#555;">Statut : ${ldm.statut}</div>
      ${dateDebut !== '—' ? `<div style="font-size:0.85em;color:#555;">À compter du ${dateDebut}</div>` : ''}
    </div>
  </div>

  <h2>Parties</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px;">
    <div style="background:#f0f4f9;padding:14px;border-radius:6px;">
      <strong>Cabinet</strong><br>${cabinet.nomCabinet || 'ParFi France'}<br>SIREN : ${cabinet.siren || '---'}
    </div>
    <div style="background:#f0f4f9;padding:14px;border-radius:6px;">
      <strong>Client</strong><br>${ldm.client_nom || '—'}<br>SIREN : ${ldm.client_siren || '—'}
    </div>
  </div>

  ${ldm.objetMission ? `<h2>Objet de la mission</h2><p style="margin-bottom:16px;">${ldm.objetMission}</p>` : ''}

  ${lignesGrouped.length > 0 ? `
  <h2>Détail des prestations</h2>
  <table>
    <thead><tr><th>Rubrique / Prestation</th><th>Périodicité</th><th style="text-align:right">Montant HT</th></tr></thead>
    <tbody>${rubriquesHTML}</tbody>
  </table>` : ''}

  <h2>Honoraires</h2>
  <table class="totals-table"><tbody>
    <tr><td>Total HT</td><td style="text-align:right">${fmt(ldm.montantHonorairesHT)} €</td></tr>
    <tr><td>TVA 20 %</td><td style="text-align:right">${fmt(tva)} €</td></tr>
    <tr class="total-line"><td>Total TTC</td><td style="text-align:right">${fmt(ttc)} €</td></tr>
    <tr><td style="color:#4a6fa5;">Soit / mois</td><td style="text-align:right;color:#4a6fa5;">${fmt(mensuel)} € HT/mois</td></tr>
  </tbody></table>

  ${mandatsHTML}

  <h2>Clauses contractuelles</h2>
  <div class="clause"><strong>Révision des honoraires</strong><br>Les honoraires sont révisés chaque année au 1er janvier selon l'indice INSEE du coût de la vie. Toute modification substantielle de la mission fera l'objet d'un avenant.</div>
  <div class="clause"><strong>Résiliation</strong><br>Chaque partie peut résilier la présente lettre de mission avec un préavis de ${ldm.dureePreavis || 3} mois par lettre recommandée avec accusé de réception. En cas de résiliation, les honoraires restent dus jusqu'à la fin du préavis.</div>
  <div class="clause"><strong>Confidentialité</strong><br>Le cabinet s'engage à maintenir la stricte confidentialité de toutes les informations communiquées par le client dans le cadre de la présente mission.</div>
  <div class="clause"><strong>Protection des données (RGPD)</strong><br>Les données personnelles collectées sont traitées conformément au Règlement Général sur la Protection des Données (UE) 2016/679 et à la loi Informatique et Libertés.</div>
  <div class="clause"><strong>Responsabilité</strong><br>La responsabilité du cabinet est couverte par une assurance responsabilité civile professionnelle. Elle est limitée aux honoraires perçus au titre de la mission concernée, sauf faute intentionnelle.</div>
  <div class="clause"><strong>Déontologie</strong><br>La présente mission est exercée conformément aux normes professionnelles de l'Ordre des Experts-Comptables, notamment le Code de déontologie.</div>

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
</div></body></html>`;
}

// ─── Migration : colonnes budget par intervenant sur lettres_mission ──────────
;(async () => {
  const cols = [
    ['budget_minutes_collab', 'INT DEFAULT 0'],
    ['budget_minutes_chef',   'INT DEFAULT 0'],
    ['budget_minutes_expert', 'INT DEFAULT 0'],
  ];
  for (const [col, def] of cols) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lettres_mission' AND COLUMN_NAME = ?`,
      [col]
    );
    if (!row.n) {
      await pool.query(`ALTER TABLE lettres_mission ADD COLUMN ${col} ${def}`);
      console.log(`[lettres] Colonne ${col} ajoutée`);
    }
  }
})().catch(e => console.error('[lettres] migration budget intervenants:', e.message));

// ─── Helper : calcule et stocke le budget par profil depuis dimensionnement ───
async function stockerBudgetParProfil(ldmId, dimensionnementId) {
  if (!dimensionnementId) return;
  try {
    const [lignes] = await pool.query(
      `SELECT intervenant, SUM(temps_minutes) AS total
       FROM dimensionnement_lignes
       WHERE dimensionnement_id = ? AND actif = 1
         AND intervenant NOT IN ('Collaborateur Social','Collaborateur Juridique')
       GROUP BY intervenant`,
      [dimensionnementId]
    );
    let collab = 0, expert = 0;
    for (const r of lignes) {
      if (r.intervenant === 'Expert-comptable') expert += r.total;
      else collab += r.total; // Collaborateur + Aide comptable
    }
    await pool.query(
      `UPDATE lettres_mission SET budget_minutes_collab=?, budget_minutes_expert=? WHERE id=?`,
      [collab, expert, ldmId]
    );
  } catch (e) {
    console.error('[lettres] stockerBudgetParProfil:', e.message);
  }
}

async function nextDevisNumero() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT numero FROM devis WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
    [`DEV-${year}-%`]
  );
  const seq = rows.length ? parseInt(rows[0].numero.split('-').pop(), 10) + 1 : 1;
  return `DEV-${year}-${String(seq).padStart(3, '0')}`;
}

async function nextNumero() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT numero FROM lettres_mission WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
    [`LM-${year}-%`]
  );
  const seq = rows.length ? parseInt(rows[0].numero.split('-').pop(), 10) + 1 : 1;
  return `LM-${year}-${String(seq).padStart(3, '0')}`;
}

// ── Helpers planning ────────────────────────────────────────────────────────────
function periodiciteToInterval(periodicite) {
  // Normalize: lowercase, remove accents on e/é
  const p = (periodicite || '').toLowerCase().replace(/é/g, 'e').replace(/è/g, 'e');
  if (/mensuel/.test(p))               return 1;
  if (/bimestriel/.test(p))            return 2;  // tous les 2 mois
  if (/trimestriel/.test(p))           return 3;
  if (/bimensuel|semestriel/.test(p))  return 6;
  if (/annuel/.test(p))                return 12;
  return 0; // ponctuel (selon besoin, permanent, à l'embauche, etc.)
}

function planningDates(periodicite, dateDebut, regimeClient) {
  let p = periodicite || '';
  // "Selon régime" → utiliser le régime du client
  if (/r[eé]gime/i.test(p) && regimeClient) p = regimeClient;

  const interval = periodiciteToInterval(p);
  const start = new Date(dateDebut || new Date());

  if (interval === 0) return [start.toISOString().slice(0, 10)];

  const dates = [];
  for (let m = 0; m < 12; m += interval) {
    const d = new Date(start.getFullYear(), start.getMonth() + m, start.getDate());
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function labelPeriodique(libelle, periodicite, date) {
  const interval = periodiciteToInterval(periodicite);
  if (interval === 0) return libelle;
  const d = new Date(date);
  const mois = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return `${libelle} · ${mois}`;
}

// ── Injection de tâches + affectation dossier ─────────────────────────────────
async function injecterTachesLDM(ldmId, collaborateur_id, chef_mission_id, reqUserId) {
  const [[ldm]] = await pool.query(
    `SELECT l.*, c.nom AS client_nom, c.regime AS client_regime
     FROM lettres_mission l LEFT JOIN clients c ON l.client_id = c.id
     WHERE l.id = ?`, [ldmId]
  );
  if (!ldm) return 0;

  // Date de début de mission (1er du mois suivant si pas définie)
  let dateDebut = ldm.dateDebut
    ? new Date(ldm.dateDebut).toISOString().slice(0, 10)
    : (() => {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
        return d.toISOString().slice(0, 10);
      })();
  const regimeClient = ldm.client_regime || 'mensuel';

  const [[expert]] = await pool.query(
    `SELECT id FROM utilisateurs WHERE role = 'expert' AND actif = 1 LIMIT 1`
  ).catch(() => [[null]]);
  const expertId = expert?.id || 1;

  // ── Affecter le dossier : collaborateur responsable ───────────────────────
  if (collaborateur_id && ldm.client_id) {
    try {
      await pool.query(
        `DELETE FROM attributions WHERE client_id = ? AND role_sur_dossier = 'responsable'`,
        [ldm.client_id]
      );
      await pool.query(
        `INSERT INTO attributions (client_id, utilisateur_id, role_sur_dossier) VALUES (?, ?, 'responsable')`,
        [ldm.client_id, Number(collaborateur_id)]
      );
    } catch (e) {
      console.error('injecterTachesLDM: attribution collaborateur erreur:', e.message);
    }
  }

  // ── Affecter le dossier : chef de mission / chef de groupe ────────────────
  if (chef_mission_id && ldm.client_id) {
    try {
      await pool.query(
        `DELETE FROM attributions WHERE client_id = ? AND role_sur_dossier = 'chef_mission'`,
        [ldm.client_id]
      );
      await pool.query(
        `INSERT INTO attributions (client_id, utilisateur_id, role_sur_dossier) VALUES (?, ?, 'chef_mission')`,
        [ldm.client_id, Number(chef_mission_id)]
      );
      // Stocker aussi sur la LDM
      await pool.query(
        `UPDATE lettres_mission SET chef_mission_id = ? WHERE id = ?`,
        [Number(chef_mission_id), ldmId]
      );
    } catch (e) {
      console.error('injecterTachesLDM: attribution chef erreur:', e.message);
    }
  }

  let tachesCreees = 0;

  if (ldm.dimensionnement_id) {
    const [dimLignes] = await pool.query(
      `SELECT * FROM dimensionnement_lignes WHERE dimensionnement_id = ? AND actif = 1`,
      [ldm.dimensionnement_id]
    );

    let intervenantMap = null;
    if (!collaborateur_id) {
      const [[defCollab]] = await pool.query(
        `SELECT id FROM utilisateurs WHERE role = 'collaborateur' AND actif = 1 LIMIT 1`
      ).catch(() => [[null]]);
      const collabId = defCollab?.id || expertId;
      const [[alison]] = await pool.query(
        `SELECT id FROM utilisateurs WHERE actif = 1 AND prenom = 'Alison' LIMIT 1`
      ).catch(() => [[null]]);
      const [[gaelle]] = await pool.query(
        `SELECT id FROM utilisateurs WHERE actif = 1 AND prenom IN ('Gaëlle','Natalie') LIMIT 1`
      ).catch(() => [[null]]);
      intervenantMap = {
        'Expert-comptable':        expertId,
        'Collaborateur Juridique': alison?.id || collabId,
        'Collaborateur Social':    gaelle?.id || collabId,
        'Collaborateur':           collabId,
        'Aide comptable':          collabId,
      };
    }

    for (const l of dimLignes) {
      const userId = collaborateur_id
        ? Number(collaborateur_id)
        : (intervenantMap[l.intervenant] || expertId);

      const dates = planningDates(l.periodicite, dateDebut, regimeClient);
      const isRecurrent = dates.length > 1;

      for (const dateEcheance of dates) {
        try {
          await pool.query(
            `INSERT INTO taches
               (client_id, utilisateur_id, titre, description, date_echeance, source, origine,
                priorite, budget_minutes, periodicite, dimensionnement_ligne_id, assigne_par,
                type_travail)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [ldm.client_id || null, userId,
             isRecurrent ? labelPeriodique(l.libelle, l.periodicite, dateEcheance) : l.libelle,
             `[${l.section}] ${l.libelle} — ${l.periodicite || ''}`,
             dateEcheance,
             'manuelle', 'ldm', 'normale',
             l.temps_minutes || null,
             isRecurrent ? null : (l.periodicite || null),
             l.id, reqUserId, 'recurrent']
          );
          tachesCreees++;
        } catch (e) {
          console.error(`injecterTachesLDM: ligne ${l.id} date ${dateEcheance} erreur:`, e.message);
        }
      }
    }
  } else if (ldm.repartitionTaches) {
    const userId = collaborateur_id ? Number(collaborateur_id) : expertId;
    let tasks = [];
    try {
      tasks = typeof ldm.repartitionTaches === 'string'
        ? JSON.parse(ldm.repartitionTaches)
        : ldm.repartitionTaches;
    } catch {}
    for (const t of (tasks || [])) {
      if (!t.mission && !t.description) continue;
      const dates = planningDates(t.periodicite, dateDebut, regimeClient);
      const isRecurrent = dates.length > 1;
      for (const dateEcheance of dates) {
        try {
          await pool.query(
            `INSERT INTO taches
               (client_id, utilisateur_id, titre, description, date_echeance, source, origine,
                priorite, type_travail, assigne_par)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [ldm.client_id || null, userId,
             isRecurrent ? labelPeriodique(t.mission || t.description, t.periodicite, dateEcheance) : (t.mission || t.description),
             t.detail || t.mission || '', dateEcheance,
             'manuelle', 'ldm', 'normale', 'recurrent', reqUserId]
          );
          tachesCreees++;
        } catch (e) {
          console.error('injecterTachesLDM: repartition erreur:', e.message);
        }
      }
    }
  }

  return tachesCreees;
}

// ── POST /depuis-devis/:devisId — génération idempotente depuis un devis ──────
router.post('/depuis-devis/:devisId', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const acteurNom = req.user ? `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() : null;
    const { ldm, created } = await ldmService.genererDepuisDevis(
      Number(req.params.devisId),
      req.user?.id,
      acteurNom
    );
    res.status(created ? 201 : 200).json({ id: ldm.id, numero: ldm.numero, statut: ldm.statut, created });
  } catch (e) {
    const status = e.status || 500;
    if (e.extra) return res.status(status).json({ message: e.message, ...e.extra });
    res.status(status).json({ message: e.message || 'Erreur serveur' });
  }
});

// ── GET /depuis-devis/:devisId — LDM liée à un devis (ou 404) ─────────────────
router.get('/depuis-devis/:devisId', verifyToken, async (req, res) => {
  try {
    const [[ldm]] = await pool.query(
      'SELECT id, numero, statut FROM lettres_mission WHERE devis_id = ? LIMIT 1',
      [req.params.devisId]
    );
    if (!ldm) return res.status(404).json({ message: 'Aucune LDM pour ce devis' });
    res.json(ldm);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── GET /evenements/:ldmId — audit trail ─────────────────────────────────────
router.get('/evenements/:ldmId', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM ldm_evenements WHERE ldm_id = ? ORDER BY createdAt ASC`,
      [req.params.ldmId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── GET / ────────────────────────────────────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id } = req.query;
    let where = '1=1';
    const params = [];
    if (client_id) { where += ' AND l.client_id = ?'; params.push(client_id); }
    const [rows] = await pool.query(
      `SELECT l.*, c.nom AS client_nom
       FROM lettres_mission l LEFT JOIN clients c ON l.client_id = c.id
       WHERE ${where}
       ORDER BY l.createdAt DESC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[l]] = await pool.query(
      `SELECT l.*, c.nom AS client_nom, c.siren AS client_siren,
              u.prenom AS collab_prenom, u.nom AS collab_nom,
              cm.prenom AS chef_prenom, cm.nom AS chef_nom, cm.role_metier AS chef_role_metier
       FROM lettres_mission l
       LEFT JOIN clients c ON l.client_id = c.id
       LEFT JOIN utilisateurs u ON l.collaborateur_id = u.id
       LEFT JOIN utilisateurs cm ON l.chef_mission_id = cm.id
       WHERE l.id = ?`, [req.params.id]
    );
    if (!l) return res.status(404).json({ message: 'Lettre introuvable' });
    // Inclure les factures liées
    const [factures] = await pool.query(
      `SELECT id, numero, dateEmission, dateEcheance, totalHT, totalTTC, statut
       FROM factures WHERE notesInternes LIKE ? ORDER BY dateEmission`,
      [`%${l.numero}%`]
    );
    res.json({ ...l, factures });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const {
    client_id, prospect_id,
    typeMission, objetMission, montantHonorairesHT,
    dateDebut, dateFin, repartitionTaches, notesInternes,
    titre,
  } = req.body;
  if (!client_id && !prospect_id) return res.status(400).json({ message: 'Client ou prospect requis' });
  const missionType = typeMission || 'tenue_comptable';
  const sujet = objetMission || titre || null;
  try {
    const numero = await nextNumero();
    const repartition = repartitionTaches
      ? (typeof repartitionTaches === 'string' ? repartitionTaches : JSON.stringify(repartitionTaches))
      : null;
    const [result] = await pool.query(
      `INSERT INTO lettres_mission (numero, client_id, prospect_id, contactId, typeMission, objetMission, montantHonorairesHT, dateDebut, dateFin, repartitionTaches, notesInternes)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [numero, client_id || null, prospect_id || null, missionType, sujet,
       montantHonorairesHT || 0, dateDebut || null, dateFin || null, repartition, notesInternes || null]
    );
    res.status(201).json({ id: result.insertId, numero });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { statut, typeMission, objetMission, montantHonorairesHT, dateDebut, dateFin, client_id,
          signatureClient, dateSignatureClient } = req.body;
  try {
    // Récupérer l'ancien statut
    const [[prev]] = await pool.query('SELECT statut FROM lettres_mission WHERE id=?', [req.params.id]);

    const fields = [], values = [];
    if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }
    if (typeMission !== undefined) { fields.push('typeMission = ?'); values.push(typeMission); }
    if (objetMission !== undefined) { fields.push('objetMission = ?'); values.push(objetMission); }
    if (montantHonorairesHT !== undefined) { fields.push('montantHonorairesHT = ?'); values.push(montantHonorairesHT); }
    if (dateDebut !== undefined) { fields.push('dateDebut = ?'); values.push(dateDebut); }
    if (dateFin !== undefined) { fields.push('dateFin = ?'); values.push(dateFin); }
    if (client_id !== undefined) { fields.push('client_id = ?'); values.push(client_id); }
    if (signatureClient !== undefined) { fields.push('signatureClient = ?'); values.push(signatureClient); }
    if (dateSignatureClient !== undefined) { fields.push('dateSignatureClient = ?'); values.push(dateSignatureClient); }

    if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE lettres_mission SET ${fields.join(', ')} WHERE id = ?`, values);

    // Notify all expert/chef users when LDM is signed
    if (statut === 'signee' && prev?.statut !== 'signee') {
      try {
        const [[ldmForNotif]] = await pool.query(
          `SELECT numero FROM lettres_mission WHERE id = ?`, [req.params.id]
        );
        if (ldmForNotif) {
          const [experts] = await pool.query(
            `SELECT id FROM utilisateurs WHERE role IN ('expert', 'chef_mission')`
          );
          for (const u of experts) {
            await pool.query(
              `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
               VALUES (?, 'ldm_signee', ?, ?, '/lettres-mission', 0)`,
              [u.id, `LDM signée : ${ldmForNotif.numero}`, `La lettre de mission ${ldmForNotif.numero} vient d'être signée.`]
            );
          }
        }
      } catch (e) {
        console.error('Notification LDM signée error:', e.message);
      }
    }

    // Auto-workflow quand passage à 'signee'
    let factureIds = [];
    let missionIds = [];
    if (statut === 'signee' && prev?.statut !== 'signee') {
      factureIds = await genererFacturesDepuisLDM(req.params.id).catch(e => {
        console.error('Auto-billing error:', e.message);
        return [];
      });

      try {
        const [[ldm]] = await pool.query('SELECT * FROM lettres_mission WHERE id = ?', [req.params.id]);
        if (ldm) {
          const missionCategorie = {
            tenue_comptable: 'tenue_comptable', revision: 'revision',
            etablissement_comptes: 'etablissement_comptes', fiscal: 'fiscal',
            social_paie: 'social', conseil: 'conseil', juridique: 'juridique', autre: 'autre'
          }[ldm.typeMission] || 'autre';

          const [mr] = await pool.query(
            `INSERT INTO missions (contactId, client_id, nom, categorie, statut, honorairesBudgetes, tempsBudgeteH, dateDebut, dateFin, notes)
             VALUES (?, ?, ?, ?, 'en_cours', ?, 0, ?, ?, ?)`,
            [ldm.contactId || 0, ldm.client_id,
             `${ldm.typeMission} — LM ${ldm.numero}`,
             missionCategorie, ldm.montantHonorairesHT || 0,
             ldm.dateDebut || null, ldm.dateFin || null, ldm.objetMission || null]
          );
          missionIds.push(mr.insertId);
          await pool.query('UPDATE lettres_mission SET missionId = ? WHERE id = ?', [mr.insertId, req.params.id]);

          if (ldm.client_id) {
            const [[expert]] = await pool.query(`SELECT id FROM utilisateurs WHERE role = 'expert' LIMIT 1`);
            if (expert) {
              await pool.query(
                `INSERT INTO taches (client_id, utilisateur_id, description, duree, date_echeance, statut, priorite, mission_id, origine)
                 VALUES (?, ?, ?, 1, DATE_ADD(NOW(), INTERVAL 7 DAY), 'a_faire', 'normale', ?, 'ldm')`,
                [ldm.client_id, expert.id, `Démarrage mission : ${ldm.typeMission}`, mr.insertId]
              );
            }
          }
        }
      } catch (e) {
        console.error('Auto-mission error:', e.message);
      }
    }

    res.json({ message: 'Lettre mise à jour', factureIds, missionIds });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// ── POST /api/lettres-mission/:id/envoyer — expert uniquement ────────────────
router.post('/:id/envoyer', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const path2 = require('path');
    const fs2   = require('fs/promises');

    const [[ldm]] = await pool.query(
      `SELECT l.*,
              COALESCE(c.email_dirigeant, c.portal_email) AS client_email,
              c.nom AS client_nom,
              COALESCE(p.contact_email, p.email) AS prospect_email,
              p.nom AS prospect_nom,
              COALESCE(c.nom, p.nom) AS display_nom,
              u.prenom AS collab_prenom, u.nom AS collab_nom, u.email AS collab_email
       FROM lettres_mission l
       LEFT JOIN clients c ON l.client_id = c.id
       LEFT JOIN prospects p ON l.prospect_id = p.id
       LEFT JOIN utilisateurs u ON l.collaborateur_id = u.id
       WHERE l.id = ?`,
      [req.params.id]
    );
    if (!ldm) return res.status(404).json({ message: 'LDM introuvable' });

    // ── Check email before touching status ──────────────────────────────────
    const destinataire = req.body.emailOverride || ldm.client_email || ldm.prospect_email;
    if (!destinataire) {
      return res.json({ missingEmail: true, nomContact: ldm.display_nom || '' });
    }

    await ldmService.transitionner(
      Number(req.params.id), 'envoyer', req.user?.role,
      req.user?.id, `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim(),
      { emailOverride: destinataire }
    );

    // Advance pipeline
    if (ldm.client_id) {
      pool.query(
        `UPDATE opportunites SET statut = 'devis_envoye', probabilite = 70, updatedAt = NOW()
         WHERE client_id = ? AND statut NOT IN ('gagne','perdu')`,
        [ldm.client_id]
      ).catch(() => {});
    }
    if (ldm.devis_id) {
      pool.query(
        `UPDATE opportunites SET statut = 'devis_envoye', probabilite = 70, updatedAt = NOW()
         WHERE devis_id = ? AND statut NOT IN ('gagne','perdu')`,
        [ldm.devis_id]
      ).catch(() => {});
    }

    // ── Generate PDF if not already done ────────────────────────────────────
    try {
      let pdfBuffer;
      if (ldm.pdf_path) {
        pdfBuffer = await fs2.readFile(ldm.pdf_path);
      } else {
        // Rebuild payload (same as generer-pdf route)
        let missions = [];
        if (ldm.devis_id) {
          const [lignes] = await pool.query(
            'SELECT * FROM lignes_devis WHERE devisId = ? AND actif = 1 ORDER BY ordre', [ldm.devis_id]
          );
          const aggr = {};
          for (const l of lignes) {
            const key = l.section || l.rubrique || 'Autre';
            if (!aggr[key]) aggr[key] = { libelle: l.rubrique || key, type: key, total: 0 };
            aggr[key].total += parseFloat(l.tarif_ht || l.totalHT || 0);
          }
          const ORDER = ['Comptabilité', 'Fiscalité', 'Social', 'Juridique', 'Conseil'];
          missions = [...ORDER.filter(k => aggr[k]), ...Object.keys(aggr).filter(k => !ORDER.includes(k))]
            .filter(k => aggr[k] && aggr[k].total > 0)
            .map(k => ({ libelle: aggr[k].libelle, type: aggr[k].type, periodicite: 'Mensuel', montant_annuel_ht: Math.round(aggr[k].total * 100) / 100 }));
        }
        const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
        const cabinet = cab || {};
        const ht = parseFloat(ldm.montantHonorairesHT || ldm.montant_annuel_ht || 0);
        const payload = {
          numero: ldm.numero,
          date_prise_effet: ldm.dateDebut ? new Date(ldm.dateDebut).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          honoraires_ht_annuel: ht,
          honoraires_ht_brut: parseFloat(ldm.devis_ht_brut || ht),
          remise_pct: parseFloat(ldm.devis_remise || 0),
          duree_preavis: ldm.dureePreavis || 3,
          modalites_paiement: 'Mensuellement par prélèvement automatique SEPA.',
          missions,
          client: {
            raison_sociale: ldm.display_nom || '',
            siren: '',
            adresse: '',
            cp_ville: '',
            interlocuteur: '',
            email: destinataire,
          },
          cabinet: {
            nomCabinet: cabinet.nomCabinet || 'ParFi France',
            adresse: cabinet.adresse || '5 Place Langrand',
            codePostal: cabinet.codePostal || '54400',
            ville: cabinet.ville || 'Longwy',
            telephone: cabinet.telephone || '',
            email: cabinet.email || 'thierry.alcaraz@parfi-france.fr',
            siteWeb: cabinet.siteWeb || 'www.parfi-france.fr',
          },
          signataire: {
            nom_complet: ldm.collab_prenom ? `${ldm.collab_prenom} ${ldm.collab_nom}`.trim() : 'ParFi France',
            fonction: 'Expert-Comptable',
            email: ldm.collab_email || cabinet.email || 'thierry.alcaraz@parfi-france.fr',
          },
        };
        const SCRIPT = path2.join(__dirname, '..', 'python', 'generate_ldm_module.py');
        pdfBuffer = await new Promise((resolve, reject) => {
          const py = spawn('python3', [SCRIPT]);
          const chunks = [], errChunks = [];
          py.stdout.on('data', c => chunks.push(c));
          py.stderr.on('data', c => errChunks.push(c));
          py.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(Buffer.concat(errChunks).toString())));
          py.on('error', err => reject(err));
          py.stdin.write(JSON.stringify(payload));
          py.stdin.end();
        });
        const PDF_DIR = path2.join(__dirname, '..', '..', 'uploads', 'ldm');
        await fs2.mkdir(PDF_DIR, { recursive: true });
        const filename = `${ldm.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
        const filepath = path2.join(PDF_DIR, filename);
        await fs2.writeFile(filepath, pdfBuffer);
        await pool.query('UPDATE lettres_mission SET pdf_path = ? WHERE id = ?', [filepath, ldm.id]);
      }

      const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
      const cabinet = cab || {};
      const nomClient = ldm.display_nom || destinataire;
      const ht = parseFloat(ldm.montantHonorairesHT || ldm.montant_annuel_ht || 0);
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
    <p>Veuillez trouver ci-joint votre <strong>lettre de mission n° ${ldm.numero}</strong> établie à l'attention de <strong>${nomClient}</strong>.</p>
    <div style="background:#f0f4f9;border-left:4px solid #1a3a5c;padding:16px;border-radius:4px;margin:20px 0;">
      <p style="margin:0;font-size:13px;color:#555;">Récapitulatif honoraires :</p>
      <p style="margin:6px 0 0;font-size:16px;font-weight:bold;color:#1a3a5c;">${ht.toFixed(2).replace('.', ',')} € HT / an  ·  ${mensuel} € HT / mois</p>
      <p style="margin:4px 0 0;font-size:13px;color:#888;">Total TTC : ${ttc} €</p>
    </div>
    <p>Merci de bien vouloir nous retourner ce document signé afin de valider notre collaboration.</p>
    <p>Nous restons à votre disposition pour toute question.</p>
    <p style="margin-top:28px;">Cordialement,<br>
    <strong>${ldm.collab_prenom || 'ParFi France'} ${ldm.collab_nom || ''}</strong><br>
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
        subject:     `Lettre de mission ${ldm.numero} — ParFi France`,
        htmlContent,
        attachments: [{ base64: pdfBuffer.toString('base64'), filename: `${ldm.numero}.pdf` }],
      });

      return res.json({ message: 'LDM envoyée par email pour signature', statut: 'envoyee', email: destinataire });
    } catch (emailErr) {
      console.error('[envoyer LDM] email error:', emailErr.message);
      return res.json({
        message: `Statut mis à jour mais envoi email échoué : ${emailErr.message}`,
        statut: 'envoyee',
        emailError: emailErr.message,
      });
    }
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── POST /api/lettres-mission/:id/signer — signature + injection tâches ──────
router.post('/:id/signer', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const { collaborateur_id, chef_mission_id } = req.body;

    if (!collaborateur_id) return res.status(400).json({ message: 'Le collaborateur est obligatoire' });
    if (!chef_mission_id) return res.status(400).json({ message: 'Le chef de mission / chef de groupe est obligatoire' });

    const [[ldm]] = await pool.query(
      `SELECT l.*, c.nom AS client_nom
       FROM lettres_mission l LEFT JOIN clients c ON l.client_id = c.id
       WHERE l.id = ?`, [req.params.id]
    );
    if (!ldm) return res.status(404).json({ message: 'LDM introuvable' });

    // Valider les deux utilisateurs
    const [[collab]] = await pool.query(`SELECT id FROM utilisateurs WHERE id = ? AND actif = 1`, [collaborateur_id]).catch(() => [[null]]);
    if (!collab) return res.status(400).json({ message: 'Collaborateur introuvable' });
    const [[chef]] = await pool.query(`SELECT id FROM utilisateurs WHERE id = ? AND actif = 1`, [chef_mission_id]).catch(() => [[null]]);
    if (!chef) return res.status(400).json({ message: 'Chef de mission introuvable' });

    await pool.query(
      `UPDATE lettres_mission SET intervenantId = ?, collaborateur_id = ?, chef_mission_id = ? WHERE id = ?`,
      [collaborateur_id, collaborateur_id, chef_mission_id, req.params.id]
    );

    const acteurNomSigner = `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim();

    // Signature directe : si la LDM n'est pas encore en "envoyee", on force les transitions
    // intermédiaires en une seule opération (petits cabinets sans workflow de validation long)
    const etapesAvant = ['brouillon', 'a_valider', 'validee_interne'];
    if (etapesAvant.includes(ldm.statut)) {
      await pool.query(
        `UPDATE lettres_mission SET statut = 'envoyee', updatedAt = NOW() WHERE id = ?`,
        [req.params.id]
      );
      await ldmService.logEvenement(
        Number(req.params.id), 'envoi_client', req.user?.id, acteurNomSigner,
        ldm.statut, 'envoyee',
        'Signature directe — validation interne passée automatiquement', null
      );
    }

    // State machine: envoyee → signee → active (auto-activation incluse)
    await ldmService.transitionner(
      Number(req.params.id), 'signer', req.user?.role,
      req.user?.id, acteurNomSigner, { skipUrlCheck: true }
    );

    // Promote prospect to client
    if (ldm.client_id) {
      await pool.query(
        `UPDATE clients SET statut = 'client' WHERE id = ? AND statut = 'prospect'`,
        [ldm.client_id]
      ).catch(() => {});
    }

    // Update pipeline: mark opportunity as won
    if (ldm.client_id) {
      await pool.query(
        `UPDATE opportunites SET statut = 'gagne', probabilite = 100, updatedAt = NOW()
         WHERE client_id = ? AND statut NOT IN ('gagne','perdu')`,
        [ldm.client_id]
      ).catch(() => {});
    }
    // Also via devis chain
    if (ldm.devis_id) {
      const [[devisRow]] = await pool.query('SELECT opportunite_id FROM devis WHERE id = ?', [ldm.devis_id]).catch(() => [[null]]);
      if (devisRow?.opportunite_id) {
        await pool.query(
          `UPDATE opportunites SET statut = 'gagne', probabilite = 100, updatedAt = NOW() WHERE id = ?`,
          [devisRow.opportunite_id]
        ).catch(() => {});
      }
    }

    // Create plan_facturation entry
    const montantMensuel = Math.round((ldm.montantHonorairesHT || 0) / 12 * 100) / 100;
    await pool.query(
      `INSERT INTO plan_facturation (lettreMissionId, client_id, frequence, montantHT, tauxTVA, dateDebut, statut)
       VALUES (?, ?, 'mensuel', ?, 20, CURDATE(), 'actif')`,
      [req.params.id, ldm.client_id || null, montantMensuel]
    ).catch((e) => { console.error('plan_facturation insert error:', e.message); });

    const tachesCreees = await injecterTachesLDM(req.params.id, collaborateur_id, chef_mission_id, req.user.id);

    // Calcul et stockage du budget par profil (depuis dimensionnement)
    await stockerBudgetParProfil(Number(req.params.id), ldm.dimensionnement_id);

    // ── Créer les mandats standard ────────────────────────────────────────────
    const mandatTypes = [
      { type: 'prelevement', libelle: 'Mandat de prélèvement bancaire' },
      { type: 'impots',      libelle: 'Mandat fiscal (impôts)' },
      { type: 'urssaf',      libelle: 'Mandat organismes sociaux (URSSAF)' },
    ];
    for (const m of mandatTypes) {
      const [[exists]] = await pool.query(
        `SELECT id FROM mandats WHERE ldm_id = ? AND type = ?`, [req.params.id, m.type]
      ).catch(() => [[null]]);
      if (!exists) {
        await pool.query(
          `INSERT INTO mandats (ldm_id, type, libelle, signe) VALUES (?,?,?,0)`,
          [req.params.id, m.type, m.libelle]
        ).catch(() => {});
      }
    }

    // ── Notifications ─────────────────────────────────────────────────────────
    const [experts] = await pool.query(`SELECT id FROM utilisateurs WHERE role IN ('expert','chef_mission')`).catch(() => [[]]);
    for (const u of experts) {
      await pool.query(
        `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue) VALUES (?,?,?,?,?,0)`,
        [u.id, 'ldm_signee', `LDM signée : ${ldm.numero}`,
         `La lettre de mission ${ldm.numero} vient d'être signée. ${tachesCreees} tâche(s) injectée(s).`,
         `/lettres-mission/${req.params.id}`]
      ).catch(() => {});
    }
    // Notifier le collaborateur affecté
    if (collaborateur_id) {
      await pool.query(
        `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue) VALUES (?,?,?,?,?,0)`,
        [collaborateur_id, 'ldm_affectee', `Dossier affecté : ${ldm.client_nom}`,
         `${tachesCreees} tâche(s) planifiées sur votre planning suite à la signature de la LDM ${ldm.numero}.`,
         `/taches`]
      ).catch(() => {});
    }
    // Notifier le chef de mission
    if (chef_mission_id && Number(chef_mission_id) !== Number(collaborateur_id)) {
      await pool.query(
        `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue) VALUES (?,?,?,?,?,0)`,
        [chef_mission_id, 'ldm_signee', `Dossier supervisé : ${ldm.client_nom}`,
         `Vous avez été désigné chef de mission sur la LDM ${ldm.numero}. ${tachesCreees} tâche(s) planifiées.`,
         `/lettres-mission/${req.params.id}`]
      ).catch(() => {});
    }

    // ── Sauvegarde automatique dans la GED ───────────────────────────────────────
    let documentId = null;
    try {
      documentId = await genererEtSauvegarderPdfLDM(Number(req.params.id), req.user.id);
    } catch (pdfErr) {
      console.error('LDM PDF/GED error (non-bloquant):', pdfErr.message);
    }

    res.json({ ok: true, statut: 'active', tachesCreees, ldmId: Number(req.params.id), documentId });
  } catch (err) {
    console.error('LDM signer error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/lettres-mission/:id/injecter-taches — re-injection pour LDM déjà signée ──
router.post('/:id/injecter-taches', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const { collaborateur_id, chef_mission_id } = req.body;
    const [[ldm]] = await pool.query('SELECT id, statut, numero, client_id FROM lettres_mission WHERE id = ?', [req.params.id]);
    if (!ldm) return res.status(404).json({ message: 'LDM introuvable' });

    const updateFields = [];
    const updateVals = [];
    if (collaborateur_id) {
      updateFields.push('intervenantId = ?', 'collaborateur_id = ?');
      updateVals.push(collaborateur_id, collaborateur_id);
    }
    if (chef_mission_id) {
      updateFields.push('chef_mission_id = ?');
      updateVals.push(chef_mission_id);
    }
    if (updateFields.length) {
      updateVals.push(req.params.id);
      await pool.query(`UPDATE lettres_mission SET ${updateFields.join(', ')} WHERE id = ?`, updateVals);
    }

    const tachesCreees = await injecterTachesLDM(req.params.id, collaborateur_id || null, chef_mission_id || null, req.user.id);

    if (collaborateur_id && tachesCreees > 0) {
      await pool.query(
        `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue) VALUES (?,?,?,?,?,0)`,
        [collaborateur_id, 'ldm_affectee',
         `Dossier affecté`,
         `${tachesCreees} tâche(s) planifiées sur votre planning (LDM ${ldm.numero}).`,
         `/taches`]
      ).catch(() => {});
    }
    if (chef_mission_id && Number(chef_mission_id) !== Number(collaborateur_id)) {
      await pool.query(
        `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue) VALUES (?,?,?,?,?,0)`,
        [chef_mission_id, 'ldm_signee', `Dossier supervisé`,
         `Vous supervisez la LDM ${ldm.numero}. ${tachesCreees} tâche(s) planifiées.`,
         `/lettres-mission/${req.params.id}`]
      ).catch(() => {});
    }

    res.json({ ok: true, tachesCreees });
  } catch (err) {
    console.error('injecter-taches error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/lettres-mission/:id/budget-intervenants ─────────────────────────
// Budget par profil + temps consommé + honoraires. Exclu : social, juridique.
router.get('/:id/budget-intervenants', verifyToken, async (req, res) => {
  try {
    const [[ldm]] = await pool.query(
      `SELECT id, numero, statut, client_id,
              COALESCE(montant_annuel_ht, montantHonorairesHT, 0) AS budget_honoraires,
              COALESCE(budget_minutes_collab,0) AS budget_minutes_collab,
              COALESCE(budget_minutes_chef,0)   AS budget_minutes_chef,
              COALESCE(budget_minutes_expert,0) AS budget_minutes_expert,
              modaliteFacturation, dateDebut, dateFin, dimensionnement_id,
              collaborateur_id, chef_mission_id, intervenantId
       FROM lettres_mission WHERE id = ?`,
      [req.params.id]
    );
    if (!ldm) return res.status(404).json({ message: 'LDM introuvable' });

    // Temps consommé par profil depuis tache_temps (excl. social/juridique, excl. rejeté)
    const [consomme] = await pool.query(`
      SELECT
        CASE
          WHEN u.role_metier = 'expert_comptable'                      THEN 'expert'
          WHEN u.role_metier IN ('chef_de_groupe','chef_de_mission')   THEN 'chef'
          ELSE 'collab'
        END AS profil,
        SUM(tt.duree_minutes) AS minutes
      FROM tache_temps tt
      JOIN taches t ON t.id = tt.tache_id
      JOIN utilisateurs u ON u.id = tt.utilisateur_id
      WHERE t.client_id = ?
        AND tt.statut NOT IN ('rejetee')
        AND u.role_metier NOT IN ('collaborateur_social','juriste','collaborateur_juridique')
        AND (
          t.dimensionnement_ligne_id IS NULL
          OR t.dimensionnement_ligne_id NOT IN (
            SELECT id FROM dimensionnement_lignes
            WHERE intervenant IN ('Collaborateur Social','Collaborateur Juridique')
          )
        )
      GROUP BY profil
    `, [ldm.client_id]);

    const map = { collab: 0, chef: 0, expert: 0 };
    for (const r of consomme) if (r.profil in map) map[r.profil] = parseInt(r.minutes) || 0;

    // Honoraires facturés (année en cours + total)
    const [[honFac]] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN YEAR(f.dateEmission) = YEAR(CURDATE()) THEN f.totalHT ELSE 0 END), 0) AS ytd,
        COALESCE(SUM(f.totalHT), 0) AS total
      FROM factures f
      WHERE f.client_id = ? AND f.statut NOT IN ('annulee','brouillon')
    `, [ldm.client_id]).catch(() => [[{ ytd: 0, total: 0 }]]);

    const [[param]] = await pool.query(
      `SELECT COALESCE(seuil_depassement_budget, 20) AS seuil FROM parametres_cabinet LIMIT 1`
    ).catch(() => [[{ seuil: 20 }]]);

    // Détail par collaborateur (pour tooltip)
    const [detail] = await pool.query(`
      SELECT u.prenom, u.nom, u.role_metier,
        SUM(tt.duree_minutes) AS minutes_total
      FROM tache_temps tt
      JOIN taches t ON t.id = tt.tache_id
      JOIN utilisateurs u ON u.id = tt.utilisateur_id
      WHERE t.client_id = ?
        AND tt.statut NOT IN ('rejetee')
        AND u.role_metier NOT IN ('collaborateur_social','juriste','collaborateur_juridique')
      GROUP BY u.id, u.prenom, u.nom, u.role_metier
      ORDER BY minutes_total DESC
    `, [ldm.client_id]).catch(() => [[]]);

    res.json({
      ldm,
      consomme: map,
      detail,
      honoraires: {
        budget:      parseFloat(ldm.budget_honoraires),
        facture_ytd: parseFloat(honFac.ytd),
        facture_total: parseFloat(honFac.total),
      },
      seuil_alerte: parseInt(param.seuil),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── GET /api/lettres-mission/:id/mandats ──────────────────────────────────────
router.get('/:id/mandats', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM mandats WHERE ldm_id = ? ORDER BY id`, [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PUT /api/lettres-mission/:id/mandats/:mid — signer un mandat ──────────────
router.put('/:id/mandats/:mid', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const { signe, date_signature } = req.body;
    await pool.query(
      `UPDATE mandats SET signe = ?, date_signature = ? WHERE id = ? AND ldm_id = ?`,
      [signe ? 1 : 0, date_signature || null, req.params.mid, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /:id/generer-echeancier — génère les factures depuis le plan de facturation ──
router.post('/:id/generer-echeancier', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[ldm]] = await pool.query('SELECT id, statut, numero FROM lettres_mission WHERE id = ?', [req.params.id]);
    if (!ldm) return res.status(404).json({ message: 'LDM introuvable' });
    if (ldm.statut !== 'signee') return res.status(400).json({ message: 'La LDM doit être signée pour générer un échéancier' });

    const factureIds = await genererFacturesDepuisLDM(req.params.id);
    res.json({ message: `${factureIds.length} facture(s) générée(s)`, factureIds, ldmNumero: ldm.numero });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── POST /:id/resilier — machine à états (expert uniquement) ─────────────────
router.post('/:id/resilier', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    const { motif, dateResiliation, commentaire } = req.body;
    const acteurNom = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();
    const ldm = await ldmService.transitionner(
      Number(req.params.id), 'resilier', req.user.role,
      req.user.id, acteurNom,
      { motif, dateResiliation, commentaire }
    );
    res.json({ message: 'LDM résiliée', statut: ldm.statut });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

// ── POST /:id/annuler — annulation + déverrouillage devis ─────────────────────
router.post('/:id/annuler', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    const acteurNom = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();
    const ldm = await ldmService.transitionner(
      Number(req.params.id), 'annuler', req.user.role,
      req.user.id, acteurNom,
      { commentaire: req.body.commentaire }
    );
    res.json({ message: 'LDM annulée — devis déverrouillé', statut: ldm.statut });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

// ── POST /:id/activer — activation manuelle si besoin ────────────────────────
router.post('/:id/activer', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    const acteurNom = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();
    const ldm = await ldmService.transitionner(
      Number(req.params.id), 'activer', req.user.role,
      req.user.id, acteurNom, {}
    );
    res.json({ message: 'LDM activée', statut: ldm.statut });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

// ── POST /:id/soumettre — brouillon → a_valider ──────────────────────────────
router.post('/:id/soumettre', verifyToken, async (req, res) => {
  try {
    const acteurNom = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();
    const ldm = await ldmService.transitionner(
      Number(req.params.id), 'soumettre', req.user.role,
      req.user.id, acteurNom, {}
    );
    res.json({ message: 'LDM soumise pour validation', statut: ldm.statut });
  } catch (e) {
    const extra = e.extra || {};
    res.status(e.status || 500).json({ message: e.message, ...extra });
  }
});

// ── POST /:id/valider-interne — a_valider → validee_interne (expert) ──────────
router.post('/:id/valider-interne', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    const acteurNom = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();
    const ldm = await ldmService.transitionner(
      Number(req.params.id), 'valider_interne', req.user.role,
      req.user.id, acteurNom, {}
    );
    res.json({ message: 'LDM validée en interne', statut: ldm.statut });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

// ── POST /:id/rollback — retour à brouillon ───────────────────────────────────
router.post('/:id/rollback', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const acteurNom = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();
    const ldm = await ldmService.transitionner(
      Number(req.params.id), 'rollback', req.user.role,
      req.user.id, acteurNom,
      { commentaire: req.body.commentaire }
    );
    res.json({ message: 'LDM renvoyée en brouillon', statut: ldm.statut });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

// ── PUT /:id/recueil-besoin ────────────────────────────────────────────────────
router.put('/:id/recueil-besoin', verifyToken, async (req, res) => {
  try {
    const acteurNom = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();
    const ldm = await ldmService.mettreAJourRecueilBesoin(
      Number(req.params.id), req.user.role, req.user.id, acteurNom, req.body
    );
    res.json({ message: 'Recueil du besoin mis à jour', recueil_besoin_json: ldm.recueil_besoin_json });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

// ── PUT /:id/tableau-repartition ──────────────────────────────────────────────
router.put('/:id/tableau-repartition', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const { lignes } = req.body;
    if (!Array.isArray(lignes)) return res.status(400).json({ message: '`lignes` doit être un tableau' });
    const acteurNom = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();
    const ldm = await ldmService.mettreAJourTableauRepartition(
      Number(req.params.id), req.user.role, req.user.id, acteurNom, lignes
    );
    res.json({ message: 'Tableau de répartition mis à jour', tableau_repartition_json: ldm.tableau_repartition_json });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

// ── GET /:id/missions ─────────────────────────────────────────────────────────
router.get('/:id/missions', verifyToken, async (req, res) => {
  try {
    const [[ldm]] = await pool.query('SELECT id FROM lettres_mission WHERE id = ?', [req.params.id]);
    if (!ldm) return res.status(404).json({ message: 'LDM introuvable' });
    const [rows] = await pool.query(
      `SELECT * FROM ldm_missions WHERE lettre_mission_id = ? ORDER BY ordre, id`,
      [req.params.id]
    );
    const missions = rows.map(r => ({
      ...r,
      nombre_heures_par_profil: typeof r.nombre_heures_par_profil === 'string'
        ? JSON.parse(r.nombre_heures_par_profil) : (r.nombre_heures_par_profil || {}),
      taux_par_profil: typeof r.taux_par_profil === 'string'
        ? JSON.parse(r.taux_par_profil) : (r.taux_par_profil || {}),
    }));
    res.json(missions);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── POST /:id/dupliquer — crée un nouveau devis brouillon depuis cette LDM ────
router.post('/:id/dupliquer', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[ldm]] = await pool.query('SELECT * FROM lettres_mission WHERE id = ?', [req.params.id]);
    if (!ldm) return res.status(404).json({ message: 'LDM introuvable' });

    // Find source devis
    const [[srcDevis]] = ldm.devis_id
      ? await pool.query('SELECT * FROM devis WHERE id = ?', [ldm.devis_id])
      : [[null]];

    const numero = await nextDevisNumero();

    if (srcDevis) {
      // Duplicate from existing devis
      const [result] = await pool.query(
        `INSERT INTO devis
           (numero, client_id, prospect_id, contactId,
            titre, totalHT, tauxTVA, totalTVA, totalTTC, total_ht_net,
            notesInternes, cree_par, statut,
            type_entite, regime_fiscal, regime_tva, nb_etablissements,
            factures_achat, factures_vente, lignes_banque, immobilisations, effectif,
            remise_pct, duplique_de)
         VALUES (?,?,?,0,?,?,?,?,?,?,?,?,'brouillon',?,?,?,?,?,?,?,?,?,?,?)`,
        [
          numero, srcDevis.client_id, srcDevis.prospect_id,
          `Renouvellement - ${srcDevis.titre || ldm.numero}`,
          srcDevis.totalHT, srcDevis.tauxTVA, srcDevis.totalTVA, srcDevis.totalTTC, srcDevis.total_ht_net,
          srcDevis.notesInternes, req.user.id,
          srcDevis.type_entite, srcDevis.regime_fiscal, srcDevis.regime_tva, srcDevis.nb_etablissements,
          srcDevis.factures_achat, srcDevis.factures_vente, srcDevis.lignes_banque, srcDevis.immobilisations, srcDevis.effectif,
          srcDevis.remise_pct, srcDevis.id,
        ]
      );
      const newId = result.insertId;
      const [lignes] = await pool.query('SELECT * FROM lignes_devis WHERE devisId = ? ORDER BY ordre', [srcDevis.id]);
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
      res.status(201).json({ id: newId, numero, message: 'Devis dupliqué depuis LDM' });
    } else {
      // Create minimal devis from LDM data
      const montant = parseFloat(ldm.montantHonorairesHT || 0);
      const tva = Math.round(montant * 0.2 * 100) / 100;
      const ttc = Math.round((montant + tva) * 100) / 100;
      const [result] = await pool.query(
        `INSERT INTO devis
           (numero, client_id, contactId, titre, totalHT, tauxTVA, totalTVA, totalTTC, total_ht_net,
            cree_par, statut, duplique_de)
         VALUES (?,?,0,?,?,20,?,?,?,?,'brouillon',?)`,
        [numero, ldm.client_id, `Renouvellement - ${ldm.numero}`, montant, tva, ttc, montant, req.user.id, null]
      );
      res.status(201).json({ id: result.insertId, numero, message: 'Devis créé depuis LDM' });
    }
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── GET /:id/html ─────────────────────────────────────────────────────────────
router.get('/:id/html', verifyToken, async (req, res) => {
  try {
    const [[ldm]] = await pool.query(
      `SELECT l.*, c.nom AS client_nom, c.siren AS client_siren
       FROM lettres_mission l LEFT JOIN clients c ON l.client_id = c.id
       WHERE l.id = ?`, [req.params.id]
    );
    if (!ldm) return res.status(404).json({ message: 'LDM introuvable' });

    // Get lignes: from linked devis, or from dimensionnement if no devis
    let lignes = [];
    if (ldm.devis_id) {
      const [rows] = await pool.query(
        'SELECT *, libelle AS description, section AS rubrique FROM lignes_devis WHERE devisId = ? ORDER BY ordre',
        [ldm.devis_id]
      );
      lignes = rows;
    } else if (ldm.dimensionnement_id) {
      const [rows] = await pool.query(
        'SELECT *, libelle AS description, section AS rubrique FROM dimensionnement_lignes WHERE dimensionnement_id = ? AND actif = 1 ORDER BY id',
        [ldm.dimensionnement_id]
      );
      lignes = rows;
    }
    const grouped = groupByRubrique(lignes);

    // Get mandats
    const [mandats] = await pool.query(
      'SELECT * FROM mandats WHERE ldm_id = ? ORDER BY id', [req.params.id]
    ).catch(() => [[]]);

    // Cabinet info
    const [[cabinet]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);

    const html = generateLDMHTML(ldm, grouped, mandats, cabinet || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query('DELETE FROM lettres_mission WHERE id = ?', [req.params.id]);
    res.json({ message: 'Lettre supprimée' });
  } catch { res.status(500).json({ message: 'Erreur serveur' }); }
});

// ── POST /:id/generer-pdf  — génère le PDF OEC et le sauvegarde ───────────────

router.post('/:id/generer-pdf', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const path2 = require('path');
    const fs2   = require('fs/promises');

    const [[ldm]] = await pool.query(
      `SELECT l.*,
              c.nom AS client_nom, c.siren AS client_siren,
              c.adresse AS client_adresse, c.code_postal AS client_cp, c.ville AS client_ville,
              COALESCE(c.email_dirigeant, c.portal_email) AS client_email,
              c.forme_juridique AS client_forme,
              p.nom AS prospect_nom, p.siren AS prospect_siren,
              p.adresse AS prospect_adresse, p.code_postal AS prospect_cp, p.ville AS prospect_ville,
              COALESCE(p.contact_email, p.email) AS prospect_email,
              p.contact_prenom, p.contact_nom, p.forme_juridique AS prospect_forme,
              COALESCE(c.nom, p.nom) AS display_nom,
              COALESCE(c.siren, p.siren) AS display_siren,
              u.prenom AS collab_prenom, u.nom AS collab_nom, u.email AS collab_email,
              d.total_ht_net AS devis_ht_net, d.totalHT AS devis_ht_brut,
              d.remise_pct AS devis_remise, d.notesInternes AS devis_notes,
              d.notesClient AS devis_modalites
       FROM lettres_mission l
       LEFT JOIN clients c ON l.client_id = c.id
       LEFT JOIN prospects p ON l.prospect_id = p.id
       LEFT JOIN utilisateurs u ON l.collaborateur_id = u.id
       LEFT JOIN devis d ON l.devis_id = d.id
       WHERE l.id = ?`,
      [req.params.id]
    );
    if (!ldm) return res.status(404).json({ message: 'LDM introuvable' });

    // Get devis lines for missions
    let missions = [];
    if (ldm.devis_id) {
      const [lignes] = await pool.query(
        'SELECT * FROM lignes_devis WHERE devisId = ? AND actif = 1 ORDER BY ordre', [ldm.devis_id]
      );
      // Aggregate by section (same logic as devis PDF)
      const aggr = {};
      for (const l of lignes) {
        const key = l.section || l.rubrique || 'Autre';
        if (!aggr[key]) aggr[key] = { libelle: l.rubrique || key, type: key, total: 0 };
        aggr[key].total += parseFloat(l.tarif_ht || l.totalHT || 0);
      }
      const ORDER = ['Comptabilité', 'Fiscalité', 'Social', 'Juridique', 'Conseil'];
      missions = [...ORDER.filter(k => aggr[k]), ...Object.keys(aggr).filter(k => !ORDER.includes(k))]
        .filter(k => aggr[k] && aggr[k].total > 0)
        .map(k => ({
          libelle:           aggr[k].libelle,
          type:              aggr[k].type,
          periodicite:       'Mensuel',
          montant_annuel_ht: Math.round(aggr[k].total * 100) / 100,
        }));
    }

    const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
    const cabinet = cab || {};

    const ht     = parseFloat(ldm.montantHonorairesHT || ldm.montant_annuel_ht || 0);
    const htBrut = parseFloat(ldm.devis_ht_brut || ht);
    const remise = parseFloat(ldm.devis_remise || 0);

    const rawForme = ldm.client_id
      ? (ldm.client_forme || '')
      : (ldm.prospect_forme || '');

    const payload = {
      numero:               ldm.numero,
      date_prise_effet:     ldm.dateDebut
        ? new Date(ldm.dateDebut).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      honoraires_ht_annuel: ht,
      honoraires_ht_brut:   htBrut,
      remise_pct:           remise,
      duree_preavis:        ldm.dureePreavis || 3,
      modalites_paiement:   ldm.devis_modalites || 'Mensuellement par prélèvement automatique SEPA.',
      objet_mission:        ldm.objetMission || '',
      missions,
      client: {
        raison_sociale: ldm.display_nom || '',
        forme:          rawForme,
        siren:          ldm.display_siren || '',
        adresse:        ldm.client_id ? (ldm.client_adresse || '') : (ldm.prospect_adresse || ''),
        cp_ville:       ldm.client_id
          ? [ldm.client_cp, ldm.client_ville].filter(Boolean).join(' ')
          : [ldm.prospect_cp, ldm.prospect_ville].filter(Boolean).join(' '),
        interlocuteur:  ldm.contact_prenom || ldm.contact_nom
          ? `${ldm.contact_prenom || ''} ${ldm.contact_nom || ''}`.trim()
          : '',
        email:          ldm.client_email || ldm.prospect_email || '',
      },
      cabinet: {
        nomCabinet:   cabinet.nomCabinet  || 'ParFi France',
        siren:        cabinet.siren       || '',
        numeroOrdre:  cabinet.numeroOrdre || '',
        adresse:      cabinet.adresse     || '5 Place Langrand',
        codePostal:   cabinet.codePostal  || '54400',
        ville:        cabinet.ville       || 'Longwy',
        telephone:    cabinet.telephone   || '',
        email:        cabinet.email       || 'thierry.alcaraz@parfi-france.fr',
        siteWeb:      cabinet.siteWeb     || 'www.parfi-france.fr',
      },
      signataire: {
        nom_complet: ldm.collab_prenom
          ? `${ldm.collab_prenom} ${ldm.collab_nom}`.trim()
          : 'ParFi France',
        fonction:    'Expert-Comptable',
        email:       ldm.collab_email || cabinet.email || 'thierry.alcaraz@parfi-france.fr',
      },
    };

    // Run Python generator
    const pdfBuffer = await new Promise((resolve, reject) => {
      const SCRIPT = path2.join(__dirname, '..', 'python', 'generate_ldm_module.py');
      const py = spawn('python3', [SCRIPT]);
      const chunks = [], errChunks = [];
      py.stdout.on('data', c => chunks.push(c));
      py.stderr.on('data', c => errChunks.push(c));
      py.on('close', code => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`Python LDM PDF: ${Buffer.concat(errChunks).toString()}`));
      });
      py.on('error', err => reject(new Error(`spawn: ${err.message}`)));
      py.stdin.write(JSON.stringify(payload));
      py.stdin.end();
    });

    const PDF_DIR = path2.join(__dirname, '..', '..', 'uploads', 'ldm');
    await fs2.mkdir(PDF_DIR, { recursive: true });
    const filename = `${ldm.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    const filepath = path2.join(PDF_DIR, filename);
    await fs2.writeFile(filepath, pdfBuffer);
    await pool.query('UPDATE lettres_mission SET pdf_path = ? WHERE id = ?', [filepath, ldm.id]);

    res.json({ ok: true, filename, size: pdfBuffer.length });
  } catch (e) {
    console.error('[ldm pdf]', e);
    res.status(500).json({ message: 'Erreur génération PDF LDM', error: e.message });
  }
});

// ── GET /:id/pdf  — sert le fichier PDF ───────────────────────────────────────

router.get('/:id/pdf', verifyToken, async (req, res) => {
  try {
    const fs2 = require('fs/promises');
    const [[l]] = await pool.query(
      'SELECT numero, pdf_path FROM lettres_mission WHERE id = ?', [req.params.id]
    );
    if (!l) return res.status(404).json({ message: 'LDM introuvable' });
    if (!l.pdf_path) return res.status(404).json({ message: 'PDF non encore généré' });
    const pdfBuffer = await fs2.readFile(l.pdf_path);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${l.numero}.pdf"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'private, max-age=300',
    });
    res.send(pdfBuffer);
  } catch (e) {
    res.status(500).json({ message: 'Erreur lecture PDF', error: e.message });
  }
});

module.exports = router;
