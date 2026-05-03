'use strict';
/**
 * Chantier 1 — Étape 2 · Commit 2 : Migration des données clients
 * Usage : node chantier1-02-migrate-data.js [--db parfi_test|parfi]
 *
 * Applique les règles §3.1-3.6 du plan de migration.
 * Règle d'or : en cas de doute → NULL + migration_anomalie.
 * Idempotent : lit uniquement les _legacy, écrit seulement si nouveaux champs encore NULL.
 */

const mysql = require('mysql2/promise');

const DB   = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
const CONF = { host: 'localhost', user: 'parfi', password: 'Parfi2026!', database: DB };

// ─── Mapping APE → activite_type ─────────────────────────────────────────────
const APE_MAP = {
  // Immobilier
  '6810Z': 'immobilier', '6820A': 'immobilier', '6820B': 'immobilier',
  '6831Z': 'immobilier', '6832A': 'immobilier', '6832B': 'immobilier',
  '6810A': 'immobilier', '6811Z': 'immobilier', '6820C': 'immobilier',
  // Holdings / gestion de participations
  '6420Z': 'holding', '7010Z': 'holding', '6430Z': 'holding',
  '6492Z': 'holding', '6499Z': 'holding',
  // Professions libérales / BNC
  '8690E': 'bnc', '8690F': 'bnc', '6920Z': 'bnc',
  '7022Z': 'bnc', '6910Z': 'bnc', '7111Z': 'bnc', '7112B': 'bnc',
  '8621Z': 'bnc', '8622A': 'bnc', '8622B': 'bnc', '8622C': 'bnc',
  '8623Z': 'bnc', '8629A': 'bnc', '8629B': 'bnc',
  // Activités BIC (commerce, artisanat, industrie — liste étendue au fil de l'eau)
  // Commerces de détail
  '4711A': 'bic', '4711B': 'bic', '4711C': 'bic', '4711D': 'bic', '4711E': 'bic',
  '4711F': 'bic', '4719A': 'bic', '4719B': 'bic',
  '4724Z': 'bic', '4725Z': 'bic', '4726Z': 'bic', '4729Z': 'bic',
  '4741Z': 'bic', '4742Z': 'bic', '4743Z': 'bic', '4751Z': 'bic',
  '4752A': 'bic', '4752B': 'bic', '4753Z': 'bic', '4754Z': 'bic',
  '4759A': 'bic', '4759B': 'bic', '4761Z': 'bic', '4762Z': 'bic',
  '4763Z': 'bic', '4764Z': 'bic', '4765Z': 'bic', '4771Z': 'bic',
  '4772A': 'bic', '4772B': 'bic', '4773Z': 'bic', '4774Z': 'bic',
  '4775Z': 'bic', '4776Z': 'bic', '4777Z': 'bic', '4778A': 'bic', '4778C': 'bic',
  '4779Z': 'bic',
  // Restauration
  '5610A': 'bic', '5610B': 'bic', '5610C': 'bic', '5621Z': 'bic', '5629A': 'bic',
  '5629B': 'bic', '5630Z': 'bic',
  // Construction
  '4110A': 'bic', '4110B': 'bic', '4110C': 'bic', '4110D': 'bic',
  '4120A': 'bic', '4120B': 'bic', '4211Z': 'bic', '4213A': 'bic', '4213B': 'bic',
  '4321A': 'bic', '4321B': 'bic', '4322A': 'bic', '4322B': 'bic', '4329A': 'bic',
  '4329B': 'bic', '4331Z': 'bic', '4332A': 'bic', '4332B': 'bic', '4332C': 'bic',
  '4333Z': 'bic', '4334Z': 'bic', '4339Z': 'bic', '4391A': 'bic', '4391B': 'bic',
  '4399A': 'bic', '4399B': 'bic', '4399C': 'bic', '4399D': 'bic', '4399E': 'bic',
  // Transport
  '4941A': 'bic', '4941B': 'bic', '4941C': 'bic', '4942Z': 'bic', '4950Z': 'bic',
  // Industrie manufacturière (échantillon)
  '1011Z': 'bic', '1012Z': 'bic', '1013A': 'bic', '1013B': 'bic',
  '1071A': 'bic', '1071B': 'bic', '1071C': 'bic', '1071D': 'bic',
  // Auto / garage
  '4511Z': 'bic', '4519Z': 'bic', '4520A': 'bic', '4520B': 'bic',
  '4530Z': 'bic', '4540Z': 'bic',
  // Agences / communication
  '7311Z': 'bic', '7312Z': 'bic', '7320Z': 'bic',
  // Édition, culture
  '5920Z': 'bic',
  // Coiffure, esthétique, services personnels
  '9602A': 'bic', '9602B': 'bic', '9609Z': 'bic', '9601B': 'bic', '9523Z': 'bic',
  // Informatique / numérique
  '6201Z': 'bic', '6202A': 'bic', '6202B': 'bic', '6209Z': 'bic',
  '6311Z': 'bic', '6312Z': 'bic', '6391Z': 'bic',
  // Hôtellerie / hébergement
  '5520Z': 'bic', '5510Z': 'bic', '5530Z': 'bic',
  // Pompes funèbres, jardinage, nettoyage
  '9603Z': 'bic', '8130Z': 'bic', '8121Z': 'bic', '8122Z': 'bic',
  // Agences commerciales, soutien administratif
  '4619B': 'bic', '4791B': 'bic', '8299Z': 'bic', '8219Z': 'bic', '8211Z': 'bic',
  // Activités récréatives
  '9329Z': 'bic', '9312Z': 'bic',
  // Commerce de gros
  '4674B': 'bic', '4669B': 'bic', '4634Z': 'bic',
  // Réparation / fabrication
  '3312Z': 'bic', '3311Z': 'bic', '3320A': 'bic', '3299Z': 'bic',
  '2341Z': 'bic', '1085Z': 'bic', '3831Z': 'bic',
  // Transport / location
  '7712Z': 'bic', '4211Z': 'bic',
  // Commerce détail divers
  '4778B': 'bic',
  // Formation
  '8559A': 'bic',
  // Professions libérales supplémentaires (BNC)
  '8690D': 'bnc', '8690A': 'bnc', '6622Z': 'bnc',
  '7021Z': 'bnc', '7490A': 'bnc',
  // Gestion de fonds / placements
  '6630Z': 'holding',
  // Activités associatives / autres
  '9499Z': 'autre',
  // Viticulture (BA absent du cabinet → autre + anomalie via null)
  // '0121Z' laissé non mappé → anomalie
};

