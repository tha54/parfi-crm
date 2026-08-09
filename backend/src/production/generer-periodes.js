'use strict';
/**
 * Chantier 3 — Lot 1 étape (1) : génération des périodes de production (RG-03).
 *
 * Deux fonctions exportées :
 *
 *   computePeriodesPourMission(mission, dossier, options)
 *       Fonction pure. Retourne la liste des périodes à créer pour une
 *       (mission, dossier), en respectant :
 *         - le plancher DATE_DEBUT_PRODUCTION (aucune rétro-génération) ;
 *         - la périodicité (mensuelle/trimestrielle/semestrielle/annuelle/ponctuelle) ;
 *         - l'exercice comptable du dossier (jour_cloture / mois_cloture) ;
 *         - l'horizon d'anticipation (2 périodes en avance par défaut, spec RG-03) ;
 *         - la fenêtre [mission.date_debut, mission.date_fin].
 *       Ne fait aucune requête ni aucun effet de bord.
 *
 *   genererPeriodes(pool, options) → { periodesCreees, periodesExistantes,
 *                                       tachesCreees, missionsExaminees, missionsIgnorees }
 *       Orchestrateur DB. Idempotent :
 *         - la contrainte UNIQUE (mission_id, exercice, numero) empêche les doublons ;
 *         - les tâches ne sont instanciées qu'à la CRÉATION d'une période, jamais
 *           lors d'un rerun sur période existante. Une tâche passée à F, EC ou NA
 *           ne peut donc pas être réinstanciée en N. C'est le seul comportement
 *           correct : la re-création d'une tâche déjà renseignée ferait perdre
 *           l'horodatage `fait_le` et un pan entier de la piste probante (§ 7).
 *
 * Plancher DATE_DEBUT_PRODUCTION (2026-09-01 par défaut) :
 *   La spec impose le module comme source de vérité "à partir du". Rétro-générer
 *   des périodes correspondant à du travail réellement effectué mais jamais
 *   tracé dans l'outil produirait des milliers de périodes vides et rendrait
 *   tous les indicateurs illisibles dès le premier jour.
 */

// ═══════════════════════════════════════════════════════════════════════════
//   Constantes
// ═══════════════════════════════════════════════════════════════════════════

const DATE_DEBUT_PRODUCTION_DEFAUT = '2026-09-01';

const STEP_MOIS = {
  mensuelle:     1,
  trimestrielle: 3,
  semestrielle:  6,
  annuelle:     12,
  // 'ponctuelle' : pas de génération périodique
};

// ═══════════════════════════════════════════════════════════════════════════
//   Utilitaires de date (UTC, sans dépendance externe)
// ═══════════════════════════════════════════════════════════════════════════

function parseYmd(s) {
  if (s instanceof Date) return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmtYmd(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function ajouterJours(dt, n) {
  const r = new Date(dt.getTime()); r.setUTCDate(r.getUTCDate() + n); return r;
}
function ajouterMois(dt, n) {
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + n;
  const d = dt.getUTCDate();
  const cible = new Date(Date.UTC(y, m, d));
  // Débordement (ex. 31 janvier + 1 mois → 3 mars) : rabattre sur dernier jour du mois cible
  const moisAttendu = ((m % 12) + 12) % 12;
  if (cible.getUTCMonth() !== moisAttendu) {
    return new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth(), 0));
  }
  return cible;
}
function maxDate(a, b) { return a.getTime() >= b.getTime() ? a : b; }
function minDate(a, b) { return a.getTime() <= b.getTime() ? a : b; }

// Premier jour de l'exercice contenant `dt`, sachant que l'exercice E se clôt
// le clotureJour/clotureMois/E. L'année de clôture est aussi l'`exercice`.
function debutExerciceContenant(dt, clotureJour, clotureMois) {
  const y = dt.getUTCFullYear();
  const cloture = new Date(Date.UTC(y, clotureMois - 1, clotureJour));
  const exercice = (dt.getTime() <= cloture.getTime()) ? y : y + 1;
  // Début = lendemain de la clôture précédente
  const clotureN_moins_1 = new Date(Date.UTC(exercice - 1, clotureMois - 1, clotureJour));
  return { exercice, debut: ajouterJours(clotureN_moins_1, 1) };
}

// ═══════════════════════════════════════════════════════════════════════════
//   RG-04 (échéance interne) et RG-05 (revue requise)
// ═══════════════════════════════════════════════════════════════════════════

// RG-04 : date_fin + 20 jours, ajustée au jour ouvré précédent si samedi/dimanche.
function echeanceInterne(dateFin) {
  let e = ajouterJours(dateFin, 20);
  while (e.getUTCDay() === 0 || e.getUTCDay() === 6) e = ajouterJours(e, -1);
  return e;
}

