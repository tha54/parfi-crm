'use strict';
/**
 * Chantier 3 — seed du référentiel onboarding_etape_modele.
 *
 * Charge docs-production/seed/onboarding_etape_modele.csv, filtre les
 * étapes préalables P1..P3 (delai_jours négatif — portées par
 * `opportunites` dans un chantier ultérieur) et upsert les E01..E27.
 *
 * Rechargeable : ON DUPLICATE KEY UPDATE sur `code` (PK). Ré-exécuter la
 * migration après modification du CSV met la base à jour, sans supprimer
 * l'historique (les onboarding_etape déjà instanciées gardent leur FK).
 *
 * Usage : node chantier3-09-seed-onboarding-etape-modele.js [--db parfi_test|parfi]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD manquant');
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB };

const CSV_PATH = path.join(__dirname, '..', '..', '..', 'docs-production', 'seed', 'onboarding_etape_modele.csv');

async function run() {
  console.log(`\n=== Chantier 3 — seed onboarding_etape_modele (${DB}) ===\n`);

  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const conn = await mysql.createConnection(CONF);
  try {
    let upserted = 0, skipped = 0;
    for (const r of rows) {
      const delai = parseInt(r.delai_jours, 10);
      // Étapes préalables (delai_jours < 0) exclues : portées par l'opportunité.
      if (delai < 0) { skipped++; continue; }

      const bloquant = String(r.bloquant).toLowerCase() === 'true' ? 1 : 0;
      const condition = r.condition && r.condition.trim() !== '' ? r.condition.trim() : null;

      await conn.query(
        `INSERT INTO onboarding_etape_modele
           (code, phase, ordre, delai_jours, libelle, responsable, bloquant, \`condition\`, actif)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           phase        = VALUES(phase),
           ordre        = VALUES(ordre),
           delai_jours  = VALUES(delai_jours),
           libelle      = VALUES(libelle),
           responsable  = VALUES(responsable),
           bloquant     = VALUES(bloquant),
           \`condition\` = VALUES(\`condition\`),
           actif        = 1`,
        [r.code, r.phase, parseInt(r.ordre, 10), delai, r.libelle, r.responsable, bloquant, condition]
      );
      upserted++;
    }
    console.log(`  [UPSERT] ${upserted} étape(s) E01..E27`);
    console.log(`  [SKIP]   ${skipped} étape(s) préalable(s) (delai_jours < 0)`);
    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
