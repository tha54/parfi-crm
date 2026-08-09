'use strict';
/**
 * Chantier 3 (F) — refonte dimensionnement → budget_ligne.
 *
 * Le brief est explicite : rien n'est en production, aucune donnée à
 * conserver. La migration fait donc TABLE RASE, avec sauvegarde CSV
 * préalable des tables supprimées pour trace.
 *
 * Ordre :
 *   1. Sauvegarde CSV des tables `dimensionnement` et `dimensionnement_lignes`
 *      dans /var/backups/mysql/dimensionnement/YYYY-MM-DD/*.csv (une fois
 *      par exécution — dossier daté).
 *   2. Création des nouvelles tables :
 *        - code_temps       (référentiel des natures d'activité)
 *        - taux_grade       (référentiel des taux par grade, PK grade)
 *        - budget_ligne     (une ligne = un code_temps + un grade + une
 *                             quantité + une périodicité). Taux figé à la
 *                             création (dénormalisé — cf. gravité sur alerte).
 *   3. Suppression des colonnes obsolètes :
 *        - ldm_missions.nombre_heures_par_profil
 *        - ldm_missions.taux_par_profil
 *        - lettres_mission.dimensionnement_id
 *   4. Suppression des tables obsolètes :
 *        - dimensionnement_lignes (enfant)
 *        - dimensionnement       (parent)
 *
 * Idempotent — chaque étape est protégée par information_schema.
 *
 * Usage : node chantier3-10-schema-budget-refonte.js [--db parfi_test|parfi]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD manquant');
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB, multipleStatements: false };

const BACKUP_ROOT = `/var/backups/mysql/dimensionnement/${new Date().toISOString().slice(0, 10)}`;

// ─── Helpers ───────────────────────────────────────────────────────────────
async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=? LIMIT 1`,
    [DB, table]
  );
  return rows.length > 0;
}
async function columnExists(conn, table, col) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1`,
    [DB, table, col]
  );
  return rows.length > 0;
}
async function fkName(conn, table, col) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1`,
    [DB, table, col]
  );
  return rows[0]?.CONSTRAINT_NAME || null;
}

async function dumpToCsv(conn, table, destDir) {
  if (!await tableExists(conn, table)) return { table, rows: 0, path: null };
  fs.mkdirSync(destDir, { recursive: true });
  const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
  if (rows.length === 0) {
    // Table vide : on la matérialise quand même (fichier headers seul)
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
      [DB, table]
    );
    const header = cols.map(c => c.COLUMN_NAME).join(',');
    const p = path.join(destDir, `${table}.csv`);
    fs.writeFileSync(p, header + '\n');
    return { table, rows: 0, path: p };
  }
  const headers = Object.keys(rows[0]);
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))];
  const p = path.join(destDir, `${table}.csv`);
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return { table, rows: rows.length, path: p };
}

// ─── Run ───────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n=== Chantier 3 (F) — refonte budget (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {

    // ── 1. Sauvegarde CSV avant suppression ─────────────────────────────
    for (const t of ['dimensionnement_lignes', 'dimensionnement']) {
      const r = await dumpToCsv(conn, t, BACKUP_ROOT);
      if (r.path) console.log(`  [BACKUP] ${t} → ${r.path} (${r.rows} ligne(s))`);
      else       console.log(`  [BACKUP] ${t} : table absente, rien à sauvegarder`);
    }

    // ── 2a. Nouvelle table code_temps ──────────────────────────────────
    if (await tableExists(conn, 'code_temps')) {
      console.log('  [SKIP] table code_temps');
    } else {
      await conn.query(`
        CREATE TABLE code_temps (
          code                      VARCHAR(3) NOT NULL,
          famille_cle               VARCHAR(50) NOT NULL,
          famille_libelle           VARCHAR(100) NOT NULL,
          libelle                   VARCHAR(255) NOT NULL,
          regime_defaut             VARCHAR(50) NULL,
          exige_dossier             TINYINT(1) NOT NULL DEFAULT 0,
          saisie_groupee            TINYINT(1) NOT NULL DEFAULT 0,
          exclu_ratio_productivite  TINYINT(1) NOT NULL DEFAULT 0,
          donnee_sensible           TINYINT(1) NOT NULL DEFAULT 0,
          actif                     TINYINT(1) NOT NULL DEFAULT 1,
          cree_le                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          modifie_le                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          archive_le                TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (code),
          KEY idx_code_temps_famille (famille_cle),
          KEY idx_code_temps_actif (actif)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table code_temps');
    }

    // ── 2b. Table taux_grade ────────────────────────────────────────────
    if (await tableExists(conn, 'taux_grade')) {
      console.log('  [SKIP] table taux_grade');
    } else {
      await conn.query(`
        CREATE TABLE taux_grade (
          grade                       ENUM('junior','medior','senior','chef_mission','expert_comptable') NOT NULL,
          libelle                     VARCHAR(100) NOT NULL,
          role_applicatif             VARCHAR(50) NOT NULL,
          taux_horaire_cible_eur      DECIMAL(6,2) NOT NULL,
          complexite_correspondante   ENUM('faible','moyenne','elevee') NULL,
          valide_le                   DATE NOT NULL,
          cree_le                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          modifie_le                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (grade),
          CONSTRAINT ck_taux_grade_positif CHECK (taux_horaire_cible_eur > 0)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table taux_grade');
    }

    // ── 2c. Table budget_ligne — le pivot ──────────────────────────────
    if (await tableExists(conn, 'budget_ligne')) {
      console.log('  [SKIP] table budget_ligne');
    } else {
      await conn.query(`
        CREATE TABLE budget_ligne (
          id                          INT NOT NULL AUTO_INCREMENT,
          mission_id                  INT NOT NULL,
          code_temps                  VARCHAR(3) NOT NULL,
          grade                       ENUM('junior','medior','senior','chef_mission','expert_comptable') NOT NULL,
          quantite_minutes            INT UNSIGNED NOT NULL,
          periodicite                 ENUM('mensuelle','trimestrielle','semestrielle','annuelle','ponctuelle') NOT NULL,
          minutes_annuelles           INT UNSIGNED NOT NULL,
          -- taux dénormalisé au moment de la création : jamais réécrit ensuite,
          -- sauf par la commande explicite recalculer-taux qui refuse sur LDM
          -- signée ou active (voir backend/src/jobs/recalculer-taux.js).
          taux_horaire_applique       DECIMAL(6,2) NOT NULL,
          montant_ht                  DECIMAL(12,2) NOT NULL,
          poste                       ENUM('production','supervision','onboarding') NOT NULL DEFAULT 'production',
          origine                     ENUM('saisie','modele','bareme_supervision','forfait') NOT NULL DEFAULT 'saisie',
          libelle                     VARCHAR(255) NULL,
          ordre                       INT NOT NULL DEFAULT 0,
          cree_le                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          cree_par                    INT NULL,
          modifie_le                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          modifie_par                 INT NULL,
          PRIMARY KEY (id),
          KEY idx_budget_ligne_mission (mission_id),
          KEY idx_budget_ligne_poste (poste),
          CONSTRAINT fk_bl_mission     FOREIGN KEY (mission_id) REFERENCES ldm_missions(id) ON DELETE CASCADE,
          CONSTRAINT fk_bl_code_temps  FOREIGN KEY (code_temps) REFERENCES code_temps(code),
          CONSTRAINT fk_bl_grade       FOREIGN KEY (grade)      REFERENCES taux_grade(grade),
          CONSTRAINT fk_bl_cree_par    FOREIGN KEY (cree_par)   REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_bl_modifie_par FOREIGN KEY (modifie_par) REFERENCES utilisateurs(id) ON DELETE SET NULL,
          -- Multiple de 15, plancher 15 min, plafond 720 min : contrainte en
          -- base pour couvrir aussi les imports et les scripts qui pourraient
          -- contourner le code applicatif.
          CONSTRAINT ck_bl_quantite CHECK (quantite_minutes % 15 = 0 AND quantite_minutes BETWEEN 15 AND 720)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table budget_ligne');
    }

    // ── 3. Suppression des colonnes obsolètes ──────────────────────────
    for (const col of ['nombre_heures_par_profil', 'taux_par_profil']) {
      if (await columnExists(conn, 'ldm_missions', col)) {
        await conn.query(`ALTER TABLE ldm_missions DROP COLUMN \`${col}\``);
        console.log(`  [DROP] ldm_missions.${col}`);
      } else {
        console.log(`  [SKIP] ldm_missions.${col} (déjà absente)`);
      }
    }
    if (await columnExists(conn, 'lettres_mission', 'dimensionnement_id')) {
      // Certaines FK MySQL bloqueraient le DROP COLUMN : on retire la FK d'abord.
      const fk = await fkName(conn, 'lettres_mission', 'dimensionnement_id');
      if (fk) {
        await conn.query(`ALTER TABLE lettres_mission DROP FOREIGN KEY \`${fk}\``);
        console.log(`  [DROP] FK ${fk} sur lettres_mission.dimensionnement_id`);
      }
      await conn.query(`ALTER TABLE lettres_mission DROP COLUMN dimensionnement_id`);
      console.log(`  [DROP] lettres_mission.dimensionnement_id`);
    } else {
      console.log(`  [SKIP] lettres_mission.dimensionnement_id (déjà absente)`);
    }

    // ── 4. Suppression des tables obsolètes ────────────────────────────
    // dimensionnement_lignes d'abord (enfant)
    for (const t of ['dimensionnement_lignes', 'dimensionnement']) {
      if (await tableExists(conn, t)) {
        await conn.query(`DROP TABLE \`${t}\``);
        console.log(`  [DROP] table ${t}`);
      } else {
        console.log(`  [SKIP] table ${t} (déjà absente)`);
      }
    }

    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
