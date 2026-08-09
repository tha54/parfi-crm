'use strict';
/**
 * Chantier 3 — Lot 1 étape (4a) : ajout dossier.cotation_faite
 *
 * Motif :
 *   L'alimentation initiale de `dossier` depuis `clients` (étape 4b) pose des
 *   valeurs d'amorçage (classe='B', profils=['T'], scores nulls) parce que la
 *   campagne de cotation n'a pas encore eu lieu. Sans marqueur explicite, ces
 *   valeurs d'amorçage seraient indiscernables de vraies décisions de cotation :
 *   un dossier resté à 'B' par défaut serait pris pour un dossier coté 'B'.
 *
 *   `cotation_faite` distingue ces deux états. Il pilote aussi la campagne de
 *   cotation (tri des dossiers non encore cotés) et empêche les indicateurs
 *   d'agréger des valeurs d'amorçage comme si c'étaient des décisions.
 *
 * Idempotent (information_schema).
 *
 * Usage : node chantier3-03-dossier-cotation-faite.js [--db parfi_test|parfi]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
if (!process.env.DB_PASSWORD) { throw new Error('DB_PASSWORD manquant (charger backend/.env)'); }
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB, multipleStatements: false };

async function columnExists(conn, table, col) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1`,
    [DB, table, col]
  );
  return rows.length > 0;
}

async function run() {
  console.log(`\n=== Chantier 3 lot 1 (4a) — dossier.cotation_faite (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {
    if (await columnExists(conn, 'dossier', 'cotation_faite')) {
      console.log('  [SKIP] dossier.cotation_faite');
    } else {
      await conn.query(
        `ALTER TABLE dossier
           ADD COLUMN cotation_faite TINYINT(1) NOT NULL DEFAULT 0 AFTER date_derniere_cotation`
      );
      console.log('  [ADD]  dossier.cotation_faite');
    }
    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
