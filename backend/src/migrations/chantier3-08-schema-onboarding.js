'use strict';
/**
 * Chantier 3 — module Entrée en relation (onboarding).
 *
 * SCHÉMA UNIQUEMENT — trois tables. Le seed du référentiel (E01..E27) est
 * chargé par une migration séparée à venir.
 *
 * Mécanique identique à production_periode / production_tache : mêmes ENUM
 * (statut N/EC/F/NA), mêmes CHECK (motif_na ≥ 10 si NA, antidatage fait_le
 * interdit), même UNIQUE (parent, code_modele). La fonction d'instanciation
 * réutilisera le patron `instancierTaches` de generer-periodes.js.
 *
 *   onboarding_etape_modele : référentiel des étapes E01..E27. Le mot
 *     `condition` étant réservé par MySQL (handlers de procédures), la
 *     colonne est déclarée avec backticks. Les étapes préalables P1..P3
 *     (delai_jours négatif) ne vivent PAS ici — elles seront portées par
 *     `opportunites` dans un chantier ultérieur.
 *
 *   onboarding : une occurrence par dossier entrant. UNIQUE sur dossier_id.
 *     Décision de fin explicite (statut + decision_fin ≥ 10 caractères +
 *     date_decision), garantie par un CHECK — pas de clôture par écoulement
 *     du temps ni par complétion automatique.
 *
 *   onboarding_etape : les étapes instanciées, exactement sur le patron de
 *     production_tache. UNIQUE (onboarding_id, code_modele) pour idempotence
 *     à l'instanciation.
 *
 * MySQL 8.0.45 : pas d'ADD COLUMN IF NOT EXISTS, on passe par
 * information_schema. Idempotent — les tables déjà présentes sont sautées.
 *
 * Usage : node chantier3-08-schema-onboarding.js [--db parfi_test|parfi]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD manquant');
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB, multipleStatements: false };

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=? LIMIT 1`,
    [DB, table]
  );
  return rows.length > 0;
}

async function run() {
  console.log(`\n=== Chantier 3 (D) — schéma onboarding (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {

    // ─── 1. onboarding_etape_modele (référentiel) ─────────────────────────
    if (await tableExists(conn, 'onboarding_etape_modele')) {
      console.log('  [SKIP] table onboarding_etape_modele');
    } else {
      await conn.query(`
        CREATE TABLE onboarding_etape_modele (
          code                        VARCHAR(3) NOT NULL,
          phase                       ENUM('declenchement','reprise','collecte','demarrage','parametrage','production','cloture') NOT NULL,
          ordre                       SMALLINT UNSIGNED NOT NULL,
          delai_jours                 SMALLINT UNSIGNED NOT NULL,
          libelle                     VARCHAR(255) NOT NULL,
          responsable                 ENUM('expert_comptable','chef_de_mission','collaborateur') NOT NULL,
          bloquant                    TINYINT(1) NOT NULL DEFAULT 0,
          -- 'condition' est réservé par MySQL (handlers de procédures) → backticks
          \`condition\`                 ENUM('reprise_confrere','profil_especes') NULL,
          actif                       TINYINT(1) NOT NULL DEFAULT 1,
          cree_le                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          modifie_le                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          archive_le                  TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (code),
          KEY idx_onb_modele_phase (phase),
          KEY idx_onb_modele_ordre (ordre)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table onboarding_etape_modele');
    }

    // ─── 2. onboarding (occurrence par dossier) ───────────────────────────
    if (await tableExists(conn, 'onboarding')) {
      console.log('  [SKIP] table onboarding');
    } else {
      await conn.query(`
        CREATE TABLE onboarding (
          id                          INT NOT NULL AUTO_INCREMENT,
          dossier_id                  INT NOT NULL,
          date_signature              DATE NOT NULL,
          date_fin_cible              DATE NOT NULL,
          statut                      ENUM('en_cours','clos','prolonge','avenant') NOT NULL DEFAULT 'en_cours',
          reprise_confrere            TINYINT(1) NOT NULL DEFAULT 0,
          confrere_precedent          VARCHAR(255) NULL,
          decision_fin                TEXT NULL,
          date_decision               DATE NULL,
          cree_le                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          cree_par                    INT NULL,
          modifie_le                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          modifie_par                 INT NULL,
          archive_le                  TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_onboarding_dossier (dossier_id),
          KEY idx_onboarding_statut (statut),
          KEY idx_onboarding_fin_cible (date_fin_cible),
          CONSTRAINT fk_onboarding_dossier      FOREIGN KEY (dossier_id)  REFERENCES dossier(id),
          CONSTRAINT fk_onboarding_cree_par     FOREIGN KEY (cree_par)    REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_onboarding_modifie_par  FOREIGN KEY (modifie_par) REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT ck_onboarding_dates CHECK (date_fin_cible >= date_signature),
          -- Décision explicite exigée pour toute clôture (spec RG-53).
          -- Un onboarding en_cours n'a ni decision_fin ni date_decision ;
          -- un onboarding clos/prolonge/avenant doit avoir les deux.
          CONSTRAINT ck_onboarding_decision CHECK (
            (statut = 'en_cours' AND decision_fin IS NULL AND date_decision IS NULL)
            OR
            (statut <> 'en_cours' AND decision_fin IS NOT NULL AND CHAR_LENGTH(decision_fin) >= 10 AND date_decision IS NOT NULL)
          )
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table onboarding');
    }

    // ─── 3. onboarding_etape (étapes instanciées) ─────────────────────────
    if (await tableExists(conn, 'onboarding_etape')) {
      console.log('  [SKIP] table onboarding_etape');
    } else {
      await conn.query(`
        CREATE TABLE onboarding_etape (
          id                          INT NOT NULL AUTO_INCREMENT,
          onboarding_id               INT NOT NULL,
          code_modele                 VARCHAR(3) NOT NULL,
          date_echeance               DATE NOT NULL,
          statut                      ENUM('N','EC','F','NA') NOT NULL DEFAULT 'N',
          motif_na                    TEXT NULL,
          fait_par                    INT NULL,
          fait_le                     TIMESTAMP NULL DEFAULT NULL,
          commentaire                 TEXT NULL,
          cree_le                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          cree_par                    INT NULL,
          modifie_le                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          modifie_par                 INT NULL,
          archive_le                  TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_onb_etape_code (onboarding_id, code_modele),
          KEY idx_onb_etape_statut (statut),
          KEY idx_onb_etape_echeance (date_echeance),
          KEY idx_onb_etape_faitpar (fait_par),
          CONSTRAINT fk_onb_etape_onboarding  FOREIGN KEY (onboarding_id) REFERENCES onboarding(id) ON DELETE CASCADE,
          CONSTRAINT fk_onb_etape_modele      FOREIGN KEY (code_modele)   REFERENCES onboarding_etape_modele(code),
          CONSTRAINT fk_onb_etape_fait_par    FOREIGN KEY (fait_par)      REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_onb_etape_cree_par    FOREIGN KEY (cree_par)      REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_onb_etape_modifie_par FOREIGN KEY (modifie_par)   REFERENCES utilisateurs(id) ON DELETE SET NULL,
          -- RG-09 : motif_na ≥ 10 caractères si statut = NA. Le refus des
          -- valeurs "NA" / "n/a" reste applicatif (CHECK MySQL ne peut pas
          -- normaliser casse et accents proprement).
          CONSTRAINT ck_onb_etape_motif_na CHECK (
            statut <> 'NA' OR (motif_na IS NOT NULL AND CHAR_LENGTH(motif_na) >= 10)
          ),
          -- Antidatage interdit : fait_le est horodaté serveur au passage en F.
          CONSTRAINT ck_onb_etape_fait_le CHECK (
            (statut = 'F' AND fait_le IS NOT NULL) OR (statut <> 'F')
          )
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table onboarding_etape');
    }

    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
