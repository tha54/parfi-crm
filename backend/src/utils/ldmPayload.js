'use strict';
/**
 * Utilitaires de construction du payload LDM v4.
 *
 * Flux :
 *   const ctx     = await chargerContexteLdm(pool, ldmId);   // sources DB
 *   const payload = buildLdmPayload(ctx, { theme, iban });   // mapping pur
 *   const pdf     = await generateLdmPdf(payload);           // Python
 *
 * `buildLdmPayload` logue un WARN listant toute clé requise vide avant de
 * retourner le payload (missions[], client.nom, signataire.nom_complet,
 * repartition, mandat_sepa.ics — le générateur ne bloque pas mais le PDF
 * sortirait tronqué).
 */

const fs = require('fs');
const path = require('path');

const PY_DIR = path.join(__dirname, '..', 'python');
let _repartitionCache = null;
let _cgvCache = null;

function _loadJson(filename) {
  try { return JSON.parse(fs.readFileSync(path.join(PY_DIR, filename), 'utf-8')); }
  catch (_) { return null; }
}

function loadRepartition()   { if (_repartitionCache === null) _repartitionCache = _loadJson('repartition.json') || {}; return _repartitionCache; }
function loadCgvArticles()   { if (_cgvCache === null)        _cgvCache        = _loadJson('cgv_articles.json') || []; return _cgvCache; }

// ── Mapping type_mission (ldm_missions) → domaine référentiel repartition ────
// Les valeurs de la colonne varchar(50) `ldm_missions.type_mission` ne sont
// pas normalisées : le mapping ci-dessous les canonicalise vers les 5 domaines
// du référentiel repartition.json — c'est CE type qui déclenche l'affichage
// du bloc CP-4 et de la puce en synthèse.
const TYPE_MISSION_DOMAINE = {
  tenue_comptable:      'Comptabilité',
  revision_comptable:   'Comptabilité',
  presentation_comptes: 'Comptabilité',
  comptabilite:         'Comptabilité',
  comptable:            'Comptabilité',
  fiscal:               'Fiscalité',
  fiscalite:            'Fiscalité',
  tva:                  'Fiscalité',
  liasse:               'Fiscalité',
  social:               'Social',
  paie:                 'Social',
  dsn:                  'Social',
  juridique:            'Juridique',
  ago:                  'Juridique',
  agore:                'Juridique',
  conseil:              'Conseil',
  gestion:              'Conseil',
};

function _mapTypeMissionDomaine(t) {
  if (!t) return 'Autre';
  const k = String(t).trim().toLowerCase();
  return TYPE_MISSION_DOMAINE[k]
    || (Object.keys(loadRepartition()).find(d => d.toLowerCase() === k) || 'Autre');
}

const BULLET_MAP = {
  'Comptabilité': 'Tenue, révision et comptes annuels',
  'Fiscalité':    'Fiscalité et déclarations obligatoires',
  'Social':       'Paie et déclarations sociales',
  'Juridique':    'Secrétariat juridique et formalités',
  'Conseil':      'Conseil de gestion et pilotage',
};

// ── buildEcheances / buildCoverBullets / buildMandatSepa (inchangés) ─────────

function buildEcheances(periodicite, jourPrelevement, dateEffet) {
  const nbEcheancesMap = { mensuelle: 12, trimestrielle: 4, semestrielle: 2, annuelle: 1 };
  const pasMoisMap     = { mensuelle: 1,  trimestrielle: 3, semestrielle: 6, annuelle: 12 };
  const nb  = nbEcheancesMap[periodicite] || 12;
  const pas = pasMoisMap[periodicite] || 1;
  const jour = Math.max(1, Math.min(28, Number(jourPrelevement) || 5));
  const start = new Date(dateEffet);
  let cursor = new Date(start.getFullYear(), start.getMonth(), jour);
  if (cursor < start) cursor = new Date(start.getFullYear(), start.getMonth() + 1, jour);
  const echeances = [];
  for (let i = 0; i < nb; i++) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() + i * pas, jour);
    echeances.push({ date: d.toISOString().slice(0, 10) });
  }
  return {
    periodicite, nb_echeances: nb, jour_prelevement: jour,
    premiere_echeance: echeances[0].date, echeances,
  };
}

