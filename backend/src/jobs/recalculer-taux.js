#!/usr/bin/env node
'use strict';
/**
 * recalculer-taux — met à jour taux_horaire_applique et montant_ht des
 * lignes budget_ligne d'une mission à partir des taux actuels de taux_grade.
 *
 * Sécurité : REFUSE de s'exécuter si la lettre de mission qui porte la
 * mission a un statut `signee`, `active`, `resiliee`, `echue`, `annulee`
 * ou `archivee`. Un contrat exécuté ou en cours d'exécution ne peut pas
 * voir ses honoraires modifiés a posteriori — c'est exactement ce que le
 * figeage de taux_horaire_applique vise à empêcher.
 *
 * Usage : node recalculer-taux.js --mission-id N [--db parfi_test]
 * Sortie : exit 0 = OK, exit != 0 = refus ou erreur.
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
const { minutesAnnuelles, montantHt, recalculerHonorairesMission } = require('../production/budget');

const STATUTS_INTOUCHABLES = new Set([
  'signee', 'active', 'resiliee', 'echue', 'annulee', 'archivee',
]);

async function main() {
  const missionId = Number(opt('--mission-id'));
  if (!missionId) {
    console.error('Usage : node recalculer-taux.js --mission-id N [--db parfi_test]');
    process.exit(2);
  }

  const [[m]] = await pool.query(
    `SELECT m.id, l.numero AS ldm_numero, l.statut AS ldm_statut
       FROM ldm_missions m
       JOIN lettres_mission l ON l.id = m.lettre_mission_id
      WHERE m.id = ?`,
    [missionId]
  );
  if (!m) {
    console.error(`Mission #${missionId} introuvable`);
    process.exit(1);
  }
  if (STATUTS_INTOUCHABLES.has(m.ldm_statut)) {
    console.error(
      `REFUS : LDM ${m.ldm_numero} en statut "${m.ldm_statut}" — les taux d'une lettre `
      + `de mission signée, active ou terminée ne peuvent pas être modifiés a posteriori.`
    );
    process.exit(1);
  }

  const [lignes] = await pool.query(
    `SELECT bl.id, bl.grade, bl.quantite_minutes, bl.periodicite,
            tg.taux_horaire_cible_eur AS taux_cible
       FROM budget_ligne bl
       JOIN taux_grade tg ON tg.grade = bl.grade
      WHERE bl.mission_id = ?`,
    [missionId]
  );

  let modifiees = 0;
  for (const l of lignes) {
    const taux = parseFloat(l.taux_cible);
    const minAnn = minutesAnnuelles(l.quantite_minutes, l.periodicite);
    const montant = montantHt(minAnn, taux);
    await pool.query(
      `UPDATE budget_ligne
          SET taux_horaire_applique = ?, minutes_annuelles = ?, montant_ht = ?
        WHERE id = ?`,
      [taux, minAnn, montant, l.id]
    );
    modifiees++;
  }

  await recalculerHonorairesMission(pool, missionId);

  console.log(`OK — ${modifiees} ligne(s) recalculée(s) sur mission #${missionId} (LDM ${m.ldm_numero} statut=${m.ldm_statut})`);
  process.exit(0);
}

main()
  .then(() => pool.end())
  .catch(async e => { console.error(e.message); await pool.end(); process.exit(1); });
