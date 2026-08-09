/**
 * Chantier F — budget_ligne : refonte dimensionnement.
 *
 * Tests écrits AVANT le code (TDD). Ils couvrent explicitement les 6 cas
 * listés au brief :
 *   1. Chaque périodicité donne le bon nombre d'occurrences (fonction pure).
 *   2. La contrainte multiple de 15 est refusée EN BASE, pas seulement dans
 *      le code.
 *   3. Le taux appliqué ne bouge pas après modification de taux_grade
 *      (figeage RG-38 renforcé : dénormalisé comme gravité sur alerte).
 *   4. La commande recalculer-taux refuse sur LDM signée (et active).
 *   5. La somme des lignes égale ldm_missions.honoraires_ht, y compris après
 *      suppression d'une ligne (cache dénormalisé).
 *   6. Une ligne de 2 h 30 mensuelle au grade medior donne 1 800 minutes
 *      annuelles et 1 650,00 € (55 €/h × 30 h).
 *
 * Fixtures __TEST_BUDGET__ pour nettoyage garanti.
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
process.env.DB_NAME = process.env.DB_NAME_TEST || 'parfi_test';

const pool = require('../config/db');
const budget = require('../production/budget');
const path = require('path');
const { execSync } = require('child_process');

const TAG = '__TEST_BUDGET__';

// ─── Fixtures ──────────────────────────────────────────────────────────────
async function truncate() {
  await pool.query(
    `DELETE FROM budget_ligne WHERE mission_id IN
       (SELECT m.id FROM ldm_missions m
          JOIN lettres_mission l ON l.id = m.lettre_mission_id
         WHERE l.numero LIKE ?)`,
    [`${TAG}%`]
  );
  await pool.query(
    `DELETE m FROM ldm_missions m
       JOIN lettres_mission l ON l.id = m.lettre_mission_id
      WHERE l.numero LIKE ?`,
    [`${TAG}%`]
  );
  await pool.query(`DELETE FROM lettres_mission WHERE numero LIKE ?`, [`${TAG}%`]);
  await pool.query(`DELETE FROM contacts WHERE raisonSociale = ?`, [TAG]);
}

async function creerLdmEtMission(suffix, { statutLdm = 'brouillon' } = {}) {
  // Contact minimal (lettres_mission.contactId NOT NULL)
  const [[existingContact]] = await pool.query(
    `SELECT id FROM contacts WHERE raisonSociale = ? LIMIT 1`, [TAG]
  );
  const contactId = existingContact
    ? existingContact.id
    : (await pool.query(`INSERT INTO contacts (type, raisonSociale) VALUES ('client', ?)`, [TAG]))[0].insertId;

  const numeroLdm = `${TAG}${suffix}`;
  const [lm] = await pool.query(
    `INSERT INTO lettres_mission (numero, contactId, statut, typeMission, montantHonorairesHT)
     VALUES (?, ?, ?, 'tenue_comptable', 0)`,
    [numeroLdm, contactId, statutLdm]
  );
  const [mission] = await pool.query(
    `INSERT INTO ldm_missions
       (lettre_mission_id, type_mission, libelle, honoraires_ht, ordre,
        nature, periodicite, statut_production, genere_production)
     VALUES (?, 'tenue_comptable', ?, 0, 1, 'tenue', 'mensuelle', 'active', 1)`,
    [lm.insertId, `mission ${suffix}`]
  );
  return { ldmId: lm.insertId, missionId: mission.insertId };
}

// ─── Cycle ─────────────────────────────────────────────────────────────────
beforeEach(async () => { await truncate(); });
afterAll(async () => { await truncate(); await pool.end(); });

// ═══════════════════════════════════════════════════════════════════════════
//   1. Occurrences par périodicité — fonction pure
// ═══════════════════════════════════════════════════════════════════════════

describe('budget — calculs purs', () => {

  test('occurrences par périodicité', () => {
    expect(budget.occurrencesParAn('mensuelle')).toBe(12);
    expect(budget.occurrencesParAn('trimestrielle')).toBe(4);
    expect(budget.occurrencesParAn('semestrielle')).toBe(2);
    expect(budget.occurrencesParAn('annuelle')).toBe(1);
    expect(budget.occurrencesParAn('ponctuelle')).toBe(1);
  });

  test('minutes annuelles = quantite × occurrences', () => {
    expect(budget.minutesAnnuelles(150, 'mensuelle')).toBe(1800);
    expect(budget.minutesAnnuelles(60, 'trimestrielle')).toBe(240);
    expect(budget.minutesAnnuelles(720, 'annuelle')).toBe(720);
  });

  test('montant HT = ROUND(minutes/60 × taux, 2)', () => {
    // 1800 min = 30 h, taux 55 €/h → 1650,00 €
    expect(budget.montantHt(1800, 55)).toBe(1650.00);
    // 45 min = 0.75 h, taux 100 → 75 €
    expect(budget.montantHt(45, 100)).toBe(75.00);
    // 15 min = 0.25 h, taux 55 → 13.75 €
    expect(budget.montantHt(15, 55)).toBe(13.75);
  });

  test('cas d\'école du brief : 2 h 30 mensuelle grade medior → 1800 min et 1 650,00 €', () => {
    const minutes = budget.minutesAnnuelles(150, 'mensuelle');
    expect(minutes).toBe(1800);
    // Taux medior = 55 €/h (docs-production/seed/taux_grade.csv)
    expect(budget.montantHt(minutes, 55)).toBe(1650.00);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   2. Contrainte multiple de 15 : refusée EN BASE
// ═══════════════════════════════════════════════════════════════════════════

describe('budget — contrainte quantite_minutes en base', () => {

  test('INSERT direct avec quantite_minutes = 10 est refusé par MySQL (CHECK)', async () => {
    const { missionId } = await creerLdmEtMission('ck-lt15');
    await expect(pool.query(
      `INSERT INTO budget_ligne
         (mission_id, code_temps, grade, quantite_minutes, periodicite,
          minutes_annuelles, taux_horaire_applique, montant_ht,
          poste, origine, libelle, ordre)
       VALUES (?, 'C01', 'medior', 10, 'mensuelle', 120, 55, 110, 'production', 'saisie', 'ko', 1)`,
      [missionId]
    )).rejects.toThrow();
  });

  test('INSERT direct avec quantite_minutes = 800 est refusé (plafond 720)', async () => {
    const { missionId } = await creerLdmEtMission('ck-gt720');
    await expect(pool.query(
      `INSERT INTO budget_ligne
         (mission_id, code_temps, grade, quantite_minutes, periodicite,
          minutes_annuelles, taux_horaire_applique, montant_ht,
          poste, origine, libelle, ordre)
       VALUES (?, 'C01', 'medior', 800, 'annuelle', 800, 55, 733.33, 'production', 'saisie', 'ko', 1)`,
      [missionId]
    )).rejects.toThrow();
  });

  test('INSERT direct avec quantite_minutes = 0 est refusé (plancher 15)', async () => {
    const { missionId } = await creerLdmEtMission('ck-zero');
    await expect(pool.query(
      `INSERT INTO budget_ligne
         (mission_id, code_temps, grade, quantite_minutes, periodicite,
          minutes_annuelles, taux_horaire_applique, montant_ht,
          poste, origine, libelle, ordre)
       VALUES (?, 'C01', 'medior', 0, 'mensuelle', 0, 55, 0, 'production', 'saisie', 'ko', 1)`,
      [missionId]
    )).rejects.toThrow();
  });

  test('INSERT via service avec quantite_minutes = 15 (plancher) fonctionne', async () => {
    const { missionId } = await creerLdmEtMission('ck-ok');
    const id = await budget.creerLigne(pool, {
      missionId, codeTemps: 'C01', grade: 'medior',
      quantiteMinutes: 15, periodicite: 'ponctuelle',
      poste: 'production', origine: 'saisie', libelle: 'ok',
    });
    expect(id).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   3. Figeage du taux : dénormalisé, ne bouge pas
// ═══════════════════════════════════════════════════════════════════════════

describe('budget — figeage du taux_horaire_applique', () => {

  test('modifier taux_grade ne change pas les lignes existantes', async () => {
    const { missionId } = await creerLdmEtMission('fig');
    const ligneId = await budget.creerLigne(pool, {
      missionId, codeTemps: 'C01', grade: 'medior',
      quantiteMinutes: 60, periodicite: 'mensuelle',
      poste: 'production', origine: 'saisie', libelle: 'fig',
    });

    const [[avant]] = await pool.query(
      `SELECT taux_horaire_applique, montant_ht FROM budget_ligne WHERE id = ?`,
      [ligneId]
    );
    // Taux medior = 55 €/h à la création
    expect(parseFloat(avant.taux_horaire_applique)).toBe(55);
    // 60 min × 12 mois = 720 min = 12 h × 55 = 660 €
    expect(parseFloat(avant.montant_ht)).toBe(660);

    // Révision du taux medior à 90 €/h (scénario campagne annuelle de révision)
    await pool.query(`UPDATE taux_grade SET taux_horaire_cible_eur = 90 WHERE grade = 'medior'`);

    const [[apres]] = await pool.query(
      `SELECT taux_horaire_applique, montant_ht FROM budget_ligne WHERE id = ?`,
      [ligneId]
    );
    expect(parseFloat(apres.taux_horaire_applique)).toBe(55);
    expect(parseFloat(apres.montant_ht)).toBe(660);

    // Remet le taux à 55 pour ne pas polluer les autres tests
    await pool.query(`UPDATE taux_grade SET taux_horaire_cible_eur = 55 WHERE grade = 'medior'`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   4. Commande recalculer-taux — refuse si LDM signée ou active
// ═══════════════════════════════════════════════════════════════════════════

describe('budget — commande recalculer-taux', () => {

  const CLI = path.join(__dirname, '..', 'jobs', 'recalculer-taux.js');

  function runCli(missionId) {
    try {
      const out = execSync(
        `node ${CLI} --db parfi_test --mission-id ${missionId}`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      return { code: 0, stdout: out, stderr: '' };
    } catch (e) {
      return { code: e.status || 1, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '' };
    }
  }

  test('refuse si la LDM est signée', async () => {
    const { ldmId, missionId } = await creerLdmEtMission('rt-signee', { statutLdm: 'signee' });
    await budget.creerLigne(pool, {
      missionId, codeTemps: 'C01', grade: 'medior',
      quantiteMinutes: 60, periodicite: 'mensuelle',
      poste: 'production', origine: 'saisie', libelle: 'x',
    });

    const r = runCli(missionId);
    expect(r.code).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/sign|active|refus/i);
  });

  test('refuse si la LDM est active', async () => {
    const { missionId } = await creerLdmEtMission('rt-active', { statutLdm: 'active' });
    await budget.creerLigne(pool, {
      missionId, codeTemps: 'C01', grade: 'medior',
      quantiteMinutes: 60, periodicite: 'mensuelle',
      poste: 'production', origine: 'saisie', libelle: 'x',
    });

    const r = runCli(missionId);
    expect(r.code).not.toBe(0);
  });

  test('accepte si la LDM est en brouillon, met à jour le taux et le montant', async () => {
    const { missionId } = await creerLdmEtMission('rt-brouillon');
    const ligneId = await budget.creerLigne(pool, {
      missionId, codeTemps: 'C01', grade: 'medior',
      quantiteMinutes: 60, periodicite: 'mensuelle',
      poste: 'production', origine: 'saisie', libelle: 'x',
    });

    // Bascule medior à 90 €/h
    await pool.query(`UPDATE taux_grade SET taux_horaire_cible_eur = 90 WHERE grade = 'medior'`);
    try {
      const r = runCli(missionId);
      expect(r.code).toBe(0);
      const [[apres]] = await pool.query(
        `SELECT taux_horaire_applique, montant_ht FROM budget_ligne WHERE id = ?`,
        [ligneId]
      );
      expect(parseFloat(apres.taux_horaire_applique)).toBe(90);
      // 720 min = 12 h × 90 = 1080 €
      expect(parseFloat(apres.montant_ht)).toBe(1080);
    } finally {
      await pool.query(`UPDATE taux_grade SET taux_horaire_cible_eur = 55 WHERE grade = 'medior'`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   5. Cache honoraires_ht : somme des lignes, y compris après suppression
// ═══════════════════════════════════════════════════════════════════════════

describe('budget — cache ldm_missions.honoraires_ht', () => {

  test('création de deux lignes → honoraires_ht = somme, suppression d\'une → mis à jour', async () => {
    const { missionId } = await creerLdmEtMission('cache');

    const l1 = await budget.creerLigne(pool, {
      missionId, codeTemps: 'C01', grade: 'medior',
      quantiteMinutes: 150, periodicite: 'mensuelle',
      poste: 'production', origine: 'saisie', libelle: '2h30 mensuelles',
    });
    const l2 = await budget.creerLigne(pool, {
      missionId, codeTemps: 'C01', grade: 'senior',
      quantiteMinutes: 60, periodicite: 'annuelle',
      poste: 'production', origine: 'saisie', libelle: '1h annuelle',
    });

    // 1650 (medior 2h30 mensuelle) + 70 (senior 1h × 70€/h) = 1720
    let [[m]] = await pool.query(`SELECT honoraires_ht FROM ldm_missions WHERE id = ?`, [missionId]);
    expect(parseFloat(m.honoraires_ht)).toBe(1720);

    // Suppression de la seconde ligne → honoraires doit repasser à 1650
    await budget.supprimerLigne(pool, l2);
    [[m]] = await pool.query(`SELECT honoraires_ht FROM ldm_missions WHERE id = ?`, [missionId]);
    expect(parseFloat(m.honoraires_ht)).toBe(1650);

    // Suppression de la première ligne → honoraires doit repasser à 0
    await budget.supprimerLigne(pool, l1);
    [[m]] = await pool.query(`SELECT honoraires_ht FROM ldm_missions WHERE id = ?`, [missionId]);
    expect(parseFloat(m.honoraires_ht)).toBe(0);
  });
});
