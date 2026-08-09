'use strict';
/**
 * Chantier 3 — Lot 1 étape (2) : schéma grade + niveau_requis
 *
 * Prépare la couche « valorisation » du lot 3 en posant dès le lot 1 les deux
 * colonnes qui structureront la double valorisation (spec § 14, RG-38/41/43) :
 *
 *   - utilisateurs.grade
 *       Distinct du rôle applicatif. Les trois grades de collaborateur ont
 *       les mêmes habilitations (le grade ne restreint aucun accès), il sert
 *       uniquement à la valorisation économique du réalisé (RG-43).
 *
 *   - dossier.niveau_requis
 *       Sera dérivé du niveau de complexité (faible → junior, moyenne → medior,
 *       élevée → senior). C'est ce niveau — pas le grade réel de l'intervenant
 *       — qui sert à valoriser le budget de production (RG-41). Confier un
 *       dossier moyen à un junior ne doit pas améliorer la marge affichée.
 *
 * Schéma UNIQUEMENT : aucune règle de dérivation, aucun backfill, aucune
 * jointure avec la valorisation. Ces mécanismes appartiennent au lot 3.
 * Poser les colonnes maintenant évite une migration lourde ultérieure sur les
 * tables les plus référencées du CRM (74 tables, FK denses vers utilisateurs).
 *
 * Idempotent (information_schema).
 *
 * Usage : node chantier3-05-schema-grade-niveau-requis.js [--db parfi_test|parfi]
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
  console.log(`\n=== Chantier 3 lot 1 (2) — schéma grade + niveau_requis (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {

    // utilisateurs.grade — enum, NULL autorisé (le grade sera renseigné
    // délibérément par l'expert-comptable, pas déduit d'un rôle).
    if (await columnExists(conn, 'utilisateurs', 'grade')) {
      console.log('  [SKIP] utilisateurs.grade');
    } else {
      await conn.query(`
        ALTER TABLE utilisateurs
          ADD COLUMN grade ENUM('junior','medior','senior','chef_mission','expert_comptable') NULL
          AFTER role_metier
      `);
      console.log('  [ADD]  utilisateurs.grade');
    }

    // dossier.niveau_requis — dérivé au lot 3 depuis le niveau de complexité.
    // Colonne posée dès le lot 1 pour éviter une ALTER ultérieure. NULL tant
    // que la règle de dérivation n'est pas implémentée.
    if (await columnExists(conn, 'dossier', 'niveau_requis')) {
      console.log('  [SKIP] dossier.niveau_requis');
    } else {
      await conn.query(`
        ALTER TABLE dossier
          ADD COLUMN niveau_requis ENUM('junior','medior','senior') NULL
          AFTER score_complexite
      `);
      console.log('  [ADD]  dossier.niveau_requis');
    }

    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