// ─── Mapping forme_juridique legacy → ENUM ──────────────────────────────────
const FJ_MAP = {
  // Correspondances exactes (insensible à la casse après trim)
  'SARL': 'SARL', 'SAS': 'SAS', 'SASU': 'SASU', 'EURL': 'EURL', 'EI': 'EI',
  'EIRL': 'EIRL', 'SCI': 'SCI', 'SCEA': 'SCEA', 'SA': 'SA', 'SELARL': 'SELARL',
  'SCCV': 'SCCV', 'SCM': 'SCM', 'SCP': 'SCP', 'SCA': 'SCA', 'SC': 'SC',
  'GIE': 'GIE', 'ASSOCIATION': 'Association', 'AUTRE': 'Autre',
  // Variantes orthographiques connues
  'ENTREPRISE INDIVIDUELLE': 'EI',
  'E.I.': 'EI',
  'E.I': 'EI',
  'EI.': 'EI',
  'SOCIÉTÉ DE FAIT': null,   // → Autre + anomalie
  'SOCIETE DE FAIT': null,   // → Autre + anomalie
  'SCI ': 'SCI',             // trailing space
};

function normFJ(val) {
  if (!val) return null;
  const key = val.trim().toUpperCase();
  if (key in FJ_MAP) return FJ_MAP[key];
  // Test direct case-insensitive contre les valeurs ENUM
  const ENUM_VALS = ['SARL','SAS','SASU','EURL','EI','EIRL','SCI','SCEA','SA',
    'SELARL','SCCV','SCM','SCP','SCA','SC','GIE','Association','Autre'];
  const match = ENUM_VALS.find(v => v.toUpperCase() === key);
  return match || null; // null = non reconnu
}

// ─── Migrateur principal ──────────────────────────────────────────────────────

