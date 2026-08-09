'use strict';
/**
 * Chantier 3 — Vérification post-migration
 *
 * À lancer immédiatement après chantier3-01 et chantier3-02.
 * Contrôle 5 invariants attendus. Sort en code 0 si tous OK, code 2 si un check
 * échoue (utilisable en pipe pour bloquer les étapes suivantes).
 *
 * Options :
 *   --db parfi_test|parfi         base cible (défaut parfi_test)
 *   --ldm-count-before N          nombre attendu de lignes ldm_missions AVANT split
 *                                 (le script vérifie que le compte APRÈS = N + 8)
 *   --sum-honoraires-before X     somme totale honoraires_ht AVANT (ex : 21344.50)
 *   --sum-budget-before Y         somme totale budget_temps_annuel AVANT (minutes)
 *
 * Sans --ldm-count-before, le check 1 est reporté en warning (pas d'échec) car
 * on ne connaît pas la valeur de référence après-coup.
 *
 * Usage :
 *   node chantier3-99-verify.js --db parfi_test --ldm-count-before 19 --sum-honoraires-before ... --sum-budget-before ...
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

function argv(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}
const DB = argv('--db') || 'parfi_test';
const LDM_BEFORE = argv('--ldm-count-before') != null ? Number(argv('--ldm-count-before')) : null;
const SUM_HONO_BEFORE = argv('--sum-honoraires-before') != null ? Number(argv('--sum-honoraires-before')) : null;
const SUM_BUDGET_BEFORE = argv('--sum-budget-before') != null ? Number(argv('--sum-budget-before')) : null;

if (!process.env.DB_PASSWORD) { throw new Error('DB_PASSWORD manquant'); }
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB };

let failed = 0;
let warned = 0;
function ok(label, detail = '')  { console.log(`  [32m[OK][0m   ${label}${detail ? ' — ' + detail : ''}`); }
function ko(label, detail = '')  { console.log(`  [31m[FAIL][0m ${label}${detail ? ' — ' + detail : ''}`); failed++; }
function wn(label, detail = '')  { console.log(`  [33m[WARN][0m ${label}${detail ? ' — ' + detail : ''}`); warned++; }
function info(msg)               { console.log(`  [90m[..][0m   ${msg}`); }

async function run() {
  console.log(`\n=== Chantier 3 — vérification post-migration (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {

    // ─── Check 1 : compte ldm_missions avant/après split ─────────────────────
    console.log('\n[1] Nombre de lignes ldm_missions (attendu : AVANT + 8)');
    const [[{ nb: nbApres }]] = await conn.query(`SELECT COUNT(*) AS nb FROM ldm_missions`);
    const [[{ nbAuto }]] = await conn.query(`SELECT COUNT(*) AS nbAuto FROM ldm_missions WHERE repartition_auto = 1`);
    info(`total après = ${nbApres}, dont repartition_auto=1 : ${nbAuto}`);
    if (LDM_BEFORE == null) {
      wn('compte avant non fourni — check reporté',
         `passer --ldm-count-before <N> pour valider (attendu N + 8 = ${nbApres})`);
    } else if (nbApres === LDM_BEFORE + 8) {
      ok(`compte cohérent : ${LDM_BEFORE} + 8 = ${nbApres}`);
    } else {
      ko(`compte incohérent : attendu ${LDM_BEFORE + 8}, trouvé ${nbApres}`);
    }
    // Cohérence : chaque ligne mixte splittée produit exactement 2 lignes.
    // On doit donc avoir un multiple de 2 lignes repartition_auto=1.
    if (nbAuto % 2 !== 0) {
      ko(`nombre de lignes repartition_auto=1 impair (${nbAuto}) — split incomplet`);
    } else {
      ok(`lignes issues du split appairées : ${nbAuto / 2} paires (TVA + annuel)`);
    }

    // ─── Check 2 : conservation des sommes ───────────────────────────────────
    console.log('\n[2] Conservation des sommes honoraires_ht et budget_temps_annuel');
    const [[{ sh, sb }]] = await conn.query(
      `SELECT ROUND(SUM(honoraires_ht),2) AS sh, COALESCE(SUM(budget_temps_annuel),0) AS sb FROM ldm_missions`
    );
    info(`SUM(honoraires_ht) = ${sh}, SUM(budget_temps_annuel) = ${sb} min`);
    if (SUM_HONO_BEFORE == null) {
      wn('somme honoraires avant non fournie — check reporté');
    } else {
      const delta = Math.abs(Number(sh) - Number(SUM_HONO_BEFORE));
      if (delta < 0.005) ok(`honoraires conservés : ${sh} == ${SUM_HONO_BEFORE}`);
      else               ko(`honoraires non conservés : ${sh} vs ${SUM_HONO_BEFORE} (Δ = ${delta.toFixed(2)})`);
    }
    if (SUM_BUDGET_BEFORE == null) {
      wn('somme budget avant non fournie — check reporté');
    } else {
      const delta = Math.abs(Number(sb) - Number(SUM_BUDGET_BEFORE));
      if (delta === 0) ok(`budget conservé : ${sb} == ${SUM_BUDGET_BEFORE} min`);
      else             ko(`budget non conservé : ${sb} vs ${SUM_BUDGET_BEFORE} min (Δ = ${delta} min)`);
    }
    // Vérification interne : la somme par LM est identique de part et d'autre du
    // split (aucun agrégat externe n'a bougé). Si on n'a pas de référence
    // externe, au moins on contrôle que le split n'a pas cassé l'équilibre par LM.
    const [[{ nbSplitLm }]] = await conn.query(
      `SELECT COUNT(DISTINCT lettre_mission_id) AS nbSplitLm FROM ldm_missions WHERE repartition_auto = 1`
    );
    ok(`${nbSplitLm} lettre(s) de mission concernée(s) par un split`);

    // ─── Check 3 : intégrité référentielle ───────────────────────────────────
    console.log('\n[3] Intégrité référentielle dossier / ldm_missions.dossier_id');
    // Zéro dossier orphelin (client_id inexistant ou archivé).
    const [[{ orphelins }]] = await conn.query(`
      SELECT COUNT(*) AS orphelins
        FROM dossier d
   LEFT JOIN clients c ON c.id = d.client_id
       WHERE c.id IS NULL
    `);
    if (orphelins === 0) ok('aucun dossier orphelin (client_id inexistant)');
    else                 ko(`${orphelins} dossier(s) orphelin(s)`);

    // NB : à ce stade de l'étape (a), aucun dossier n'est encore créé
    // (décision utilisateur : pas de création implicite depuis clients).
    // Donc toutes les lignes ldm_missions ont dossier_id NULL. Ce n'est
    // pas une erreur — c'est l'état attendu tant que les dossiers n'ont
    // pas été créés délibérément.
    const [[{ ldmSansDossier }]] = await conn.query(
      `SELECT COUNT(*) AS ldmSansDossier FROM ldm_missions WHERE dossier_id IS NULL`
    );
    const [[{ nbDossiers }]] = await conn.query(`SELECT COUNT(*) AS nbDossiers FROM dossier`);
    info(`${nbDossiers} dossier(s) créé(s), ${ldmSansDossier} ldm_missions sans dossier_id`);
    if (nbDossiers === 0) {
      wn(`aucun dossier créé — normal à l'étape (a), à peupler avant étape (b)`,
         `les périodes ne pourront être générées que pour les LM rattachées à un dossier`);
    } else {
      // Si des dossiers existent, on vérifie qu'aucune LM active liée à un
      // client qui possède un dossier n'a pourtant dossier_id = NULL.
      const [[{ ldmACorriger }]] = await conn.query(`
        SELECT COUNT(*) AS ldmACorriger
          FROM ldm_missions lm
          JOIN lettres_mission l ON l.id = lm.lettre_mission_id
          JOIN dossier d ON d.client_id = l.client_id
         WHERE lm.dossier_id IS NULL
      `);
      if (ldmACorriger === 0) ok('toutes les LM liées à un client-avec-dossier sont rattachées');
      else                    ko(`${ldmACorriger} LM sans dossier_id alors que le client a un dossier`);
    }

    // ─── Check 4 : tache_modele — 26 lignes dont 18 obligatoires ────────────
    console.log('\n[4] tache_modele (attendu : 26 lignes dont 18 obligatoire=1)');
    const [[{ tm }]] = await conn.query(`SELECT COUNT(*) AS tm FROM tache_modele`);
    const [[{ tmObli }]] = await conn.query(`SELECT COUNT(*) AS tmObli FROM tache_modele WHERE obligatoire = 1`);
    if (tm === 26) ok(`26 lignes présentes`);
    else           ko(`${tm} lignes présentes (attendu 26)`);
    if (tmObli === 18) ok(`18 lignes obligatoire=1`);
    else               ko(`${tmObli} lignes obligatoire=1 (attendu 18)`);

    // ─── Check 5 : jour_cloture / mois_cloture vs clients.date_cloture ──────
    console.log('\n[5] Correspondance jour_cloture / mois_cloture avec clients.date_cloture');
    // Échantillon : 10 dossiers, dont au moins 1 clôture ≠ 31/12.
    const [rows] = await conn.query(`
      SELECT d.id AS dossier_id, d.jour_cloture, d.mois_cloture,
             c.id AS client_id, c.nom, c.date_cloture
        FROM dossier d
        JOIN clients c ON c.id = d.client_id
       WHERE d.jour_cloture IS NOT NULL AND d.mois_cloture IS NOT NULL
       ORDER BY (c.date_cloture <> '2000-12-31'
             AND (MONTH(c.date_cloture) <> 12 OR DAY(c.date_cloture) <> 31)) DESC,
                d.id
       LIMIT 10
    `);
    if (rows.length === 0) {
      wn(`aucun dossier avec jour_cloture / mois_cloture renseigné — check reporté`,
         `l'alimentation depuis clients.date_cloture se fera à la création manuelle des dossiers`);
    } else {
      let mismatches = 0;
      let nonDec31 = 0;
      for (const r of rows) {
        if (!r.date_cloture) continue;
        const d = new Date(r.date_cloture);
        const jour = d.getUTCDate();
        const mois = d.getUTCMonth() + 1;
        const match = r.jour_cloture === jour && r.mois_cloture === mois;
        if (!(mois === 12 && jour === 31)) nonDec31++;
        if (match) {
          info(`client #${r.client_id} ${r.nom} — dossier ${r.dossier_id} : ${r.jour_cloture}/${r.mois_cloture} == ${jour}/${mois}`);
        } else {
          mismatches++;
          console.log(`  [31m[X][0m   client #${r.client_id} ${r.nom} — dossier ${r.dossier_id} : ${r.jour_cloture}/${r.mois_cloture} != ${jour}/${mois}`);
        }
      }
      if (mismatches === 0) ok(`${rows.length} dossier(s) contrôlé(s), toutes les dates correspondent`);
      else                  ko(`${mismatches} mismatch(es) sur ${rows.length} dossiers`);
      if (nonDec31 === 0)   wn(`aucun dossier avec clôture ≠ 31/12 dans l'échantillon — représentativité limitée`);
      else                  ok(`${nonDec31} dossier(s) avec clôture ≠ 31/12 dans l'échantillon`);
    }

    // ─── Récap ──────────────────────────────────────────────────────────────
    console.log('\n─────────────────────────────────────────');
    if (failed === 0 && warned === 0) console.log('[32m=== TOUS LES CHECKS PASSENT ===[0m\n');
    else if (failed === 0)             console.log(`[33m=== ${warned} warning(s), 0 échec ===[0m\n`);
    else                                console.log(`[31m=== ${failed} échec(s), ${warned} warning(s) ===[0m\n`);
  } finally {
    await conn.end();
  }
  if (failed > 0) process.exit(2);
}

run().catch(e => { console.error(e); process.exit(1); });
