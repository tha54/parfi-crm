'use strict';
/**
 * Chantier 3 (F) — moteur budget_ligne.
 *
 * Fonctions pures (occurrencesParAn, minutesAnnuelles, montantHt) et
 * fonctions d'orchestration DB (creerLigne, mettreAJourLigne, supprimerLigne,
 * recalculerHonorairesMission).
 *
 * Deux invariants :
 *   - `taux_horaire_applique` est lu depuis `taux_grade` à la CRÉATION
 *     d'une ligne et **jamais réécrit** ensuite, sauf par la commande
 *     explicite `backend/src/jobs/recalculer-taux.js` qui refuse sur LDM
 *     signée ou active. Dénormalisation assumée, même principe que
 *     `gravite` sur `alerte` (spec § 11 point 3).
 *   - `ldm_missions.honoraires_ht` est un cache dénormalisé, maintenu à
 *     chaque création/modification/suppression de ligne. Reconstructible
 *     via `backend/src/jobs/reconstruire-honoraires.js`.
 */

const pool = require('../config/db');

// ── Fonctions pures ─────────────────────────────────────────────────────────

const OCCURRENCES = {
  mensuelle:     12,
  trimestrielle:  4,
  semestrielle:   2,
  annuelle:       1,
  ponctuelle:     1,
};

function occurrencesParAn(periodicite) {
  const n = OCCURRENCES[periodicite];
  if (!n) throw new Error(`Périodicité inconnue : ${periodicite}`);
  return n;
}

function minutesAnnuelles(quantiteMinutes, periodicite) {
  return quantiteMinutes * occurrencesParAn(periodicite);
}

function montantHt(minutes, tauxHoraire) {
  // ROUND(minutes / 60 × taux, 2). JS n'a pas de ROUND banker exact —
  // Math.round((x + Number.EPSILON) * 100) / 100 couvre les décimales
  // usuelles (55 €/h, 100 €/h, 70 €/h) sans dérive flottante visible.
  const brut = (minutes / 60) * tauxHoraire;
  return Math.round((brut + Number.EPSILON) * 100) / 100;
}

// ── Orchestration DB ────────────────────────────────────────────────────────

async function lireTauxGrade(conn, grade) {
  const [[row]] = await conn.query(
    `SELECT taux_horaire_cible_eur FROM taux_grade WHERE grade = ?`,
    [grade]
  );
  if (!row) throw new Error(`Grade inconnu dans taux_grade : ${grade}`);
  return parseFloat(row.taux_horaire_cible_eur);
}

async function recalculerHonorairesMission(conn, missionId) {
  const [[r]] = await conn.query(
    `SELECT COALESCE(SUM(montant_ht), 0) AS total FROM budget_ligne WHERE mission_id = ?`,
    [missionId]
  );
  await conn.query(
    `UPDATE ldm_missions SET honoraires_ht = ? WHERE id = ?`,
    [r.total, missionId]
  );
  return parseFloat(r.total);
}

async function creerLigne(connOrPool, {
  missionId, codeTemps, grade, quantiteMinutes, periodicite,
  poste = 'production', origine = 'saisie', libelle = null, ordre = 0, creePar = null,
}) {
  const conn = connOrPool || pool;

  const taux = await lireTauxGrade(conn, grade);
  const minAnn = minutesAnnuelles(quantiteMinutes, periodicite);
  const montant = montantHt(minAnn, taux);

  const [ins] = await conn.query(
    `INSERT INTO budget_ligne
       (mission_id, code_temps, grade, quantite_minutes, periodicite,
        minutes_annuelles, taux_horaire_applique, montant_ht,
        poste, origine, libelle, ordre, cree_par)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [missionId, codeTemps, grade, quantiteMinutes, periodicite,
     minAnn, taux, montant, poste, origine, libelle, ordre, creePar]
  );

  await recalculerHonorairesMission(conn, missionId);
  return ins.insertId;
}

async function mettreAJourLigne(connOrPool, ligneId, {
  quantiteMinutes, periodicite, libelle, ordre, modifiePar = null,
}) {
  const conn = connOrPool || pool;
  const [[ligne]] = await conn.query(
    `SELECT mission_id, taux_horaire_applique, quantite_minutes, periodicite
       FROM budget_ligne WHERE id = ?`, [ligneId]
  );
  if (!ligne) throw new Error(`budget_ligne #${ligneId} introuvable`);

  const q = quantiteMinutes != null ? quantiteMinutes : ligne.quantite_minutes;
  const p = periodicite    != null ? periodicite     : ligne.periodicite;
  const taux = parseFloat(ligne.taux_horaire_applique); // JAMAIS réécrit ici
  const minAnn = minutesAnnuelles(q, p);
  const montant = montantHt(minAnn, taux);

  await conn.query(
    `UPDATE budget_ligne
        SET quantite_minutes = ?, periodicite = ?, minutes_annuelles = ?,
            montant_ht = ?, libelle = COALESCE(?, libelle), ordre = COALESCE(?, ordre),
            modifie_par = ?
      WHERE id = ?`,
    [q, p, minAnn, montant, libelle ?? null, ordre ?? null, modifiePar, ligneId]
  );

  await recalculerHonorairesMission(conn, ligne.mission_id);
}

async function supprimerLigne(connOrPool, ligneId) {
  const conn = connOrPool || pool;
  const [[ligne]] = await conn.query(
    `SELECT mission_id FROM budget_ligne WHERE id = ?`, [ligneId]
  );
  if (!ligne) return;
  await conn.query(`DELETE FROM budget_ligne WHERE id = ?`, [ligneId]);
  await recalculerHonorairesMission(conn, ligne.mission_id);
}

module.exports = {
  occurrencesParAn,
  minutesAnnuelles,
  montantHt,
  creerLigne,
  mettreAJourLigne,
  supprimerLigne,
  recalculerHonorairesMission,
};