function buildCoverBullets(missions) {
  const seen = new Set();
  const bullets = [];
  for (const m of missions || []) {
    const dom = m.type || m.domaine;
    if (dom && !seen.has(dom) && BULLET_MAP[dom]) {
      bullets.push(BULLET_MAP[dom]); seen.add(dom);
      if (bullets.length >= 4) break;
    }
  }
  return bullets.length ? bullets : null;
}

function buildMandatSepa({ rum, ics, debiteur = {} }) {
  return {
    rum: rum || '', ics: ics || '',
    debiteur: {
      nom:     debiteur.nom     || '',
      adresse: debiteur.adresse || '',
      iban:    debiteur.iban    || '',
      bic:     debiteur.bic     || '',
    },
  };
}

/**
 * Agrège les lignes d'un devis (fallback historique) en missions par section.
 */
function aggregerMissionsDepuisLignes(lignes) {
  const aggr = {};
  for (const l of lignes || []) {
    const key = l.section || l.rubrique || 'Autre';
    if (!aggr[key]) aggr[key] = { libelle: l.rubrique || key, type: key, total: 0 };
    aggr[key].total += parseFloat(l.tarif_ht || l.totalHT || 0);
  }
  const ORDER = ['Comptabilité', 'Fiscalité', 'Social', 'Juridique', 'Conseil'];
  return [...ORDER.filter(k => aggr[k]), ...Object.keys(aggr).filter(k => !ORDER.includes(k))]
    .filter(k => aggr[k] && aggr[k].total > 0)
    .map(k => ({
      libelle:           aggr[k].libelle,
      type:              aggr[k].type,
      periodicite:       'Mensuel',
      montant_annuel_ht: Math.round(aggr[k].total * 100) / 100,
    }));
}

/**
 * Charge un contexte LDM complet depuis la DB : ligne LDM enrichie, client,
 * cabinet, missions (source native `ldm_missions`, fallback `lignes_devis`
 * puis `lettres_mission_chapitres`), expert signataire (via `attributions`).
 *
 * @param {object} pool  Pool mysql2 (import '../config/db')
 * @param {number} ldmId
 * @returns {Promise<object>} { ldm, client, cabinet, missions, expert, iban, bic }
 */