// RG-05 : vrai si classe='A' ; classe='B' et numero%3===0 ; classe='C' et numero%6===0 ;
//         vrai dans tous les cas pour la dernière période de l'exercice.
function revueRequise(classe, numero, estDerniere) {
  if (estDerniere) return true;
  if (classe === 'A') return true;
  if (classe === 'B' && numero % 3 === 0) return true;
  if (classe === 'C' && numero % 6 === 0) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
//   Fonction pure : liste des périodes à créer
// ═══════════════════════════════════════════════════════════════════════════

function computePeriodesPourMission(mission, dossier, options = {}) {
  const step = STEP_MOIS[mission.periodicite];
  if (!step) return []; // 'ponctuelle' ou périodicité inconnue

  // Compteur d'écartement par le plancher — permet à l'orchestrateur de
  // reporter combien de périodes historiques n'ont PAS été créées. Attaché
  // au tableau via un symbole non énumérable pour ne pas polluer les tests
  // sur la longueur/le contenu.
  let ecarteesPlancher = 0;

  const today                = parseYmd(options.today || new Date());
  const dateDebutProduction  = parseYmd(options.dateDebutProduction || DATE_DEBUT_PRODUCTION_DEFAUT);
  const horizonPeriodes      = Number.isFinite(options.horizonPeriodes) ? options.horizonPeriodes : 2;

  // Fenêtre effective : le plancher DATE_DEBUT_PRODUCTION est plus fort que
  // mission.date_debut. Fin = min(fin mission, today + horizon * stepMois).
  const missionDebut = parseYmd(mission.date_debut);
  const missionFin   = mission.date_fin ? parseYmd(mission.date_fin) : null;
  const horizonFin   = ajouterMois(today, horizonPeriodes * step);

  const fenetreDebut = maxDate(missionDebut, dateDebutProduction);
  const fenetreFin   = missionFin ? minDate(missionFin, horizonFin) : horizonFin;

  if (fenetreFin.getTime() < fenetreDebut.getTime()) return [];

  const clotureJour = dossier.jour_cloture || 31;
  const clotureMois = dossier.mois_cloture || 12;
  const nbPeriodesParExercice = 12 / step; // 12, 4, 2, 1

  const periodes = [];

  // On itère par exercice, en démarrant à celui contenant fenetreDebut.
  let ex = debutExerciceContenant(fenetreDebut, clotureJour, clotureMois);

  while (ex.debut.getTime() <= fenetreFin.getTime()) {
    for (let numero = 1; numero <= nbPeriodesParExercice; numero++) {
      const dateDebut = ajouterMois(ex.debut, (numero - 1) * step);
      const dateFin   = ajouterJours(ajouterMois(ex.debut, numero * step), -1);

      // Filtre 1 : la période doit intersecter la fenêtre.
      if (dateFin.getTime() < fenetreDebut.getTime()) continue;
      if (dateDebut.getTime() > fenetreFin.getTime()) break;

      // Filtre 2 : plancher DATE_DEBUT_PRODUCTION — aucune période dont le
      // début est antérieur au plancher, même partielle.
      if (dateDebut.getTime() < dateDebutProduction.getTime()) { ecarteesPlancher++; continue; }

      const estDerniere = (numero === nbPeriodesParExercice);
      periodes.push({
        mission_id:            mission.id,
        dossier_id:            dossier.id,
        numero,
        exercice:              ex.exercice,
        date_debut:            fmtYmd(dateDebut),
        date_fin:              fmtYmd(dateFin),
        date_echeance_interne: fmtYmd(echeanceInterne(dateFin)),
        revue_requise:         revueRequise(dossier.classe, numero, estDerniere) ? 1 : 0,
        temps_budget:          Math.round((mission.budget_temps_annuel || 0) / nbPeriodesParExercice),
      });
    }
    // Passage à l'exercice suivant : début = clôture actuelle + 1 jour.
    const finExercice = new Date(Date.UTC(ex.exercice, clotureMois - 1, clotureJour));
    ex = { exercice: ex.exercice + 1, debut: ajouterJours(finExercice, 1) };
  }

  Object.defineProperty(periodes, 'ecarteesPlancher', { value: ecarteesPlancher, enumerable: false });
  return periodes;
}

// ═══════════════════════════════════════════════════════════════════════════
//   Orchestrateur DB
// ═══════════════════════════════════════════════════════════════════════════

// SELECT des missions candidates : actives, générant de la production, avec un
// dossier rattaché (sans dossier, on ne peut pas instancier les tâches).
async function chargerMissionsCandidates(pool, missionId) {
  const where = [
    "m.genere_production = 1",
    "m.statut_production = 'active'",
    "m.dossier_id IS NOT NULL",
    "m.periodicite IS NOT NULL",
  ];
  const params = [];
  if (missionId) { where.push("m.id = ?"); params.push(missionId); }

  const [rows] = await pool.query(
    `SELECT m.id, m.dossier_id, m.periodicite, m.date_debut, m.date_fin,
            m.budget_temps_annuel,
            d.jour_cloture, d.mois_cloture, d.classe, d.profils, d.archive_le
       FROM ldm_missions m
       JOIN dossier d ON d.id = m.dossier_id
      WHERE ${where.join(' AND ')} AND d.archive_le IS NULL`,
    params
  );
  return rows;
}

// Instancie les tâches applicables sur une nouvelle période. Idempotent par
// la contrainte uq_prodtache_periode_code, mais on n'appelle cette fonction
// qu'à la CRÉATION effective d'une période — jamais sur période existante.
async function instancierTaches(pool, periodeId, dossier) {
  const profils = normaliserJson(dossier.profils) || ['T'];
  const classe  = dossier.classe;
  if (!classe) return 0;

  // Applicabilité : la tâche est applicable si profils_applicables contient "T"
  // OU intersecte les profils du dossier ; ET classes_applicables contient
  // la classe du dossier.
  const [modeles] = await pool.query(
    `SELECT code, profils_applicables, classes_applicables
       FROM tache_modele
      WHERE archive_le IS NULL
        AND JSON_CONTAINS(classes_applicables, JSON_QUOTE(?))`,
    [classe]
  );

  const codesApplicables = modeles.filter(tm => {
    const pa = normaliserJson(tm.profils_applicables) || [];
    if (pa.includes('T')) return true;
    return pa.some(p => profils.includes(p));
  }).map(tm => tm.code);

  if (codesApplicables.length === 0) return 0;

  // INSERT en une passe. La contrainte UNIQUE (periode_id, tache_modele_code)
  // ferait office de garde-fou en cas de rerun sur la même période, mais on
  // n'atteint jamais ce chemin.
  const values = codesApplicables.map(() => '(?, ?, "N")').join(',');
  const params = codesApplicables.flatMap(code => [periodeId, code]);
  const [r] = await pool.query(
    `INSERT INTO production_tache (periode_id, tache_modele_code, statut) VALUES ${values}`,
    params
  );
  return r.affectedRows;
}

function normaliserJson(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

async function genererPeriodes(pool, options = {}) {
  const missions = await chargerMissionsCandidates(pool, options.missionId);
  let periodesCreees      = 0;
  let periodesExistantes  = 0;
  let tachesCreees        = 0;
  let missionsIgnorees    = 0;
  let periodesEcarteesPlancher = 0;

  for (const m of missions) {
    if (!m.date_debut) { missionsIgnorees++; continue; }

    const periodes = computePeriodesPourMission(m, {
      id: m.dossier_id,
      jour_cloture: m.jour_cloture,
      mois_cloture: m.mois_cloture,
      classe: m.classe,
      profils: m.profils,
    }, options);
    periodesEcarteesPlancher += periodes.ecarteesPlancher || 0;

    for (const p of periodes) {
      // Insertion défensive : on ne peut pas se contenter d'un INSERT IGNORE
      // sans distinguer création et existence — le compteur `periodesCreees`
      // sert de garantie d'idempotence dans les tests.
      const [check] = await pool.query(
        `SELECT id FROM production_periode WHERE mission_id=? AND exercice=? AND numero=? LIMIT 1`,
        [p.mission_id, p.exercice, p.numero]
      );
      if (check.length) { periodesExistantes++; continue; }

      const [r] = await pool.query(
        `INSERT INTO production_periode
           (mission_id, dossier_id, numero, exercice, date_debut, date_fin,
            date_echeance_interne, statut, revue_requise, temps_budget)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'planifiee', ?, ?)`,
        [p.mission_id, p.dossier_id, p.numero, p.exercice,
         p.date_debut, p.date_fin, p.date_echeance_interne,
         p.revue_requise, p.temps_budget]
      );
      periodesCreees++;

      // Instanciation des tâches — uniquement à la création. C'est ici que se
      // joue la non-réinstanciation : une période existante saute le bloc.
      tachesCreees += await instancierTaches(pool, r.insertId, {
        classe: m.classe, profils: m.profils,
      });
    }
  }

  return {
    missionsExaminees: missions.length,
    missionsIgnorees,
    periodesCreees,
    periodesExistantes,
    periodesEcarteesPlancher,
    tachesCreees,
  };
}

module.exports = {
  computePeriodesPourMission,
  genererPeriodes,
  DATE_DEBUT_PRODUCTION_DEFAUT,
};
