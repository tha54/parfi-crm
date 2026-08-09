'use strict';
/**
 * Chantier 3 — Lot 1 étape (4b) : alimentation dossier depuis clients
 *
 * Critère d'éligibilité explicite (pas implicite) :
 *   Un client donne lieu à un dossier de production si et seulement si :
 *     - clients.actif = 1
 *     - il porte au moins une ligne ldm_missions rattachée à une lettre_mission
 *       en statut 'signee' ou 'active', avec genere_production = 1 et
 *       statut_production = 'active'.
 *   Les prospects, les clients clos et les clients sans mission de production
 *   n'en reçoivent pas — même si une lettre de mission existe mais ne porte
 *   aucune ligne active de production (LM ancienne, LM sans lignes, LM dont
 *   toutes les lignes sont suspendues/terminées).
 *
 * Valeurs d'amorçage (campagne de cotation non encore effectuée) :
 *   - classe            = 'B'   (par défaut, sera reclassé après cotation)
 *   - profils           = ['T'] (T = toutes)
 *   - score_risque      = NULL
 *   - score_complexite  = NULL
 *   - cotation_faite    = 0     (RG-01 ne s'applique pas tant que ce flag est 0)
 *   - materialite       = max(500, ca_reference × 1 %) — RG-02
 *   - ca_reference      = ca_mensuel_signe × 12 si connu, sinon NULL
 *
 * Rapport de contrôle :
 *   - nombre de dossiers créés
 *   - nombre de clients écartés, ventilé par motif
 *   - liste des clients actifs sans mission de production (probablement des LM
 *     manquantes ou mal paramétrées : à corriger avant lot 2)
 *
 * Idempotent : ne recrée pas de dossier pour un client_id déjà présent
 * (contrainte UNIQUE uq_dossier_client), et n'écrase pas les dossiers existants.
 *
 * Usage : node chantier3-04-seed-dossiers-depuis-clients.js [--db parfi_test|parfi] [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
const DRY = process.argv.includes('--dry-run');
if (!process.env.DB_PASSWORD) { throw new Error('DB_PASSWORD manquant (charger backend/.env)'); }
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB, multipleStatements: false };

// RG-02 — matérialité : plancher 500 €, sinon 1 % du CA de référence.
function materialite(caReference) {
  if (!caReference || caReference <= 0) return 500;
  return Math.max(500, Math.round(caReference * 0.01));
}

// Mappe clients.regime_tva (reel_normal|reel_simplifie|franchise|hors_champ)
// et clients.periodicite_tva (mensuelle|trimestrielle|annuelle|sans_objet)
// vers dossier.regime_tva (enum spec § 2.1).
// - reel_normal + mensuelle    → reel_normal_mensuel
// - reel_normal + trimestrielle→ reel_normal_trimestriel
// - reel_normal (autre)        → reel_normal_trimestriel (défaut prudent)
// - reel_simplifie             → reel_simplifie
// - franchise / hors_champ     → franchise
function mapRegimeTva(regime, periodicite) {
  if (regime === 'franchise' || regime === 'hors_champ') return 'franchise';
  if (regime === 'reel_simplifie') return 'reel_simplifie';
  if (regime === 'reel_normal') {
    return periodicite === 'mensuelle' ? 'reel_normal_mensuel' : 'reel_normal_trimestriel';
  }
  return null;
}

// Jour/mois de clôture depuis clients.date_cloture (une DATE arbitraire est
// utilisée pour porter jour+mois — l'année n'a pas de sens ici).
// Cf. spec §2.1 : dossier stocke jour et mois séparés pour éviter les bugs
// au 29 février.
function jourMoisCloture(dateCloture) {
  if (!dateCloture) return { jour: null, mois: null };
  const d = new Date(dateCloture);
  if (isNaN(d.getTime())) return { jour: null, mois: null };
  return { jour: d.getUTCDate(), mois: d.getUTCMonth() + 1 };
}

async function run() {
  const banner = DRY ? '(DRY-RUN — aucune écriture)' : '';
  console.log(`\n=== Chantier 3 lot 1 (4b) — alimentation dossier depuis clients (${DB}) ${banner} ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {

    // ─── 1. Tous les clients + agrégats de production ─────────────────────
    // Un JOIN à gauche permet de distinguer :
    //   - clients sans aucune LM (nb_lm = 0)
    //   - clients avec LM mais aucune ligne ldm_missions active (nb_missions_gp = 0)
    //   - clients éligibles (nb_missions_gp > 0)
    const [rows] = await conn.query(`
      SELECT
        c.id, c.nom, c.raison_sociale, c.siren, c.forme_juridique, c.actif,
        c.regime_tva, c.periodicite_tva, c.date_cloture, c.ca_mensuel_signe,
        COUNT(DISTINCT CASE WHEN l.statut IN ('signee','active') THEN l.id END) AS nb_lm_actives,
        COUNT(CASE WHEN l.statut IN ('signee','active')
                    AND m.genere_production = 1
                    AND m.statut_production = 'active'
                   THEN m.id END) AS nb_missions_gp
        FROM clients c
        LEFT JOIN lettres_mission l ON l.client_id = c.id
        LEFT JOIN ldm_missions    m ON m.lettre_mission_id = l.id
       GROUP BY c.id
    `);

    // ─── 2. Dossiers déjà présents (idempotence) ──────────────────────────
    const [existing] = await conn.query(`SELECT client_id FROM dossier`);
    const already = new Set(existing.map(r => r.client_id));

    // ─── 3. Tri et création ────────────────────────────────────────────────
    let cree = 0;
    let dejaLa = 0;
    const ecartes = {
      client_inactif: 0,
      sans_lettre_mission_active: 0,
      sans_mission_production: 0,
    };
    const sansMissionProduction = []; // clients actifs, LM active(s), 0 ligne gp

    for (const r of rows) {
      if (already.has(r.id)) { dejaLa++; continue; }
      if (r.actif !== 1) { ecartes.client_inactif++; continue; }
      if (r.nb_lm_actives === 0) { ecartes.sans_lettre_mission_active++; continue; }
      if (r.nb_missions_gp === 0) {
        ecartes.sans_mission_production++;
        sansMissionProduction.push({
          id: r.id,
          nom: r.raison_sociale || r.nom,
          nb_lm_actives: r.nb_lm_actives,
        });
        continue;
      }

      // Client éligible → création du dossier avec valeurs d'amorçage.
      const caReference = r.ca_mensuel_signe ? Math.round(Number(r.ca_mensuel_signe) * 12) : null;
      const mat = materialite(caReference);
      const { jour, mois } = jourMoisCloture(r.date_cloture);
      const regimeTva = mapRegimeTva(r.regime_tva, r.periodicite_tva);

      if (!DRY) {
        await conn.query(
          `INSERT INTO dossier
             (client_id, raison_sociale, siren, forme_juridique,
              jour_cloture, mois_cloture, regime_tva,
              classe, profils, score_risque, score_complexite, cotation_faite,
              materialite, ca_reference, statut)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'B', ?, NULL, NULL, 0, ?, ?, 'actif')`,
          [
            r.id,
            r.raison_sociale || r.nom,
            r.siren && r.siren.length === 9 ? r.siren : null,
            r.forme_juridique,
            jour, mois,
            regimeTva,
            JSON.stringify(['T']),
            mat,
            caReference,
          ]
        );
      }
      cree++;
    }

    // ─── 4. Rapport de contrôle ──────────────────────────────────────────
    console.log('── Rapport ────────────────────────────────────────────────');
    console.log(`  Clients examinés            : ${rows.length}`);
    console.log(`  Dossiers déjà présents      : ${dejaLa}`);
    console.log(`  Dossiers créés              : ${cree}${DRY ? ' (dry-run)' : ''}`);
    console.log(`  Écartés — client inactif    : ${ecartes.client_inactif}`);
    console.log(`  Écartés — sans LM active    : ${ecartes.sans_lettre_mission_active}`);
    console.log(`  Écartés — sans mission prod : ${ecartes.sans_mission_production}`);

    if (sansMissionProduction.length > 0) {
      console.log('');
      console.log('── Clients actifs avec LM mais SANS mission de production ─');
      console.log('  (probable : LM sans lignes, lignes suspendues/terminées,');
      console.log('   ou genere_production=0. À corriger avant le lot 2.)');
      for (const c of sansMissionProduction) {
        console.log(`  #${c.id}  ${c.nom}  (${c.nb_lm_actives} LM active(s))`);
      }
    }

    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