async function chargerContexteLdm(pool, ldmId) {
  // ── LDM + client + prospect + devis + collaborateur ─────────────────────────
  const [[ldm]] = await pool.query(
    `SELECT l.*,
            d.total_ht_net AS devis_ht_net, d.totalHT AS devis_ht_brut,
            d.remise_pct AS devis_remise, d.notesInternes AS devis_notes,
            d.notesClient AS devis_modalites
     FROM lettres_mission l
     LEFT JOIN devis d ON l.devis_id = d.id
     WHERE l.id = ?`, [ldmId]);
  if (!ldm) return null;

  let client = null;
  if (ldm.client_id) {
    // Colonnes réelles de la table clients (vérifiées via DESCRIBE clients)
    const [[c]] = await pool.query(
      `SELECT id, nom, raison_sociale, siren, siret, forme_juridique,
              adresse, code_postal, ville,
              nom_dirigeant, prenom_dirigeant,
              email_dirigeant, telephone_dirigeant, portal_email
       FROM clients WHERE id = ?`, [ldm.client_id]);
    client = c || null;
  } else if (ldm.prospect_id) {
    const [[p]] = await pool.query(
      `SELECT id, nom, siren, forme_juridique, adresse, code_postal, ville,
              contact_prenom, contact_nom, contact_email, email
       FROM prospects WHERE id = ?`, [ldm.prospect_id]).catch(() => [[null]]);
    if (p) {
      client = {
        id: p.id, nom: p.nom, raison_sociale: p.nom, siren: p.siren,
        forme_juridique: p.forme_juridique, adresse: p.adresse,
        code_postal: p.code_postal, ville: p.ville,
        prenom_dirigeant: p.contact_prenom, nom_dirigeant: p.contact_nom,
        email_dirigeant: p.contact_email || p.email, telephone_dirigeant: null,
      };
    }
  }

  const [[cabinet]] = await pool.query(
    `SELECT * FROM parametres_cabinet LIMIT 1`).catch(() => [[{}]]);

  // ── Missions : 3 sources dans l'ordre de priorité ───────────────────────────
  // 1) ldm_missions (source native de la LDM)
  // 2) lignes_devis via l.devis_id (fallback dimensionnement)
  // 3) lettres_mission_chapitres (fallback chapitre agrégé)
  let missions = [];
  let sourceMissions = 'aucune';
  const [ldmMissionsRows] = await pool.query(
    `SELECT type_mission, libelle, description, honoraires_ht, date_debut, date_fin, ordre
     FROM ldm_missions WHERE lettre_mission_id = ? ORDER BY ordre, id`,
    [ldmId]).catch(() => [[]]);
  if (ldmMissionsRows.length > 0) {
    // Groupement par domaine canonique (mapping type_mission → repartition key)
    const parDomaine = {};
    for (const r of ldmMissionsRows) {
      const dom = _mapTypeMissionDomaine(r.type_mission);
      if (!parDomaine[dom]) parDomaine[dom] = { libelles: [], descriptions: [], total: 0 };
      if (r.libelle) parDomaine[dom].libelles.push(r.libelle);
      if (r.description) parDomaine[dom].descriptions.push(r.description);
      parDomaine[dom].total += parseFloat(r.honoraires_ht || 0);
    }
    const ORDER = ['Comptabilité', 'Fiscalité', 'Social', 'Juridique', 'Conseil'];
    missions = [...ORDER.filter(k => parDomaine[k]), ...Object.keys(parDomaine).filter(k => !ORDER.includes(k))]
      .map(dom => ({
        type:              dom,
        libelle:           parDomaine[dom].libelles.join(' · ') || dom,
        description:       parDomaine[dom].descriptions.join(' — ') || '',
        periodicite:       'Mensuel',
        montant_annuel_ht: Math.round(parDomaine[dom].total * 100) / 100,
      }));
    sourceMissions = 'ldm_missions';
  } else if (ldm.devis_id) {
    const [lignes] = await pool.query(
      `SELECT * FROM lignes_devis WHERE devisId = ? AND actif = 1 ORDER BY ordre`,
      [ldm.devis_id]).catch(() => [[]]);
    if (lignes.length > 0) {
      missions = aggregerMissionsDepuisLignes(lignes);
      sourceMissions = 'lignes_devis';
    }
  }
  if (missions.length === 0) {
    const [chapitres] = await pool.query(
      `SELECT chapitre, montant_accepte_ht
       FROM lettres_mission_chapitres WHERE ldm_id = ?`, [ldmId]).catch(() => [[]]);
    if (chapitres.length > 0) {
      // Mapping chapitre enum → domaine référentiel
      const CH_MAP = { comptable_fiscal: 'Comptabilité', social: 'Social', juridique: 'Juridique' };
      missions = chapitres
        .filter(r => Number(r.montant_accepte_ht) > 0)
        .map(r => ({
          type:              CH_MAP[r.chapitre] || 'Autre',
          libelle:           CH_MAP[r.chapitre] || String(r.chapitre),
          description:       '',
          periodicite:       'Mensuel',
          montant_annuel_ht: Number(r.montant_accepte_ht),
        }));
      sourceMissions = 'lettres_mission_chapitres';
    }
  }

  // ── Expert signataire : via attributions (priorité chef_mission → responsable) ──
  let expert = null;
  if (ldm.client_id) {
    const [experts] = await pool.query(
      `SELECT u.id, u.prenom, u.nom, u.email, u.role, u.role_metier,
              a.role_sur_dossier
       FROM attributions a
       JOIN utilisateurs u ON u.id = a.utilisateur_id
       WHERE a.client_id = ?
         AND u.actif = 1
         AND (u.role = 'expert' OR u.role_metier IN ('expert_comptable','chef_de_groupe'))
       ORDER BY FIELD(a.role_sur_dossier, 'chef_mission','responsable','assistant'),
                u.role_metier = 'expert_comptable' DESC,
                u.id`,
      [ldm.client_id]).catch(() => [[]]);
    if (experts.length > 0) expert = experts[0];
  }
  // Fallback #1 : le chef_mission_id de la LDM
  if (!expert && ldm.chef_mission_id) {
    const [[u]] = await pool.query(
      `SELECT id, prenom, nom, email, role, role_metier FROM utilisateurs WHERE id = ?`,
      [ldm.chef_mission_id]).catch(() => [[null]]);
    if (u) expert = u;
  }
  // Fallback #2 : premier expert actif du cabinet
  if (!expert) {
    const [[u]] = await pool.query(
      `SELECT id, prenom, nom, email, role, role_metier FROM utilisateurs
       WHERE actif = 1 AND (role = 'expert' OR role_metier = 'expert_comptable')
       ORDER BY id LIMIT 1`).catch(() => [[null]]);
    if (u) expert = u;
  }

  // ── IBAN/BIC déjà connus (Powens / comptes_bancaires) ───────────────────────
  let iban = '', bic = '';
  if (ldm.client_id) {
    const [[cpt]] = await pool.query(
      `SELECT iban FROM comptes_bancaires WHERE client_id = ? AND actif = 1 LIMIT 1`,
      [ldm.client_id]).catch(() => [[null]]);
    if (cpt?.iban) iban = cpt.iban;
  }

  return { ldm, client, cabinet: cabinet || {}, missions, sourceMissions, expert, iban, bic };
}

