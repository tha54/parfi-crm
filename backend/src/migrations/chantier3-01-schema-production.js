'use strict';
/**
 * Chantier 3 — Lot 1 étape (a) : socle de production (dossier, mission, periode, tache)
 *
 * Ce que fait cette migration
 *   1. Crée la table `dossier` (0..1 vers `clients`, FK unique).
 *      - `jour_cloture` + `mois_cloture` INT séparés (pas de date arbitraire).
 *      - Convention module : cree_le / cree_par / modifie_le / modifie_par / archive_le.
 *   2. Étend `ldm_missions` (= `mission` au sens de la spec, cf. CLAUDE-production.md § équivalences) :
 *      - dossier_id NULL, nature, periodicite, budget_temps_annuel, genere_production,
 *        statut_production, repartition_auto.
 *      - Mapping type_mission → nature pour les 19 lignes existantes.
 *      - Périodicité par défaut selon nature ; pour les lignes 'declaratif' pures TVA,
 *        lecture de clients.periodicite_tva.
 *      - Calcul de budget_temps_annuel (minutes entières) depuis nombre_heures_par_profil.
 *      - Split des lignes fiscales mixtes (« Déclarations TVA » + Liasses/CET annuel)
 *        en 2 lignes distinctes (TVA récurrente + fiscal annuel). Répartition documentée
 *        (40 % TVA, 60 % annuel), flag `repartition_auto=TRUE` sur les 2 lignes créées.
 *   3. Crée `production_periode` (occurrence de production, cœur du module).
 *      Contrainte UNIQUE (mission_id, exercice, numero) — RG-03 idempotente.
 *   4. Crée `tache_modele` (catalogue des 26 diligences, PK = code VARCHAR).
 *      Le contenu est chargé par chantier3-02-seed-tache-modele.js (rechargeable).
 *   5. Crée `production_tache` (instance d'une tâche modèle sur une période).
 *      - statut ENUM('N','EC','F','NA') + CHECK motif_na obligatoire si NA (RG-09).
 *      - fait_le est horodaté serveur, jamais saisi (RG probante § 7).
 *
 * Idempotent : information_schema pour tables/colonnes ; le split ldm_missions est
 * détecté via l'existence de lignes `repartition_auto=1`.
 *
 * Ce qui N'EST PAS fait ici (à venir dans étapes suivantes du lot 1) :
 *   - étape (b) : job de génération des périodes (RG-03), moteur d'instanciation
 *     des production_tache selon profils/classes du dossier.
 *   - étape (c) : vues « Ma semaine » et « Échéance ».
 *   - alimentation automatique des dossiers depuis clients existants (décision prise
 *     avec l'utilisateur : pas de création implicite ; le dossier est un objet
 *     d'organisation créé délibérément).
 *
 * MySQL 8.0.45 : pas d'ADD COLUMN IF NOT EXISTS, on passe par information_schema.
 *
 * Usage : node chantier3-01-schema-production.js [--db parfi_test|parfi]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
if (!process.env.DB_PASSWORD) { throw new Error('DB_PASSWORD manquant (charger backend/.env)'); }
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB, multipleStatements: false };

// ── helpers ─────────────────────────────────────────────────────────────────
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
async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=? LIMIT 1`,
    [DB, table, index]
  );
  return rows.length > 0;
}
async function addColumn(conn, table, col, def, after = null) {
  if (await columnExists(conn, table, col)) { console.log(`  [SKIP] ${table}.${col}`); return; }
  const afterClause = after ? `AFTER \`${after}\`` : '';
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def} ${afterClause}`);
  console.log(`  [ADD]  ${table}.${col}`);
}

// Mapping type_mission (varchar existant, valeurs libres) → nature (enum spec).
// Les valeurs observées en base au moment de la rédaction : tenue_comptable, fiscal, juridique.
// L'enum lettres_mission.typeMission inclut aussi : revision, etablissement_comptes,
// social_paie, conseil, autre — d'où les mappings prophylactiques ci-dessous.
function mapNature(typeMission) {
  const m = {
    tenue_comptable:       'tenue',
    revision:              'revision',
    etablissement_comptes: 'presentation_comptes',
    fiscal:                'declaratif',
    social_paie:           'social',
    social:                'social',
    conseil:               'conseil',
    juridique:             'juridique',
    autre:                 'conseil',
  };
  return m[typeMission] || 'conseil';
}

// Périodicité par défaut selon la nature, quand rien de plus précis n'est disponible.
function defaultPeriodiciteFromNature(nature) {
  switch (nature) {
    case 'tenue':                return 'mensuelle';
    case 'social':               return 'mensuelle';
    case 'declaratif':           return 'trimestrielle'; // défaut TVA le plus courant en France
    case 'juridique':            return 'annuelle';
    case 'revision':             return 'annuelle';
    case 'presentation_comptes': return 'annuelle';
    case 'conseil':              return 'ponctuelle';
    default:                     return 'ponctuelle';
  }
}

// Mappe clients.periodicite_tva (mensuelle|trimestrielle|annuelle|sans_objet)
// vers l'enum spec periodicite.
function mapPeriodiciteTva(pv) {
  if (pv === 'mensuelle')     return 'mensuelle';
  if (pv === 'trimestrielle') return 'trimestrielle';
  if (pv === 'annuelle')      return 'annuelle';
  return 'trimestrielle';
}

// Somme des heures d'un profil JSON puis conversion en minutes entières (RG-31).
function heuresJsonToMinutes(json) {
  if (!json) return 0;
  let obj;
  try { obj = typeof json === 'string' ? JSON.parse(json) : json; } catch { return 0; }
  const h = Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
  return Math.round(h * 60);
}

// Détection des lignes fiscales mixtes : contiennent une TVA récurrente ET un
// composant annuel (Liasse ou CET). Ce sont les seules à splitter.
function isMixedFiscalLine(row) {
  if (row.type_mission !== 'fiscal') return false;
  const l = (row.libelle || '').toLowerCase();
  const hasTvaRecurrent = l.includes('déclarations tva') || l.includes('declarations tva');
  const hasAnnuel = l.includes('liasse') || l.includes('annuelle cet') || l.includes('déclaration annuelle');
  return hasTvaRecurrent && hasAnnuel;
}

// Clé de répartition documentée pour les lignes mixtes fiscales, adaptative selon
// la périodicité de TVA du client. Une CA3 mensuelle représente 12 déclarations
// dans l'année, une trimestrielle 4 : la part TVA ne peut pas être la même.
//   - TVA mensuelle     → 40 % TVA / 60 % annuel
//   - TVA trimestrielle → 25 % TVA / 75 % annuel
//   - inconnue          → 40 % TVA / 60 % annuel (défaut prudent)
// Les 2 lignes créées portent repartition_auto=1 pour être revalidées manuellement
// avant qualification définitive du hors-mission. Filet de sécurité assumé,
// on ne pousse pas plus loin le raffinement automatique.
function splitTvaShare(periodiciteTvaClient) {
  if (periodiciteTvaClient === 'mensuelle')     return 0.40;
  if (periodiciteTvaClient === 'trimestrielle') return 0.25;
  return 0.40;
}

// ── run ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n=== Chantier 3 lot 1 (a) — socle production (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {

    // ─── 1. Table dossier ────────────────────────────────────────────────────
    if (await tableExists(conn, 'dossier')) {
      console.log('  [SKIP] table dossier');
    } else {
      await conn.query(`
        CREATE TABLE dossier (
          id                          INT NOT NULL AUTO_INCREMENT,
          client_id                   INT NOT NULL,
          raison_sociale              VARCHAR(255) NOT NULL,
          siren                       VARCHAR(9) NULL,
          forme_juridique             VARCHAR(50) NULL,
          jour_cloture                TINYINT UNSIGNED NULL,
          mois_cloture                TINYINT UNSIGNED NULL,
          regime_tva                  ENUM('franchise','reel_simplifie','reel_normal_mensuel','reel_normal_trimestriel') NULL,
          classe                      ENUM('A','B','C') NULL,
          classe_forcee               ENUM('A','B','C') NULL,
          classe_forcee_motif         TEXT NULL,
          profils                     JSON NULL,
          score_risque                DECIMAL(3,2) NULL,
          score_complexite            DECIMAL(3,2) NULL,
          cotation_notes              JSON NULL,
          surclassements              JSON NULL,
          materialite                 INT UNSIGNED NULL,
          materialite_motif           TEXT NULL,
          ca_reference                INT UNSIGNED NULL,
          taux_tva_theorique          DECIMAL(4,3) NULL,
          fourchette_645_641_min      DECIMAL(6,4) NULL,
          fourchette_645_641_max      DECIMAL(6,4) NULL,
          jours_caisse_admis          INT UNSIGNED NULL,
          collaborateur_id            INT NULL,
          chef_de_mission_id          INT NULL,
          statut_annuaire             ENUM('non_inscrit','en_cours','inscrit') NOT NULL DEFAULT 'non_inscrit',
          plateforme_agreee           VARCHAR(200) NULL,
          mandat_pa_signe_le          DATE NULL,
          cotation_lab                ENUM('faible','standard','renforcee','elevee') NULL,
          date_derniere_cotation      DATE NULL,
          statut                      ENUM('actif','en_entree','en_sortie','clos') NOT NULL DEFAULT 'en_entree',
          cree_le                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          cree_par                    INT NULL,
          modifie_le                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          modifie_par                 INT NULL,
          archive_le                  TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_dossier_client (client_id),
          KEY idx_dossier_siren (siren),
          KEY idx_dossier_classe (classe),
          KEY idx_dossier_statut (statut),
          KEY idx_dossier_collab (collaborateur_id),
          KEY idx_dossier_cdm (chef_de_mission_id),
          CONSTRAINT fk_dossier_client FOREIGN KEY (client_id) REFERENCES clients(id),
          CONSTRAINT fk_dossier_collab FOREIGN KEY (collaborateur_id) REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_dossier_cdm    FOREIGN KEY (chef_de_mission_id) REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_dossier_cree_par     FOREIGN KEY (cree_par)     REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_dossier_modifie_par  FOREIGN KEY (modifie_par)  REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT ck_dossier_jour  CHECK (jour_cloture IS NULL OR (jour_cloture BETWEEN 1 AND 31)),
          CONSTRAINT ck_dossier_mois  CHECK (mois_cloture IS NULL OR (mois_cloture BETWEEN 1 AND 12))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table dossier');
    }

    // ─── 2. Extension ldm_missions ───────────────────────────────────────────
    await addColumn(conn, 'ldm_missions', 'dossier_id',
      'INT NULL', 'lettre_mission_id');
    await addColumn(conn, 'ldm_missions', 'nature',
      "ENUM('tenue','revision','presentation_comptes','declaratif','social','juridique','conseil') NULL", 'type_mission');
    await addColumn(conn, 'ldm_missions', 'periodicite',
      "ENUM('mensuelle','trimestrielle','semestrielle','annuelle','ponctuelle') NULL", 'nature');
    await addColumn(conn, 'ldm_missions', 'budget_temps_annuel',
      'INT UNSIGNED NULL', 'honoraires_ht');
    await addColumn(conn, 'ldm_missions', 'genere_production',
      'TINYINT(1) NOT NULL DEFAULT 1', 'budget_temps_annuel');
    await addColumn(conn, 'ldm_missions', 'statut_production',
      "ENUM('en_projet','active','suspendue','terminee') NOT NULL DEFAULT 'active'", 'genere_production');
    await addColumn(conn, 'ldm_missions', 'repartition_auto',
      'TINYINT(1) NOT NULL DEFAULT 0', 'statut_production');

    if (!await indexExists(conn, 'ldm_missions', 'fk_ldm_missions_dossier')) {
      await conn.query(`ALTER TABLE ldm_missions
        ADD CONSTRAINT fk_ldm_missions_dossier FOREIGN KEY (dossier_id) REFERENCES dossier(id) ON DELETE SET NULL`);
      console.log('  [ADD]  FK ldm_missions.dossier_id → dossier(id)');
    } else {
      console.log('  [SKIP] FK ldm_missions.dossier_id');
    }
    if (!await indexExists(conn, 'ldm_missions', 'idx_ldm_nature')) {
      await conn.query(`ALTER TABLE ldm_missions ADD INDEX idx_ldm_nature (nature)`);
      console.log('  [ADD]  index ldm_missions.nature');
    }

    // ─── 3. Mapping nature/periodicite/budget sur lignes existantes ──────────
    // Idempotence : on ne touche que les lignes où nature IS NULL.
    const [existing] = await conn.query(
      `SELECT lm.id, lm.type_mission, lm.libelle, lm.honoraires_ht, lm.nombre_heures_par_profil,
              lm.lettre_mission_id, c.periodicite_tva
         FROM ldm_missions lm
         LEFT JOIN lettres_mission l ON l.id = lm.lettre_mission_id
         LEFT JOIN clients c ON c.id = l.client_id
        WHERE lm.nature IS NULL`
    );
    let backfilled = 0;
    for (const row of existing) {
      // Les lignes mixtes seront splittées à l'étape suivante — on les marque
      // provisoirement (nature+budget) pour éviter de les re-traiter en cas de
      // re-run partiel avant split.
      const nature = mapNature(row.type_mission);
      let periodicite;
      if (nature === 'declaratif') {
        periodicite = mapPeriodiciteTva(row.periodicite_tva) || 'trimestrielle';
      } else {
        periodicite = defaultPeriodiciteFromNature(nature);
      }
      const budget = heuresJsonToMinutes(row.nombre_heures_par_profil);
      await conn.query(
        `UPDATE ldm_missions SET nature=?, periodicite=?, budget_temps_annuel=? WHERE id=?`,
        [nature, periodicite, budget, row.id]
      );
      backfilled++;
    }
    console.log(`  [SEED] ldm_missions : nature/periodicite/budget backfill = ${backfilled} ligne(s)`);

    // ─── 4. Split des lignes fiscales mixtes ─────────────────────────────────
    // Idempotence : si repartition_auto=1 existe déjà, on considère le split fait.
    const [[{ nb: alreadySplit }]] = await conn.query(
      `SELECT COUNT(*) AS nb FROM ldm_missions WHERE repartition_auto = 1`
    );
    if (alreadySplit > 0) {
      console.log(`  [SKIP] split lignes mixtes (déjà présent : ${alreadySplit} ligne(s) auto)`);
    } else {
      const mixed = existing.filter(isMixedFiscalLine);
      let created = 0;
      for (const row of mixed) {
        // Clé adaptative selon periodicite_tva du client (cf. splitTvaShare).
        const splitTva    = splitTvaShare(row.periodicite_tva);
        const splitAnnuel = 1 - splitTva;
        // Répartition : budget d'abord (unité pilote), honoraires ensuite selon
        // la même clé — le budget de temps pilote les alertes de dépassement,
        // les honoraires n'en sont qu'une conséquence analytique.
        const totalBudget = heuresJsonToMinutes(row.nombre_heures_par_profil);
        const tvaBudget    = Math.round(totalBudget * splitTva);
        const annuelBudget = totalBudget - tvaBudget; // conservation stricte du total
        const tvaHonoraires    = Math.round(Number(row.honoraires_ht) * splitTva    * 100) / 100;
        const annuelHonoraires = Math.round((Number(row.honoraires_ht) - tvaHonoraires) * 100) / 100;
        const tvaPeriod = mapPeriodiciteTva(row.periodicite_tva);

        // Recopie du JSON heures ventilé au prorata (arrondi à 2 décimales)
        let hjson = null;
        try {
          const src = typeof row.nombre_heures_par_profil === 'string'
            ? JSON.parse(row.nombre_heures_par_profil) : row.nombre_heures_par_profil;
          if (src) {
            const tva = {}, ann = {};
            for (const [k, v] of Object.entries(src)) {
              const nv = Number(v) || 0;
              tva[k] = Math.round(nv * splitTva    * 100) / 100;
              ann[k] = Math.round(nv * splitAnnuel * 100) / 100;
            }
            hjson = { tva, ann };
          }
        } catch { /* keep hjson null */ }

        // Ligne 1 — TVA récurrente
        await conn.query(
          `INSERT INTO ldm_missions
             (lettre_mission_id, type_mission, nature, periodicite,
              libelle, description, nombre_heures_par_profil, taux_par_profil,
              honoraires_ht, budget_temps_annuel, date_debut, date_fin, ordre,
              genere_production, statut_production, repartition_auto)
           SELECT lettre_mission_id, type_mission, 'declaratif', ?,
                  ?, description, ?, taux_par_profil,
                  ?, ?, date_debut, date_fin, ordre,
                  1, 'active', 1
             FROM ldm_missions WHERE id=?`,
          [tvaPeriod,
           'Déclarations TVA (issu du split — à valider)',
           hjson ? JSON.stringify(hjson.tva) : null,
           tvaHonoraires, tvaBudget, row.id]
        );

        // Ligne 2 — Fiscal annuel (liasse/CET)
        await conn.query(
          `INSERT INTO ldm_missions
             (lettre_mission_id, type_mission, nature, periodicite,
              libelle, description, nombre_heures_par_profil, taux_par_profil,
              honoraires_ht, budget_temps_annuel, date_debut, date_fin, ordre,
              genere_production, statut_production, repartition_auto)
           SELECT lettre_mission_id, type_mission, 'declaratif', 'annuelle',
                  ?, description, ?, taux_par_profil,
                  ?, ?, date_debut, date_fin, ordre,
                  1, 'active', 1
             FROM ldm_missions WHERE id=?`,
          ['Liasses fiscales et CET (issu du split — à valider)',
           hjson ? JSON.stringify(hjson.ann) : null,
           annuelHonoraires, annuelBudget, row.id]
        );

        // Suppression de la ligne mixte d'origine
        await conn.query(`DELETE FROM ldm_missions WHERE id=?`, [row.id]);
        created += 2;
      }
      console.log(`  [SEED] split lignes mixtes : ${mixed.length} ligne(s) mixte(s) → ${created} ligne(s) créée(s), repartition_auto=1`);
    }

    // ─── 5. Table production_periode ─────────────────────────────────────────
    if (await tableExists(conn, 'production_periode')) {
      console.log('  [SKIP] table production_periode');
    } else {
      await conn.query(`
        CREATE TABLE production_periode (
          id                          INT NOT NULL AUTO_INCREMENT,
          mission_id                  INT NOT NULL,
          dossier_id                  INT NOT NULL,
          numero                      TINYINT UNSIGNED NOT NULL,
          exercice                    SMALLINT UNSIGNED NOT NULL,
          date_debut                  DATE NOT NULL,
          date_fin                    DATE NOT NULL,
          date_echeance_interne       DATE NOT NULL,
          date_echeance_declarative   DATE NULL,
          statut                      ENUM('planifiee','en_cours','prete_pour_revue','revue_ok','cloturee') NOT NULL DEFAULT 'planifiee',
          responsable_id              INT NULL,
          date_mise_a_disposition     TIMESTAMP NULL DEFAULT NULL,
          revue_requise               TINYINT(1) NOT NULL DEFAULT 0,
          temps_budget                INT UNSIGNED NULL,
          temps_realise               INT UNSIGNED NOT NULL DEFAULT 0,
          cree_le                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          cree_par                    INT NULL,
          modifie_le                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          modifie_par                 INT NULL,
          archive_le                  TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_periode_mission_exercice_numero (mission_id, exercice, numero),
          KEY idx_periode_dossier (dossier_id),
          KEY idx_periode_echeance (date_echeance_interne),
          KEY idx_periode_statut (statut),
          KEY idx_periode_responsable (responsable_id),
          CONSTRAINT fk_periode_mission     FOREIGN KEY (mission_id)     REFERENCES ldm_missions(id) ON DELETE CASCADE,
          CONSTRAINT fk_periode_dossier     FOREIGN KEY (dossier_id)     REFERENCES dossier(id),
          CONSTRAINT fk_periode_responsable FOREIGN KEY (responsable_id) REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_periode_cree_par    FOREIGN KEY (cree_par)       REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_periode_modifie_par FOREIGN KEY (modifie_par)    REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT ck_periode_numero      CHECK (numero BETWEEN 1 AND 12),
          CONSTRAINT ck_periode_dates       CHECK (date_fin >= date_debut)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table production_periode');
    }

    // ─── 6. Table tache_modele ───────────────────────────────────────────────
    if (await tableExists(conn, 'tache_modele')) {
      console.log('  [SKIP] table tache_modele');
    } else {
      await conn.query(`
        CREATE TABLE tache_modele (
          code                        VARCHAR(3) NOT NULL,
          bloc                        ENUM('A','B','C','D','E','F') NOT NULL,
          ordre                       SMALLINT UNSIGNED NOT NULL,
          libelle                     VARCHAR(255) NOT NULL,
          diligence_attendue          TEXT NOT NULL,
          point_de_vigilance          TEXT NULL,
          obligatoire                 TINYINT(1) NOT NULL DEFAULT 0,
          profils_applicables         JSON NOT NULL,
          classes_applicables         JSON NOT NULL,
          code_temps_defaut           VARCHAR(3) NULL,
          cree_le                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          modifie_le                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          archive_le                  TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (code),
          KEY idx_tache_modele_bloc (bloc),
          KEY idx_tache_modele_ordre (ordre)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table tache_modele');
    }

    // ─── 7. Table production_tache ───────────────────────────────────────────
    if (await tableExists(conn, 'production_tache')) {
      console.log('  [SKIP] table production_tache');
    } else {
      await conn.query(`
        CREATE TABLE production_tache (
          id                          INT NOT NULL AUTO_INCREMENT,
          periode_id                  INT NOT NULL,
          tache_modele_code           VARCHAR(3) NOT NULL,
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
          UNIQUE KEY uq_prodtache_periode_code (periode_id, tache_modele_code),
          KEY idx_prodtache_statut (statut),
          KEY idx_prodtache_faitpar (fait_par),
          CONSTRAINT fk_prodtache_periode     FOREIGN KEY (periode_id)        REFERENCES production_periode(id) ON DELETE CASCADE,
          CONSTRAINT fk_prodtache_modele      FOREIGN KEY (tache_modele_code) REFERENCES tache_modele(code),
          CONSTRAINT fk_prodtache_faitpar     FOREIGN KEY (fait_par)          REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_prodtache_cree_par    FOREIGN KEY (cree_par)          REFERENCES utilisateurs(id) ON DELETE SET NULL,
          CONSTRAINT fk_prodtache_modifie_par FOREIGN KEY (modifie_par)       REFERENCES utilisateurs(id) ON DELETE SET NULL,
          -- RG-09 : motif_na obligatoire (≥ 10 caractères) si statut = NA.
          -- « NA » / « n/a » sont refusés au niveau applicatif car un CHECK MySQL
          -- ne peut pas normaliser la casse et les accents proprement.
          CONSTRAINT ck_prodtache_motif_na CHECK (
            statut <> 'NA' OR (motif_na IS NOT NULL AND CHAR_LENGTH(motif_na) >= 10)
          ),
          -- Antidatage interdit : fait_le est renseigné par le serveur au passage en F.
          CONSTRAINT ck_prodtache_fait_le CHECK (
            (statut = 'F' AND fait_le IS NOT NULL) OR (statut <> 'F')
          )
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  [ADD]  table production_tache');
    }

    console.log('\n=== Chantier 3 lot 1 (a) — OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
