'use strict';
/**
 * Chantier 3 — Lot 1 étape (4c) : rattachement ldm_missions.dossier_id
 *
 * Contexte
 *   chantier3-04-seed-dossiers-depuis-clients.js a créé un dossier par client
 *   éligible (actif + au moins une ldm_missions active avec genere_production=1).
 *   Les lignes ldm_missions elles-mêmes n'ont pas encore leur dossier_id
 *   renseigné : sans ce lien, le job de génération des périodes trouve 0
 *   mission candidate.
 *
 *   Le rattachement est intentionnellement séparé de l'alimentation :
 *   deux opérations de nature différente, chacune doit pouvoir se rejouer
 *   indépendamment.
 *
 * Règle de rattachement (chemin unique)
 *   ldm_missions.lettre_mission_id → lettres_mission.client_id → dossier.client_id
 *   → dossier.id
 *
 *   L'UNIQUE key uq_dossier_client garantit un dossier au plus par client :
 *   pas d'ambiguïté sur la cible.
 *
 * Rapport de contrôle produit
 *   - Missions rattachées lors de cette exécution
 *   - Missions déjà rattachées (idempotence)
 *   - Missions orphelines, ventilées par motif :
 *       . lettre_mission_id NULL (donnée incohérente)
 *       . lettres_mission.client_id NULL (LM sur prospect ou orpheline)
 *       . client existe mais aucun dossier (client inéligible au chantier3-04 :
 *         inactif, sans LM active, ou toutes ses lignes production sont
 *         suspendues/terminées)
 *   Une mission active sans dossier signale toujours une décision à prendre.
 *
 * Idempotent — met à jour uniquement les lignes où dossier_id IS NULL.
 *
 * Usage : node chantier3-06-rattachement-ldm-missions-dossier.js [--db parfi_test|parfi] [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

const DB  = process.argv.includes('--db')      ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
const DRY = process.argv.includes('--dry-run');
if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD manquant');
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB, multipleStatements: false };

async function run() {
  const banner = DRY ? '(DRY-RUN — aucune écriture)' : '';
  console.log(`\n=== Chantier 3 lot 1 (4c) — rattachement ldm_missions.dossier_id (${DB}) ${banner} ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {

    // ─── 1. État avant : missions actives + genere_production, sans dossier_id ─
    // On ne considère que les lignes qui produiraient effectivement de la
    // planification (celles vues par le job generer_periodes). Rattacher des
    // lignes suspendues/terminées apporterait peu et brouillerait le rapport.
    const [candidates] = await conn.query(`
      SELECT m.id AS mission_id,
             m.lettre_mission_id,
             l.client_id       AS lm_client_id,
             l.prospect_id     AS lm_prospect_id,
             d.id              AS dossier_id_cible
        FROM ldm_missions m
        LEFT JOIN lettres_mission l ON l.id = m.lettre_mission_id
        LEFT JOIN dossier d         ON d.client_id = l.client_id
       WHERE m.dossier_id IS NULL
         AND m.genere_production = 1
         AND m.statut_production = 'active'
    `);

    // ─── 2. Ventilation ────────────────────────────────────────────────────
    const rattachables = candidates.filter(r => r.dossier_id_cible !== null);
    const orphelines   = candidates.filter(r => r.dossier_id_cible === null);
    const parMotif = {
      lettre_mission_absente:        orphelines.filter(r => r.lettre_mission_id === null),
      lm_sans_client:                orphelines.filter(r => r.lettre_mission_id !== null && r.lm_client_id === null && r.lm_prospect_id !== null),
      lm_sans_client_ni_prospect:    orphelines.filter(r => r.lettre_mission_id !== null && r.lm_client_id === null && r.lm_prospect_id === null),
      client_sans_dossier:           orphelines.filter(r => r.lm_client_id !== null && r.dossier_id_cible === null),
    };

    // ─── 3. Déjà rattachées (idempotence, compte séparé) ───────────────────
    const [[{ deja }]] = await conn.query(
      `SELECT COUNT(*) AS deja FROM ldm_missions
        WHERE dossier_id IS NOT NULL AND genere_production=1 AND statut_production='active'`
    );

    // ─── 4. Mise à jour ────────────────────────────────────────────────────
    let rattachees = 0;
    if (!DRY) {
      for (const r of rattachables) {
        await conn.query(`UPDATE ldm_missions SET dossier_id=? WHERE id=?`,
          [r.dossier_id_cible, r.mission_id]);
        rattachees++;
      }
    } else {
      rattachees = rattachables.length;
    }

    // ─── 5. Rapport ────────────────────────────────────────────────────────
    console.log('── Rapport ────────────────────────────────────────────────');
    console.log(`  Missions actives + genere_production examinées : ${candidates.length + deja}`);
    console.log(`  Déjà rattachées (idempotence)                   : ${deja}`);
    console.log(`  Rattachées cette exécution                      : ${rattachees}${DRY ? ' (dry-run)' : ''}`);
    console.log(`  Orphelines (à décider)                          : ${orphelines.length}`);
    if (orphelines.length > 0) {
      console.log('');
      console.log('  ── Ventilation des orphelines par motif ─');
      const libs = {
        lettre_mission_absente:     'lettre_mission_id NULL (donnée incohérente)',
        lm_sans_client:             'LM rattachée à un prospect, pas à un client',
        lm_sans_client_ni_prospect: 'LM sans client ni prospect (orpheline)',
        client_sans_dossier:        'Client sans dossier (inéligible au chantier3-04)',
      };
      for (const [k, arr] of Object.entries(parMotif)) {
        if (arr.length === 0) continue;
        console.log(`     ${libs[k]} : ${arr.length}`);
        for (const r of arr.slice(0, 20)) {
          console.log(`        mission #${r.mission_id}  LM=${r.lettre_mission_id ?? '∅'}  client=${r.lm_client_id ?? '∅'}${r.lm_prospect_id ? `  prospect=${r.lm_prospect_id}` : ''}`);
        }
        if (arr.length > 20) console.log(`        ... (${arr.length - 20} de plus)`);
      }
      console.log('');
      console.log('  → Chaque motif appelle une décision (pas un silence) :');
      console.log('    - LM/prospect : la LM doit-elle être convertie sur un client ?');
      console.log('    - client sans dossier : le client est-il vraiment inéligible ?');
      console.log('    - donnée orpheline : à supprimer ou à corriger ?');
    }

    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