/**
 * Construit le payload COMPLET LDM v4 depuis un contexte pré-chargé.
 * Logue un WARN listant les clés vides.
 *
 * @param {object} ctx    { ldm, client, cabinet, missions, sourceMissions, expert, iban, bic }
 * @param {object} opts   { theme, iban, bic, forcePrelevement }
 * @returns {object} payload prêt pour run_pipeline.py
 */
function buildLdmPayload(ctx, opts = {}) {
  const { ldm, client, cabinet = {}, missions = [], expert, sourceMissions } = ctx || {};
  if (!ldm) throw new Error('buildLdmPayload: ctx.ldm manquant');

  const theme  = opts.theme === 'ecran' ? 'ecran' : 'impression';
  const ht     = parseFloat(ldm.montantHonorairesHT || ldm.montant_annuel_ht || 0);
  const htBrut = parseFloat(ldm.devis_ht_brut || ht);
  const remise = parseFloat(ldm.devis_remise || 0);

  // ── Client mapping avec les VRAIS noms de colonnes ────────────────────────
  const c = client || {};
  const nomClient = c.raison_sociale || c.nom || '';
  const siren     = c.siren || c.siret || '';
  const forme     = c.forme_juridique || '';
  const adresse   = [c.adresse, c.code_postal, c.ville].filter(Boolean).join(' ');
  const dirigeant = [c.prenom_dirigeant, c.nom_dirigeant].filter(Boolean).join(' ');
  const emailCl   = c.email_dirigeant || c.portal_email || '';

  // ── Dates : ISO YYYY-MM-DD (le générateur v4 les formate en JJ/MM/AAAA) ──
  const dateEffet = ldm.dateDebut
    ? new Date(ldm.dateDebut).toISOString().split('T')[0]
    : (ldm.date_premiere_facture
        ? new Date(ldm.date_premiere_facture).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]);

  // ── Modalités : périodicité et moyen séparés (le générateur combine) ──────
  const periodicite = ldm.periodicite_facturation || ldm.modaliteFacturation || 'mensuelle';
  const PERIO_ADV = { mensuelle: 'Mensuellement', trimestrielle: 'Trimestriellement',
                      semestrielle: 'Semestriellement', annuelle: 'Annuellement' };
  const MOYEN = {
    prelevement: 'prélèvement automatique SEPA',
    virement:    'virement bancaire',
    cheque:      'chèque',
  };
  const moyen = MOYEN[ldm.mode_reglement || 'prelevement'] || 'prélèvement automatique SEPA';
  // Modalités "propres" : "Mensuellement par prélèvement automatique SEPA"
  // (le PDF affichait "réglées par Mensuellement par prélèvement automatique SEPA." — évite le doublon)
  const modalites = `${PERIO_ADV[periodicite] || 'Mensuellement'} par ${moyen}`;

  // ── Signataire : expert du dossier (attributions), pas le nom du cabinet ──
  const sigNomComplet = expert
    ? `${expert.prenom || ''} ${expert.nom || ''}`.trim()
    : '';

  const payload = {
    numero:               ldm.numero,
    date_prise_effet:     dateEffet,
    honoraires_ht_annuel: ht,
    honoraires_ht_brut:   htBrut,
    remise_pct:           remise,
    duree_preavis:        ldm.dureePreavis || 3,
    modalites_paiement:   modalites,
    objet_mission:        ldm.objetMission || ldm.objet_mission
                          || 'Mission d’expertise comptable, sociale, fiscale et juridique',
    missions,
    client: {
      nom:              nomClient,
      forme_juridique:  forme,
      siren,
      adresse,
      dirigeant,
      email:            emailCl,
    },
    cabinet: {
      nomCabinet:             cabinet.nomCabinet  || 'ParFi France',
      siren:                  cabinet.siren       || '',
      numeroOrdre:            cabinet.numeroOrdre || '',
      numero_inscription_oec: cabinet.numero_inscription_oec || cabinet.numeroOrdre || '',
      adresse:                cabinet.adresse     || '',
      codePostal:             cabinet.codePostal  || '',
      ville:                  cabinet.ville       || '',
      telephone:              cabinet.telephone   || '',
      email:                  cabinet.email       || cabinet.emailExpediteur || '',
      siteWeb:                cabinet.siteWeb     || '',
      ics:                    cabinet.ics         || '',
      partenaire_edi:         cabinet.partenaire_edi || '',
    },
    signataire: {
      nom_complet: sigNomComplet || (cabinet.nomCabinet || 'ParFi France'),
      fonction:    'Expert-comptable',
      email:       (expert && expert.email) || cabinet.email || cabinet.emailExpediteur || '',
      telephone:   cabinet.telephone || '',
    },
    theme,
    // Chantier G — mandats retirés du PDF LDM. Les mandats sont désormais
    // des annexes d'onboarding (voir /api/mandats et onboarding_etape E07/E10/E13).
    // Les colonnes ldm.mandat_edi / ldm.mandat_social restent en base pour
    // compat, mais le générateur Python n'ajoute plus les pages annexes.
    mandat_edi:    false,
    mandat_social: false,
    repartition:   loadRepartition(),
    cgv_articles:  loadCgvArticles(),
  };

  // Plan de facturation
  const jourPrelevement = ldm.jour_prelevement || 5;
  const dateEffetObj    = new Date(dateEffet);
  const ech = buildEcheances(periodicite, jourPrelevement, dateEffetObj);
  payload.plan_facturation = {
    ...ech,
    taux_tva: Number(cabinet.tauxTva || 20),
    montant_ht_periode: ht > 0 ? Math.round((ht / ech.nb_echeances) * 100) / 100 : 0,
  };

  // Chantier G — mandat_sepa retiré du payload LDM. Le générateur Python
  // n'ajoute plus de page annexe SEPA dans le PDF LDM. Le mandat SEPA reste
  // créé (par ldmSignatureChain) mais son PDF est produit indépendamment,
  // rattaché à l'onboarding du dossier.

  // ── WARN : listing des clés requises vides ──────────────────────────────
  const warns = [];
  if (!payload.client.nom)              warns.push('client.nom');
  if (!payload.client.forme_juridique)  warns.push('client.forme_juridique');
  if (!payload.client.siren)            warns.push('client.siren');
  if (!payload.client.adresse)          warns.push('client.adresse');
  if (!payload.client.dirigeant)        warns.push('client.dirigeant');
  if (!Array.isArray(payload.missions) || payload.missions.length === 0)
    warns.push(`missions[] (source: ${sourceMissions || 'aucune'})`);
  if (!sigNomComplet) warns.push('signataire.nom_complet (aucun expert trouvé via attributions)');
  if (!payload.repartition || !Object.keys(payload.repartition).length) warns.push('repartition');
  if (warns.length > 0 && opts.silent !== true) {
    console.warn(`[ldm ${ldm.numero || ldm.id}] ⚠ clés vides : ${warns.join(', ')}`);
  }

  return payload;
}

module.exports = {
  buildEcheances,
  buildCoverBullets,
  buildMandatSepa,
  buildLdmPayload,
  aggregerMissionsDepuisLignes,
  chargerContexteLdm,
  loadRepartition,
  loadCgvArticles,
};
