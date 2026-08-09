'use strict';
/**
 * Chantier 3 (G) — repositionnement des mandats : LDM → onboarding.
 *
 * Les mandats (prélèvement SEPA, mandat fiscal impôts, mandat social URSSAF,
 * plateforme EDI) ne sont pas des clauses contractuelles : ce sont des
 * annexes opérationnelles produites *pendant* l'onboarding, matérialisées
 * par les étapes E07/E10/E13/… du référentiel `onboarding_etape_modele`.
 *
 * Cette migration :
 *   1. Ajoute `mandats.onboarding_id`       (FK vers onboarding, nullable, ON DELETE SET NULL)
 *   2. Ajoute `mandats.onboarding_etape_id` (FK vers onboarding_etape, nullable, ON DELETE SET NULL)
 *   3. Backfill défensif : pour chaque mandat porteur d'un `ldm_id` référençant
 *      une LDM active/signée dont le client dispose déjà d'un dossier + onboarding,
 *      renseigne `onboarding_id`. Les mandats "legacy" pointant sur des LDM
 *      brouillon/envoyée ne sont PAS backfillés — ils vivent le temps que le
 *      workflow LDM les archive ou que quelqu'un les rattache à la main.
 *
 * La colonne `mandats.ldm_id` est CONSERVÉE (nullable, sans FK stricte réécrite)
 * pour ne pas casser les enregistrements existants ni les endpoints legacy
 * (routes/mandats.js utilise encore ldm_id pour joindre). Elle sera retirée
 * dans un chantier séparé une fois tout le code migré.
 *
 * Idempotent : information_schema check.
 *
 * Usage : node chantier3-12-mandats-vers-onboarding.js --db parfi
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD manquant');
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB };

async function columnExists(conn, table, col) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1`,
    [DB, table, col]
  );
  return rows.length > 0;
}
async function fkExists(conn, table, name) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND CONSTRAINT_NAME=? AND CONSTRAINT_TYPE='FOREIGN KEY' LIMIT 1`,
    [DB, table, name]
  );
  return rows.length > 0;
}

async function run() {
  console.log(`\n=== Chantier 3 (G) — mandats vers onboarding (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {

    // ── 1. Colonne onboarding_id ────────────────────────────────────────────
    if (await columnExists(conn, 'mandats', 'onboarding_id')) {
      console.log('  [SKIP] mandats.onboarding_id (existe)');
    } else {
      await conn.query(`ALTER TABLE mandats ADD COLUMN onboarding_id INT NULL AFTER ldm_id`);
      console.log('  [ADD]  mandats.onboarding_id');
    }
    if (await fkExists(conn, 'mandats', 'fk_mandats_onboarding')) {
      console.log('  [SKIP] FK fk_mandats_onboarding');
    } else {
      await conn.query(`
        ALTER TABLE mandats
          ADD CONSTRAINT fk_mandats_onboarding
          FOREIGN KEY (onboarding_id) REFERENCES onboarding(id) ON DELETE SET NULL
      `);
      console.log('  [ADD]  FK mandats.onboarding_id → onboarding(id)');
    }
    await conn.query(`CREATE INDEX IF NOT EXISTS idx_mandats_onboarding ON mandats (onboarding_id)`)
      .catch(async () => {
        // MySQL 8.0.45 : IF NOT EXISTS sur CREATE INDEX pas garanti selon version.
        const [rows] = await conn.query(
          `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='mandats' AND INDEX_NAME='idx_mandats_onboarding' LIMIT 1`,
          [DB]
        );
        if (!rows.length) await conn.query(`CREATE INDEX idx_mandats_onboarding ON mandats (onboarding_id)`);
      });

    // ── 2. Colonne onboarding_etape_id ──────────────────────────────────────
    if (await columnExists(conn, 'mandats', 'onboarding_etape_id')) {
      console.log('  [SKIP] mandats.onboarding_etape_id (existe)');
    } else {
      await conn.query(`ALTER TABLE mandats ADD COLUMN onboarding_etape_id INT NULL AFTER onboarding_id`);
      console.log('  [ADD]  mandats.onboarding_etape_id');
    }
    if (await fkExists(conn, 'mandats', 'fk_mandats_onboarding_etape')) {
      console.log('  [SKIP] FK fk_mandats_onboarding_etape');
    } else {
      await conn.query(`
        ALTER TABLE mandats
          ADD CONSTRAINT fk_mandats_onboarding_etape
          FOREIGN KEY (onboarding_etape_id) REFERENCES onboarding_etape(id) ON DELETE SET NULL
      `);
      console.log('  [ADD]  FK mandats.onboarding_etape_id → onboarding_etape(id)');
    }

    // ── 3. Backfill défensif ────────────────────────────────────────────────
    // Ne rattache que les mandats dont la LDM correspondante appartient à un
    // client qui a déjà un dossier + un onboarding. Rien de créé à la volée.
    const [[stats]] = await conn.query(
      `SELECT COUNT(*) AS total_mandats,
              COUNT(m.onboarding_id) AS deja_lies
         FROM mandats m`
    );
    console.log(`  Mandats total : ${stats.total_mandats}, déjà liés : ${stats.deja_lies}`);

    const [candidats] = await conn.query(
      `SELECT m.id AS mandat_id, o.id AS onboarding_id
         FROM mandats m
         JOIN lettres_mission lm ON lm.id = m.ldm_id
         JOIN dossier d          ON d.client_id = lm.client_id
         JOIN onboarding o       ON o.dossier_id = d.id
        WHERE m.onboarding_id IS NULL`
    );
    if (candidats.length === 0) {
      console.log(`  [BACKFILL] 0 mandat rattaché (aucun candidat : LDM sans client, ou dossier/onboarding absent)`);
    } else {
      for (const c of candidats) {
        await conn.query(`UPDATE mandats SET onboarding_id = ? WHERE id = ?`, [c.onboarding_id, c.mandat_id]);
      }
      console.log(`  [BACKFILL] ${candidats.length} mandat(s) rattaché(s) à un onboarding existant`);
    }

    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
