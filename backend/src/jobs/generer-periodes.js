#!/usr/bin/env node
'use strict';
/**
 * Job CLI relançable à la main — RG-03 génération des périodes.
 *
 * Le scheduler l'exécute à 05:00 chaque nuit (backend/src/scheduler.js). Cette
 * commande est un point d'entrée manuel pour reprises, exécutions ponctuelles
 * ou tests en environnement. Aucun effet de bord destructif : idempotent par
 * construction (contrainte UNIQUE mission_id/exercice/numero + non-réinstanciation
 * des tâches sur période existante).
 *
 * Options :
 *   --horizon N                  Nombre de périodes à anticiper (défaut 2).
 *   --date-debut-production D    Plancher YYYY-MM-DD (défaut 2026-09-01).
 *   --today YYYY-MM-DD           Date fictive pour les reprises (défaut = aujourd'hui).
 *   --mission-id N               Restreindre à une mission (pour reprise ciblée).
 *   --db NAME                    Base cible (défaut : DB_NAME de .env, en général `parfi`).
 *
 * Usage :
 *   node src/jobs/generer-periodes.js
 *   node src/jobs/generer-periodes.js --horizon 4 --today 2026-10-01
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

// Permettre --db pour cibler parfi_test depuis la CLI.
const argv = process.argv.slice(2);
const dbArg = takeOption('--db');
if (dbArg) process.env.DB_NAME = dbArg;

const pool = require('../config/db');
const { genererPeriodes, DATE_DEBUT_PRODUCTION_DEFAUT } = require('../production/generer-periodes');

function takeOption(name) {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  return argv[i + 1];
}

async function main() {
  const options = {};
  const horizon = takeOption('--horizon');
  const ddp     = takeOption('--date-debut-production');
  const today   = takeOption('--today');
  const missionId = takeOption('--mission-id');

  if (horizon != null)   options.horizonPeriodes     = Number(horizon);
  if (ddp != null)       options.dateDebutProduction = ddp;
  if (today != null)     options.today               = today;
  if (missionId != null) options.missionId           = Number(missionId);

  const t0 = Date.now();
  console.log(`[generer-periodes] début — db=${process.env.DB_NAME}, plancher=${options.dateDebutProduction || DATE_DEBUT_PRODUCTION_DEFAUT}, horizon=${options.horizonPeriodes ?? 2}${options.today ? `, today=${options.today}` : ''}${options.missionId ? `, mission=${options.missionId}` : ''}`);

  const r = await genererPeriodes(pool, options);
  const ms = Date.now() - t0;
  console.log(`[generer-periodes] fin — ${r.periodesCreees} période(s) créée(s), ${r.tachesCreees} tâche(s) instanciée(s), ${r.periodesExistantes} période(s) déjà présente(s), ${r.periodesEcarteesPlancher} période(s) écartée(s) par le plancher, ${r.missionsIgnorees}/${r.missionsExaminees} mission(s) ignorée(s) — ${ms} ms`);
}

main()
  .then(() => pool.end())
  .catch(async e => { console.error(e); await pool.end(); process.exit(1); });