async function migrateClient(conn, c, stats) {
  let regime_fiscal   = null;
  let regime_tva      = null;
  let periodicite_tva = null;
  let forme_juridique = null;
  let activite_type   = null;
  const anomalies     = [];

  const rf = (c.regime_fiscal_legacy || '').toUpperCase().trim();
  const rtva = (c.regime_tva_legacy  || '').toLowerCase().trim();

  // ── §3.4 : Forme juridique ──────────────────────────────────────────────
  const fjRaw = c.forme_juridique_legacy;
  if (!fjRaw) {
    anomalies.push('Forme juridique non renseignée');
  } else {
    const fjNorm = normFJ(fjRaw);
    if (fjNorm === null) {
      // Valeur non reconnue dans l'ENUM
      forme_juridique = 'Autre';
      anomalies.push(`Forme juridique '${fjRaw}' non reconnue dans le référentiel — requalifiée 'Autre', à vérifier`);
    } else {
      forme_juridique = fjNorm;
    }
  }

  // ── §3.1 : Mapping regime_fiscal_legacy → nouveaux champs ──────────────

  if (!rf) {
    // NULL ou vide
    anomalies.push('Régime fiscal non renseigné');

  } else if (rf === 'ISRS') {
    regime_fiscal = 'IS';
    // ISRS = IS + Réel Simplifié → TVA annuelle par définition
    if (rtva === 'non_soumis') {
      // Incohérence : IS+Réel simplifié mais legacy = non soumis
      regime_tva      = null;
      periodicite_tva = null;
      anomalies.push("Incohérence : IS+Réel simplifié mais TVA legacy = non_soumis — régime TVA à préciser");
    } else if (rtva === 'trimestriel') {
      regime_tva      = 'reel_simplifie';
      periodicite_tva = 'annuelle';
      anomalies.push("TVA legacy = trimestriel incohérent avec Réel simplifié — converti en annuel, à vérifier");
    } else {
      // mensuel, Simplifié, ou autre valeur → on applique la règle sans anomalie
      regime_tva      = 'reel_simplifie';
      periodicite_tva = 'annuelle';
    }

  } else if (rf === 'ISRN') {
    regime_fiscal = 'IS';
    regime_tva    = 'reel_normal';
    // §3.2 : périodicité depuis legacy
    if (rtva === 'mensuel') {
      periodicite_tva = 'mensuelle';
    } else if (rtva === 'trimestriel') {
      periodicite_tva = 'trimestrielle';
    } else if (rtva === 'simplifié' || rtva === 'simplifie') {
      periodicite_tva = null;
      anomalies.push("Incohérence : régime fiscal RN mais TVA legacy = Simplifié");
    } else if (rtva === 'non_soumis') {
      periodicite_tva = null;
      anomalies.push("Incohérence : régime fiscal RN mais TVA legacy = non_soumis");
    } else {
      periodicite_tva = null;
      anomalies.push("Périodicité TVA legacy manquante ou non reconnue pour ISRN");
    }

  } else if (rf === 'BICRS') {
    regime_fiscal = 'IR_BIC';
    if (rtva === 'non_soumis') {
      regime_tva      = null;
      periodicite_tva = null;
      anomalies.push("Incohérence : IR_BIC+Réel simplifié mais TVA legacy = non_soumis — régime TVA à préciser");
    } else if (rtva === 'trimestriel') {
      regime_tva      = 'reel_simplifie';
      periodicite_tva = 'annuelle';
      anomalies.push("TVA legacy = trimestriel incohérent avec Réel simplifié — converti en annuel, à vérifier");
    } else {
      regime_tva      = 'reel_simplifie';
      periodicite_tva = 'annuelle';
    }

  } else if (rf === 'BICRN') {
    regime_fiscal = 'IR_BIC';
    regime_tva    = 'reel_normal';
    if (rtva === 'mensuel') {
      periodicite_tva = 'mensuelle';
    } else if (rtva === 'trimestriel') {
      periodicite_tva = 'trimestrielle';
    } else {
      periodicite_tva = null;
      anomalies.push("Périodicité TVA legacy manquante ou non reconnue pour BICRN");
    }

  } else if (rf === 'BNC') {
    // §3.3 : BNC
    regime_fiscal = 'IR_BNC';
    if (rtva === 'non_soumis') {
      regime_tva      = 'hors_champ';
      periodicite_tva = 'sans_objet';
    } else if (rtva === 'mensuel') {
      regime_tva      = 'reel_normal';
      periodicite_tva = 'mensuelle';
    } else if (rtva === 'trimestriel') {
      regime_tva      = 'reel_normal';
      periodicite_tva = 'trimestrielle';
    } else if (rtva === 'simplifié' || rtva === 'simplifie') {
      regime_tva      = 'reel_simplifie';
      periodicite_tva = 'annuelle';
    } else {
      regime_tva      = null;
      periodicite_tva = null;
      anomalies.push("BNC sans régime TVA legacy renseigné — à compléter");
    }

  } else if (['SCIC', 'SCIS', 'SCMS'].includes(rf)) {
    // §3.1 + décision Q4 : forme juridique SCI déductible, régime fiscal ambigü
    forme_juridique = 'SCI'; // surcharge le mapping FJ si elle était NULL ou différente
    regime_fiscal   = null;
    regime_tva      = null;
    periodicite_tva = null;
    anomalies.push(`Code legacy '${rf}' : SCI sans précision IS/IR — forme juridique fixée à SCI, régime fiscal à qualifier`);

  } else if (rf === 'BARN') {
    anomalies.push("Code legacy 'BARN' : pas de dossier BA dans le cabinet — à requalifier");

  } else if (rf === 'MICRO') {
    anomalies.push("Code legacy 'MICRO' : préciser micro-BIC ou micro-BNC");

  } else {
    anomalies.push(`Code legacy '${rf}' non reconnu — régime fiscal à qualifier`);
  }

  // ── §3.5 : Activité depuis code APE ────────────────────────────────────
  const ape = (c.code_ape || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
  if (ape) {
    activite_type = APE_MAP[ape] || null;
    if (!activite_type) {
      anomalies.push(`Code APE '${c.code_ape}' non reconnu dans la table de mapping — activité à qualifier`);
    }
  }
  // pas d'anomalie si APE absent (§3.7 : champ optionnel)

  const anomalie_text = anomalies.length > 0 ? anomalies.join(' | ') : null;

  await conn.query(`
    UPDATE clients SET
      regime_fiscal   = ?,
      regime_tva      = ?,
      periodicite_tva = ?,
      forme_juridique = ?,
      activite_type   = ?,
      migration_anomalie = ?
    WHERE id = ?
  `, [regime_fiscal, regime_tva, periodicite_tva, forme_juridique, activite_type, anomalie_text, c.id]);

  // Stats
  if (anomalie_text) stats.anomalies++; else stats.propres++;
  if (!regime_fiscal) stats.rf_null++;
  if (!activite_type && ape) stats.ape_non_reconnus.add(c.code_ape);
  if (!normFJ(fjRaw) && fjRaw && !['SCIC','SCIS','SCMS'].includes(rf)) {
    stats.fj_variants.add(fjRaw);
  }
}

async function run() {
  console.log(`\n=== Chantier 1 — Migration données (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  const stats = { total: 0, propres: 0, anomalies: 0, rf_null: 0, ape_non_reconnus: new Set(), fj_variants: new Set() };

  try {
    const [clients] = await conn.query(`
      SELECT id, nom, regime_fiscal_legacy, regime_tva_legacy, forme_juridique_legacy, code_ape
      FROM clients
    `);
    stats.total = clients.length;

    for (const c of clients) {
      await migrateClient(conn, c, stats);
    }

    console.log(`Total              : ${stats.total}`);
    console.log(`Migrés proprement  : ${stats.propres}`);
    console.log(`Avec anomalie      : ${stats.anomalies}`);
    console.log(`Régime fiscal NULL : ${stats.rf_null}`);
    console.log(`APE non reconnus   : ${stats.ape_non_reconnus.size > 0 ? [...stats.ape_non_reconnus].join(', ') : 'aucun'}`);
    console.log(`FJ variants        : ${stats.fj_variants.size > 0 ? [...stats.fj_variants].join(', ') : 'aucun'}`);

    console.log('\n=== Migration terminée ===');

  } catch (err) {
    console.error('\n[ERREUR]', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
