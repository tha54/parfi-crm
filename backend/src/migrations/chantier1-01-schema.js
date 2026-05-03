'use strict';
/**
 * Chantier 1 — Étape 2 · Commit 1 : Évolution du schéma clients + prospects
 * Usage : node chantier1-01-schema.js [--db parfi_test|parfi]
 *
 * Exécuter D'ABORD avec --db parfi_test, valider, puis --db parfi.
 * Idempotent : chaque ADD vérifie information_schema avant d'agir.
 */

const mysql = require('mysql2/promise');

const DB   = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
const CONF = { host: 'localhost', user: 'parfi', password: 'Parfi2026!', database: DB, multipleStatements: true };

async function columnExists(conn, table, col) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [DB, table, col]
  );
  return rows.length > 0;
}

async function addColumn(conn, table, col, def, after = null) {
  if (await columnExists(conn, table, col)) {
    console.log(`  [SKIP] ${table}.${col} — déjà présent`);
    return;
  }
  const afterClause = after ? `AFTER \`${after}\`` : '';
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def} ${afterClause}`);
  console.log(`  [ADD]  ${table}.${col}`);
}

async function modifyColumn(conn, table, col, def) {
  await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${col}\` ${def}`);
  console.log(`  [MOD]  ${table}.${col} → ${def.substring(0, 60)}`);
}

async function run() {
  console.log(`\n=== Chantier 1 — Schéma DB (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);

  try {
    // ── TABLE clients ────────────────────────────────────────────────────────

    console.log('── clients : nouvelles colonnes ──');

    await addColumn(conn, 'clients', 'periodicite_tva',
      "ENUM('mensuelle','trimestrielle','annuelle','sans_objet') NULL",
      'regime_tva');

    await addColumn(conn, 'clients', 'presence_salaries',
      'TINYINT(1) NULL', 'periodicite_tva');

    await addColumn(conn, 'clients', 'nb_salaries',
      'SMALLINT NULL', 'presence_salaries');

    await addColumn(conn, 'clients', 'nb_etablissements',
      'TINYINT UNSIGNED DEFAULT 1', 'nb_salaries');

    await addColumn(conn, 'clients', 'activite_type',
      "ENUM('bic','bnc','immobilier','holding','autre') NULL",
      'nb_etablissements');

    await addColumn(conn, 'clients', 'convention_collective',
      'VARCHAR(150) NULL', 'activite_type');

    await addColumn(conn, 'clients', 'migration_anomalie',
      'TEXT NULL', 'convention_collective');

    // Colonnes _legacy
    await addColumn(conn, 'clients', 'regime_fiscal_legacy',
      'VARCHAR(50) NULL', 'migration_anomalie');

    await addColumn(conn, 'clients', 'regime_tva_legacy',
      'VARCHAR(30) NULL', 'regime_fiscal_legacy');

    await addColumn(conn, 'clients', 'forme_juridique_legacy',
      'VARCHAR(100) NULL', 'regime_tva_legacy');

    // Copie des valeurs legacy (idempotent : seulement si _legacy encore vide)
    console.log('\n── clients : copie legacy ──');
    const [copyResult] = await conn.query(`
      UPDATE clients SET
        regime_fiscal_legacy   = COALESCE(regime_fiscal_legacy, regime_fiscal),
        regime_tva_legacy      = COALESCE(regime_tva_legacy, regime_tva),
        forme_juridique_legacy = COALESCE(forme_juridique_legacy, forme_juridique)
    `);
    console.log(`  [OK] ${copyResult.affectedRows} lignes mises à jour`);

    // Vider les colonnes sources pour permettre le MODIFY vers ENUM restrictif
    await conn.query(`UPDATE clients SET regime_fiscal = NULL, regime_tva = NULL, forme_juridique = NULL`);
    console.log('  [OK] Colonnes sources vidées');

    // Modifier vers nouveaux ENUM
    console.log('\n── clients : MODIFY vers nouveaux ENUM ──');
    await modifyColumn(conn, 'clients', 'regime_fiscal',
      "ENUM('IS','IR_BIC','IR_BNC','IR_translucide','micro_bic','micro_bnc') NULL");

    await modifyColumn(conn, 'clients', 'regime_tva',
      "ENUM('reel_normal','reel_simplifie','franchise','hors_champ') NULL");

    await modifyColumn(conn, 'clients', 'forme_juridique',
      `ENUM('SARL','SAS','SASU','EURL','EI','EIRL','SCI','SCEA','SA','SELARL','SCCV','SCM','SCP','SCA','SC','GIE','Association','Autre') NULL`);

    // ── TABLE prospects ───────────────────────────────────────────────────────

    console.log('\n── prospects : nouvelles colonnes ──');

    await addColumn(conn, 'prospects', 'regime_fiscal',
      "ENUM('IS','IR_BIC','IR_BNC','IR_translucide','micro_bic','micro_bnc') NULL",
      'forme_juridique');

    await addColumn(conn, 'prospects', 'regime_tva',
      "ENUM('reel_normal','reel_simplifie','franchise','hors_champ') NULL",
      'regime_fiscal');

    await addColumn(conn, 'prospects', 'periodicite_tva',
      "ENUM('mensuelle','trimestrielle','annuelle','sans_objet') NULL",
      'regime_tva');

    await addColumn(conn, 'prospects', 'presence_salaries',
      'TINYINT(1) NULL', 'periodicite_tva');

    await addColumn(conn, 'prospects', 'nb_salaries',
      'SMALLINT NULL', 'presence_salaries');

    await addColumn(conn, 'prospects', 'activite_type',
      "ENUM('bic','bnc','immobilier','holding','autre') NULL",
      'nb_salaries');

    await addColumn(conn, 'prospects', 'convention_collective',
      'VARCHAR(150) NULL', 'activite_type');

    await addColumn(conn, 'prospects', 'migration_anomalie',
      'TEXT NULL', 'convention_collective');

    await addColumn(conn, 'prospects', 'forme_juridique_legacy',
      'VARCHAR(100) NULL', 'migration_anomalie');

    // Copie forme_juridique legacy et vidage
    console.log('\n── prospects : copie legacy forme_juridique ──');
    const [copyProsp] = await conn.query(`
      UPDATE prospects SET
        forme_juridique_legacy = COALESCE(forme_juridique_legacy, forme_juridique)
    `);
    console.log(`  [OK] ${copyProsp.affectedRows} lignes`);

    await conn.query(`UPDATE prospects SET forme_juridique = NULL`);
    console.log('  [OK] forme_juridique vidée');

    // MODIFY prospects.forme_juridique vers ENUM (FK checks off le temps du rebuild)
    console.log('\n── prospects : MODIFY forme_juridique ──');
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    await modifyColumn(conn, 'prospects', 'forme_juridique',
      `ENUM('SARL','SAS','SASU','EURL','EI','EIRL','SCI','SCEA','SA','SELARL','SCCV','SCM','SCP','SCA','SC','GIE','Association','Autre') NULL`);
    await conn.query('SET FOREIGN_KEY_CHECKS=1');

    console.log('\n=== Schéma DB OK ===');

  } catch (err) {
    console.error('\n[ERREUR]', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
