/**
 * Chantier 3 — Lot 1 étape (1) : job de génération des périodes (RG-03).
 *
 * Tests écrits avant l'implémentation. Ils couvrent explicitement :
 *   1. Idempotence : trois exécutions successives ne créent aucun doublon.
 *   2. Aucune réinstanciation des tâches déjà renseignées sur une période existante.
 *   3. Mensuelle → 12 périodes / exercice, trimestrielle → 4, annuelle → 1.
 *   4. genere_production=false, mission suspendue ou terminée → aucune génération.
 *   5. Plancher DATE_DEBUT_PRODUCTION (2026-09-01) : rien avant.
 *   6. Clôture au 30/06 : numérotation et exercice corrects.
 *   7. Instanciation des tâches conformes aux profils et à la classe du dossier,
 *      y compris avec les valeurs d'amorçage (classe='B', profils=['T']).
 *
 * Les fixtures sont préfixées par __TEST_PERIODES__ / __TEST_CLIENT__ afin de
 * ne pas polluer les données réelles, et sont nettoyées en beforeEach/afterAll.
 * Base : celle configurée dans backend/.env (par convention parfi_test).
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
// Force la base de test AVANT tout require susceptible d'instancier le pool.
// db.js lit process.env.DB_NAME au chargement du module.
process.env.DB_NAME = process.env.DB_NAME_TEST || 'parfi_test';

const pool = require('../config/db');
const {
  computePeriodesPourMission,
  genererPeriodes,
  DATE_DEBUT_PRODUCTION_DEFAUT,
} = require('../production/generer-periodes');

// ─── Constantes de test ────────────────────────────────────────────────────
const TAG      = '__TEST_PERIODES__';
const TAG_CLI  = '__TEST_CLIENT_PERIODES__';
const TODAY    = '2026-12-31'; // point fixe pour toutes les évaluations
const HORIZON  = 2;            // 2 périodes en avance, comme la spec

// ─── Fixtures ──────────────────────────────────────────────────────────────
async function truncateTest() {
  // Ordre : d'abord ce qui pointe vers les périodes, puis périodes, puis missions,
  // puis LM, puis dossier, puis client. Aucun DELETE sur des données non taggées.
  await pool.query(`DELETE pt FROM production_tache pt
                      JOIN production_periode p ON p.id = pt.periode_id
                      JOIN dossier d            ON d.id = p.dossier_id
                      JOIN clients c            ON c.id = d.client_id
                     WHERE c.nom LIKE ?`, [`${TAG_CLI}%`]);
  await pool.query(`DELETE p FROM production_periode p
                      JOIN dossier d ON d.id = p.dossier_id
                      JOIN clients c ON c.id = d.client_id
                     WHERE c.nom LIKE ?`, [`${TAG_CLI}%`]);
  await pool.query(`DELETE m FROM ldm_missions m
                      JOIN lettres_mission l ON l.id = m.lettre_mission_id
                     WHERE l.numero LIKE ?`, [`${TAG}%`]);
  await pool.query(`DELETE FROM lettres_mission WHERE numero LIKE ?`, [`${TAG}%`]);
  await pool.query(`DELETE d FROM dossier d
                      JOIN clients c ON c.id = d.client_id
                     WHERE c.nom LIKE ?`, [`${TAG_CLI}%`]);
  await pool.query(`DELETE FROM clients WHERE nom LIKE ?`, [`${TAG_CLI}%`]);
}

async function purgeContactTest() {
  await pool.query(`DELETE FROM contacts WHERE raisonSociale = ?`, [TAG_CLI]);
}

async function creerContactMinimal() {
  // Prérequis pour lettres_mission.contactId NOT NULL. Contact taggé et
  // réutilisé entre les tests (le tag permet le nettoyage global).
  const [existing] = await pool.query(
    `SELECT id FROM contacts WHERE raisonSociale = ? LIMIT 1`, [TAG_CLI]
  );
  if (existing.length) return existing[0].id;
  const [r] = await pool.query(
    `INSERT INTO contacts (type, raisonSociale) VALUES ('client', ?)`, [TAG_CLI]
  );
  return r.insertId;
}

async function creerFixture({
  suffix,               // identifiant unique dans le test (évite les collisions)
  jourCloture = 31,
  moisCloture = 12,
  periodicite = 'mensuelle',
  natureMission = 'tenue',
  genereProduction = 1,
  statutProduction = 'active',
  dateDebutMission = '2026-01-01',
  dateFinMission = null,
  classeDossier = 'B',
  profilsDossier = ['T'],
}) {
  const contactId = await creerContactMinimal();

  // Client de test (marqué)
  const [rc] = await pool.query(
    `INSERT INTO clients (nom, type, regime, actif) VALUES (?, 'BIC', 'mensuel', 1)`,
    [`${TAG_CLI}${suffix}`]
  );
  const clientId = rc.insertId;

  // Dossier lié
  const [rd] = await pool.query(
    `INSERT INTO dossier
       (client_id, raison_sociale, jour_cloture, mois_cloture,
        classe, profils, cotation_faite, materialite, statut)
     VALUES (?, ?, ?, ?, ?, ?, 0, 500, 'actif')`,
    [clientId, `${TAG_CLI}${suffix}`, jourCloture, moisCloture,
     classeDossier, JSON.stringify(profilsDossier)]
  );
  const dossierId = rd.insertId;

  // Lettre de mission
  const [rl] = await pool.query(
    `INSERT INTO lettres_mission
       (numero, contactId, statut, typeMission, montantHonorairesHT, client_id)
     VALUES (?, ?, 'active', 'tenue_comptable', 12000, ?)`,
    [`${TAG}${suffix}`, contactId, clientId]
  );
  const lmId = rl.insertId;

  // Ligne de mission (au sens spec)
  const [rm] = await pool.query(
    `INSERT INTO ldm_missions
       (lettre_mission_id, dossier_id, type_mission, nature, periodicite, libelle,
        honoraires_ht, budget_temps_annuel, genere_production, statut_production,
        date_debut, date_fin, ordre)
     VALUES (?, ?, 'tenue_comptable', ?, ?, ?, 12000, 6000, ?, ?, ?, ?, 1)`,
    [lmId, dossierId, natureMission, periodicite, `${TAG}${suffix}`,
     genereProduction, statutProduction, dateDebutMission, dateFinMission]
  );
  return { clientId, dossierId, lmId, missionId: rm.insertId };
}

// ─── beforeAll / afterAll ──────────────────────────────────────────────────
beforeEach(async () => { await truncateTest(); });
afterAll(async () => { await truncateTest(); await purgeContactTest(); await pool.end(); });

// ═══════════════════════════════════════════════════════════════════════════
//   Tests unitaires — computePeriodesPourMission (fonction pure)
// ═══════════════════════════════════════════════════════════════════════════

describe('computePeriodesPourMission — comptage par périodicité', () => {
  test('mensuelle sur un exercice complet → 12 périodes', () => {
    const mission = { id: 1, periodicite: 'mensuelle',
      date_debut: '2026-09-01', date_fin: '2027-12-31' };
    const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12 };
    const periodes = computePeriodesPourMission(mission, dossier, {
      today: '2028-01-01', dateDebutProduction: '2026-09-01', horizonPeriodes: 0,
    });
    // Exercice 2027 = janvier→décembre 2027 = 12 périodes
    const ex2027 = periodes.filter(p => p.exercice === 2027);
    expect(ex2027).toHaveLength(12);
    expect(ex2027.map(p => p.numero)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
  });

  test('trimestrielle sur un exercice complet → 4 périodes', () => {
    const mission = { id: 1, periodicite: 'trimestrielle',
      date_debut: '2026-09-01', date_fin: '2027-12-31' };
    const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12 };
    const periodes = computePeriodesPourMission(mission, dossier, {
      today: '2028-01-01', dateDebutProduction: '2026-09-01', horizonPeriodes: 0,
    });
    const ex2027 = periodes.filter(p => p.exercice === 2027);
    expect(ex2027).toHaveLength(4);
    expect(ex2027.map(p => p.numero)).toEqual([1,2,3,4]);
  });

  test('annuelle → 1 période par exercice (exercice 2026 exclu par le plancher)', () => {
    // La période annuelle de l'exercice 2026 commence le 01/01/2026, donc
    // avant le plancher DATE_DEBUT_PRODUCTION (2026-09-01). Elle est écartée.
    // Confirme l'invariant : aucune rétro-génération.
    const mission = { id: 1, periodicite: 'annuelle',
      date_debut: '2026-09-01', date_fin: '2028-12-31' };
    const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12 };
    const periodes = computePeriodesPourMission(mission, dossier, {
      today: '2029-01-01', dateDebutProduction: '2026-09-01', horizonPeriodes: 0,
    });
    expect(periodes.filter(p => p.exercice === 2026)).toHaveLength(0);
    expect(periodes.filter(p => p.exercice === 2027)).toHaveLength(1);
    expect(periodes.filter(p => p.exercice === 2028)).toHaveLength(1);
  });
});

describe('computePeriodesPourMission — plancher DATE_DEBUT_PRODUCTION', () => {
  test('constante par défaut = 2026-09-01', () => {
    expect(DATE_DEBUT_PRODUCTION_DEFAUT).toBe('2026-09-01');
  });

  test('mission débutant le 2020-01-01 → rien avant 2026-09-01', () => {
    const mission = { id: 1, periodicite: 'mensuelle',
      date_debut: '2020-01-01', date_fin: '2027-12-31' };
    const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12 };
    const periodes = computePeriodesPourMission(mission, dossier, {
      today: '2028-01-01', dateDebutProduction: '2026-09-01', horizonPeriodes: 0,
    });
    // Première période doit commencer au plus tôt le 2026-09-01
    const min = periodes.reduce((a, p) => p.date_debut < a ? p.date_debut : a, '9999-12-31');
    expect(min).toBe('2026-09-01');
    // Rien en 2020..2025
    expect(periodes.filter(p => p.exercice < 2026)).toHaveLength(0);
  });
});

describe('computePeriodesPourMission — clôture 30/06', () => {
  // Exercice comptable 01/07/N → 30/06/N+1, exercice = année de clôture (N+1).
  test('période septembre 2026 → exercice 2027, numéro 3 (juillet=1)', () => {
    const mission = { id: 1, periodicite: 'mensuelle',
      date_debut: '2026-07-01', date_fin: '2027-06-30' };
    const dossier = { id: 1, jour_cloture: 30, mois_cloture: 6 };
    const periodes = computePeriodesPourMission(mission, dossier, {
      today: '2027-07-01', dateDebutProduction: '2026-09-01', horizonPeriodes: 0,
    });
    const sept2026 = periodes.find(p => p.date_debut === '2026-09-01');
    expect(sept2026).toBeDefined();
    expect(sept2026.exercice).toBe(2027);
    expect(sept2026.numero).toBe(3); // juillet=1, août=2, septembre=3
  });

  test('trimestrielle clôture 30/06 : 4 périodes par exercice, alignées', () => {
    const mission = { id: 1, periodicite: 'trimestrielle',
      date_debut: '2026-07-01', date_fin: '2027-06-30' };
    const dossier = { id: 1, jour_cloture: 30, mois_cloture: 6 };
    const periodes = computePeriodesPourMission(mission, dossier, {
      today: '2027-07-01', dateDebutProduction: '2026-07-01', horizonPeriodes: 0,
    });
    const ex2027 = periodes.filter(p => p.exercice === 2027);
    expect(ex2027).toHaveLength(4);
    // T1 = juil-sept, T2 = oct-déc, T3 = jan-mars, T4 = avr-juin
    expect(ex2027.map(p => p.date_debut)).toEqual([
      '2026-07-01', '2026-10-01', '2027-01-01', '2027-04-01',
    ]);
  });
});

describe('computePeriodesPourMission — RG-04 date_echeance_interne', () => {
  // Base : mensuelle, clôture 31/12, exercice 2027 pour balayer 12 fins de mois.
  const mission = { id: 1, periodicite: 'mensuelle',
    date_debut: '2027-01-01', date_fin: '2027-12-31' };
  const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12 };
  const OPTS = { today: '2028-01-01', dateDebutProduction: '2026-09-01', horizonPeriodes: 0 };

  test('date_fin + 20 jours quand la cible est un jour ouvré', () => {
    // Septembre 2027 : fin 30/09 (jeudi), +20j = 20/10 (mercredi), ouvré → aucun recul.
    const periodes = computePeriodesPourMission(mission, dossier, OPTS);
    const p = periodes.find(x => x.date_debut === '2027-09-01');
    expect(p.date_fin).toBe('2027-09-30');
    expect(p.date_echeance_interne).toBe('2027-10-20');
  });

  test('recule au vendredi quand +20j tombe un samedi', () => {
    // Mai 2027 : fin 31/05 (lundi), +20j = 20/06 (dimanche). RG-04 : recule au
    // jour ouvré précédent. On veut vendredi 18/06/2027.
    const periodes = computePeriodesPourMission(mission, dossier, OPTS);
    const p = periodes.find(x => x.date_debut === '2027-05-01');
    expect(p.date_fin).toBe('2027-05-31');
    expect(p.date_echeance_interne).toBe('2027-06-18');
  });

  test('recule au vendredi quand +20j tombe un dimanche', () => {
    // Novembre 2026 (exercice 2026) : fin 30/11 (lundi), +20j = 20/12 (dimanche).
    // Attendu : vendredi 18/12/2026. On sort de l'ex 2027 → utiliser mission 2026.
    const missionA = { id: 2, periodicite: 'mensuelle',
      date_debut: '2026-09-01', date_fin: '2026-12-31' };
    const periodes = computePeriodesPourMission(missionA, dossier, OPTS);
    const p = periodes.find(x => x.date_debut === '2026-11-01');
    expect(p.date_fin).toBe('2026-11-30');
    expect(p.date_echeance_interne).toBe('2026-12-18');
  });
});

describe('computePeriodesPourMission — RG-05 revue_requise', () => {
  const OPTS = { today: '2028-01-01', dateDebutProduction: '2026-09-01', horizonPeriodes: 0 };

  test('classe A : toutes les périodes ont revue_requise=1', () => {
    const mission = { id: 1, periodicite: 'mensuelle',
      date_debut: '2027-01-01', date_fin: '2027-12-31' };
    const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12, classe: 'A' };
    const periodes = computePeriodesPourMission(mission, dossier, OPTS);
    expect(periodes).toHaveLength(12);
    expect(periodes.every(p => p.revue_requise === 1)).toBe(true);
  });

  test('classe B mensuelle : numéros 3, 6, 9, 12 → 1 ; autres → 0', () => {
    const mission = { id: 1, periodicite: 'mensuelle',
      date_debut: '2027-01-01', date_fin: '2027-12-31' };
    const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12, classe: 'B' };
    const periodes = computePeriodesPourMission(mission, dossier, OPTS);
    const revues = periodes.filter(p => p.revue_requise === 1).map(p => p.numero).sort((a,b)=>a-b);
    expect(revues).toEqual([3, 6, 9, 12]);
  });

  test('classe C mensuelle : seulement 6 et 12 (dont dernière période)', () => {
    const mission = { id: 1, periodicite: 'mensuelle',
      date_debut: '2027-01-01', date_fin: '2027-12-31' };
    const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12, classe: 'C' };
    const periodes = computePeriodesPourMission(mission, dossier, OPTS);
    const revues = periodes.filter(p => p.revue_requise === 1).map(p => p.numero).sort((a,b)=>a-b);
    expect(revues).toEqual([6, 12]);
  });

  test('la dernière période de l\'exercice a toujours revue_requise=1, quelle que soit la classe', () => {
    // Classe C trimestrielle : num 1,2,3 → 0 (1%6=1, 2%6=2, 3%6=3), num 4 → 1
    // uniquement parce que c'est la dernière. Vérifie que le fallback « dernière »
    // fait bien basculer une classe C qui ne le mériterait pas par la matrice.
    const mission = { id: 1, periodicite: 'trimestrielle',
      date_debut: '2027-01-01', date_fin: '2027-12-31' };
    const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12, classe: 'C' };
    const periodes = computePeriodesPourMission(mission, dossier, OPTS);
    const revues = periodes.filter(p => p.revue_requise === 1).map(p => p.numero);
    expect(revues).toEqual([4]);
  });

  test('classe B annuelle : la seule période est aussi la dernière → revue_requise=1', () => {
    const mission = { id: 1, periodicite: 'annuelle',
      date_debut: '2026-09-01', date_fin: '2027-12-31' };
    const dossier = { id: 1, jour_cloture: 31, mois_cloture: 12, classe: 'B' };
    const periodes = computePeriodesPourMission(mission, dossier, OPTS);
    expect(periodes.filter(p => p.exercice === 2027)).toHaveLength(1);
    expect(periodes.find(p => p.exercice === 2027).revue_requise).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   Tests d'intégration — genererPeriodes (DB)
// ═══════════════════════════════════════════════════════════════════════════

describe('genererPeriodes — idempotence', () => {
  test('trois exécutions successives ne créent aucun doublon', async () => {
    const { missionId } = await creerFixture({
      suffix: 'idem-1', periodicite: 'mensuelle',
      dateDebutMission: '2026-09-01', dateFinMission: '2026-12-31',
    });

    const r1 = await genererPeriodes(pool, {
      today: TODAY, horizonPeriodes: HORIZON, missionId,
    });
    const r2 = await genererPeriodes(pool, {
      today: TODAY, horizonPeriodes: HORIZON, missionId,
    });
    const r3 = await genererPeriodes(pool, {
      today: TODAY, horizonPeriodes: HORIZON, missionId,
    });

    expect(r1.periodesCreees).toBeGreaterThan(0);
    expect(r2.periodesCreees).toBe(0);
    expect(r3.periodesCreees).toBe(0);

    const [[{ nb }]] = await pool.query(
      `SELECT COUNT(*) AS nb FROM production_periode WHERE mission_id=?`, [missionId]
    );
    expect(nb).toBe(r1.periodesCreees);
  });
});

describe('genererPeriodes — non-réinstanciation des tâches renseignées', () => {
  test('une tâche passée à F n\'est pas réinstanciée en N au rerun', async () => {
    const { missionId } = await creerFixture({
      suffix: 'nonrei', periodicite: 'mensuelle',
      dateDebutMission: '2026-09-01', dateFinMission: '2026-09-30',
    });

    await genererPeriodes(pool, { today: TODAY, horizonPeriodes: 0, missionId });
    const [[per]] = await pool.query(
      `SELECT id FROM production_periode WHERE mission_id=? LIMIT 1`, [missionId]
    );
    // On marque toutes les tâches de la période comme faites
    await pool.query(
      `UPDATE production_tache SET statut='F', fait_le=NOW() WHERE periode_id=?`,
      [per.id]
    );
    // Rerun
    await genererPeriodes(pool, { today: TODAY, horizonPeriodes: 0, missionId });
    const [restantes] = await pool.query(
      `SELECT statut FROM production_tache WHERE periode_id=?`, [per.id]
    );
    // Toutes toujours en 'F', aucune ré-écriture ni doublon
    expect(restantes.every(r => r.statut === 'F')).toBe(true);
  });
});

describe('genererPeriodes — filtres genere_production / statut_production', () => {
  test('genere_production=0 → aucune période créée', async () => {
    const { missionId } = await creerFixture({
      suffix: 'nogp', genereProduction: 0,
      dateDebutMission: '2026-09-01', dateFinMission: '2026-12-31',
    });
    await genererPeriodes(pool, { today: TODAY, horizonPeriodes: HORIZON, missionId });
    const [[{ nb }]] = await pool.query(
      `SELECT COUNT(*) AS nb FROM production_periode WHERE mission_id=?`, [missionId]
    );
    expect(nb).toBe(0);
  });

  test('statut_production=suspendue → aucune période créée', async () => {
    const { missionId } = await creerFixture({
      suffix: 'susp', statutProduction: 'suspendue',
      dateDebutMission: '2026-09-01', dateFinMission: '2026-12-31',
    });
    await genererPeriodes(pool, { today: TODAY, horizonPeriodes: HORIZON, missionId });
    const [[{ nb }]] = await pool.query(
      `SELECT COUNT(*) AS nb FROM production_periode WHERE mission_id=?`, [missionId]
    );
    expect(nb).toBe(0);
  });

  test('statut_production=terminee → aucune période créée', async () => {
    const { missionId } = await creerFixture({
      suffix: 'term', statutProduction: 'terminee',
      dateDebutMission: '2026-09-01', dateFinMission: '2026-12-31',
    });
    await genererPeriodes(pool, { today: TODAY, horizonPeriodes: HORIZON, missionId });
    const [[{ nb }]] = await pool.query(
      `SELECT COUNT(*) AS nb FROM production_periode WHERE mission_id=?`, [missionId]
    );
    expect(nb).toBe(0);
  });
});

describe('genererPeriodes — instanciation des tâches selon profils/classe', () => {
  test('dossier {classe:B, profils:["T"]} → toutes les tâches profils=["T"] instanciées', async () => {
    const { missionId } = await creerFixture({
      suffix: 'taches', periodicite: 'mensuelle',
      dateDebutMission: '2026-09-01', dateFinMission: '2026-09-30',
      classeDossier: 'B', profilsDossier: ['T'],
    });
    await genererPeriodes(pool, { today: TODAY, horizonPeriodes: 0, missionId });
    const [[per]] = await pool.query(
      `SELECT id FROM production_periode WHERE mission_id=?`, [missionId]
    );
    const [taches] = await pool.query(
      `SELECT tm.code, tm.profils_applicables, tm.classes_applicables
         FROM production_tache pt
         JOIN tache_modele tm ON tm.code = pt.tache_modele_code
        WHERE pt.periode_id = ?`, [per.id]
    );
    // Attendu : toutes les tâches profils=["T"] ET classes contenant "B".
    const [attendues] = await pool.query(
      `SELECT code FROM tache_modele
        WHERE JSON_CONTAINS(profils_applicables, '"T"')
          AND JSON_CONTAINS(classes_applicables, '"B"')`
    );
    expect(taches.map(t => t.code).sort()).toEqual(attendues.map(t => t.code).sort());
    // La tâche à profils=["P"] ne doit PAS être présente (dossier profils=["T"]).
    // mysql2 renvoie les colonnes JSON déjà décodées, pas de re-parse.
    const asArr = v => Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : []);
    expect(taches.find(t => {
      const pa = asArr(t.profils_applicables);
      return pa.includes('P') && !pa.includes('T');
    })).toBeUndefined();
  });
});
