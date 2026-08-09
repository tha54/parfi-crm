#!/usr/bin/env node
'use strict';
/**
 * reconstruire-honoraires — recalcule ldm_missions.honoraires_ht = SUM des
 * montant_ht des budget_ligne, pour une mission ou pour toutes.
 *
 * Utilisation attendue : divergence détectée entre cache et source (import
 * exceptionnel, incident de production, migration de données). N'écrit
 * jamais sur budget_ligne, uniquement sur le cache honoraires_ht.
 *
 * Usage :
 *   node reconstruire-honoraires.js [--mission-id N] [--db parfi_test]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const argv = process.argv.slice(2);
function opt(name) {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1];
}
const dbArg = opt('--db');
if (dbArg) process.env.DB_NAME = dbArg;

const pool = require('../config/db');
const { recalculerHonorairesMission } = require('../production/budget');

async function main() {
  const missionIdArg = opt('--mission-id');
  const missions = missionIdArg
    ? [{ id: Number(missionIdArg) }]
    : (await pool.query(`SELECT id FROM ldm_missions`))[0];

  console.log(`Reconstruction honoraires_ht sur ${missions.length} mission(s)…`);
  let ok = 0, err = 0;
  for (const m of missions) {
    try {
      await recalculerHonorairesMission(pool, m.id);
      ok++;
    } catch (e) {
      console.error(`  mission #${m.id} : ${e.message}`);
      err++;
    }
  }
  console.log(`Terminé — ${ok} OK, ${err} erreur(s).`);
}

main()
  .then(() => pool.end())
  .catch(async e => { console.error(e); await pool.end(); process.exit(1); });
