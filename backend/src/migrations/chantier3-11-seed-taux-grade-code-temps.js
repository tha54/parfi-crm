'use strict';
/**
 * Chantier 3 (F) — seed taux_grade + code_temps depuis les CSV du dépôt.
 *
 * Rechargeable : ON DUPLICATE KEY UPDATE sur la PK. Ré-exécuter met les
 * référentiels à jour sans supprimer l'historique (les budget_ligne
 * référencent la ligne par sa PK, la modification du libellé/tarif ne
 * casse rien — et le taux appliqué est figé sur la ligne).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');
const { parse } = require('csv-parse/sync');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD manquant');
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB };

const SEED_DIR = path.join(__dirname, '..', '..', '..', 'docs-production', 'seed');

async function run() {
  console.log(`\n=== Seed taux_grade + code_temps (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {

    // ── taux_grade ──────────────────────────────────────────────────────
    const tgRaw = fs.readFileSync(path.join(SEED_DIR, 'taux_grade.csv'), 'utf8');
    const tgRows = parse(tgRaw, { columns: true, skip_empty_lines: true, trim: true });
    for (const r of tgRows) {
      await conn.query(
        `INSERT INTO taux_grade (grade, libelle, role_applicatif, taux_horaire_cible_eur, complexite_correspondante, valide_le)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           libelle=VALUES(libelle),
           role_applicatif=VALUES(role_applicatif),
           taux_horaire_cible_eur=VALUES(taux_horaire_cible_eur),
           complexite_correspondante=VALUES(complexite_correspondante),
           valide_le=VALUES(valide_le)`,
        [r.grade, r.libelle, r.role_applicatif, parseFloat(r.taux_horaire_cible_eur),
         r.complexite_correspondante && r.complexite_correspondante.trim() !== ''
           ? r.complexite_correspondante : null,
         r.valide_le]
      );
    }
    console.log(`  [UPSERT] taux_grade : ${tgRows.length} ligne(s)`);

    // ── code_temps ──────────────────────────────────────────────────────
    const ctRaw = fs.readFileSync(path.join(SEED_DIR, 'code_temps.csv'), 'utf8');
    const ctRows = parse(ctRaw, { columns: true, skip_empty_lines: true, trim: true });
    const bool = v => String(v).toLowerCase() === 'true' ? 1 : 0;
    for (const r of ctRows) {
      await conn.query(
        `INSERT INTO code_temps
           (code, famille_cle, famille_libelle, libelle, regime_defaut,
            exige_dossier, saisie_groupee, exclu_ratio_productivite, donnee_sensible, actif)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           famille_cle=VALUES(famille_cle),
           famille_libelle=VALUES(famille_libelle),
           libelle=VALUES(libelle),
           regime_defaut=VALUES(regime_defaut),
           exige_dossier=VALUES(exige_dossier),
           saisie_groupee=VALUES(saisie_groupee),
           exclu_ratio_productivite=VALUES(exclu_ratio_productivite),
           donnee_sensible=VALUES(donnee_sensible),
           actif=VALUES(actif)`,
        [r.code, r.famille_cle, r.famille_libelle, r.libelle,
         r.regime_defaut || null,
         bool(r.exige_dossier), bool(r.saisie_groupee),
         bool(r.exclu_ratio_productivite), bool(r.donnee_sensible),
         bool(r.actif)]
      );
    }
    console.log(`  [UPSERT] code_temps : ${ctRows.length} ligne(s)`);

    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
