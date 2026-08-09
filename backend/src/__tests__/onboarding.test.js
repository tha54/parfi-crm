/**
 * Chantier E — onboarding : création automatique à la signature LDM,
 * instanciation des étapes, filtrage conditionnel, idempotence.
 *
 * Vérifie :
 *   1. Après signature LDM (chantier B) l'onboarding existe pour le dossier
 *      et les 26 étapes non conditionnelles sont instanciées (E01..E27 moins
 *      les 3 sur reprise_confrere et l'une sur profil_especes).
 *   2. Un dossier de reprise (reprise_confrere = 1) voit s'ajouter E04, E05, E06.
 *   3. Un dossier avec profils incluant 'E' voit s'ajouter E23.
 *   4. Idempotence : réappeler l'instanciation ne recrée aucune étape ; une
 *      étape passée en F reste en F.
 *   5. date_fin_cible = date_signature + 60 jours ; date_echeance des étapes
 *      = date_signature + delai_jours.
 *
 * Fixtures __TEST_ONB__ pour nettoyage garanti.
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
process.env.DB_NAME = process.env.DB_NAME_TEST || 'parfi_test';

const pool = require('../config/db');
const { creerOnboardingSiBesoin, instancierEtapesOnboarding } = require('../production/onboarding');

const TAG = '__TEST_ONB__';

async function truncate() {
  await pool.query(
    `DELETE FROM onboarding_etape WHERE onboarding_id IN
       (SELECT id FROM onboarding WHERE dossier_id IN
         (SELECT d.id FROM dossier d JOIN clients c ON c.id = d.client_id WHERE c.nom LIKE ?))`,
    [`${TAG}%`]
  );
  await pool.query(
    `DELETE FROM onboarding WHERE dossier_id IN
       (SELECT d.id FROM dossier d JOIN clients c ON c.id = d.client_id WHERE c.nom LIKE ?)`,
    [`${TAG}%`]
  );
  await pool.query(
    `DELETE d FROM dossier d JOIN clients c ON c.id = d.client_id WHERE c.nom LIKE ?`,
    [`${TAG}%`]
  );
  await pool.query(`DELETE FROM clients WHERE nom LIKE ?`, [`${TAG}%`]);
}

async function creerDossier(suffix, profils = ['T']) {
  const nom = `${TAG}${suffix}`;
  const [c] = await pool.query(
    `INSERT INTO clients (nom, type, regime, actif) VALUES (?, 'BIC', 'mensuel', 1)`,
    [nom]
  );
  const [d] = await pool.query(
    `INSERT INTO dossier (client_id, raison_sociale, classe, profils, cotation_faite, materialite, statut)
     VALUES (?, ?, 'B', ?, 0, 500, 'actif')`,
    [c.insertId, nom, JSON.stringify(profils)]
  );
  return { clientId: c.insertId, dossierId: d.insertId };
}

beforeEach(async () => { await truncate(); });
afterAll(async () => { await truncate(); await pool.end(); });

// ═══════════════════════════════════════════════════════════════════════════

describe('onboarding — création et instanciation', () => {

  test('dossier standard (profils=[T], reprise_confrere=0) → 23 étapes', async () => {
    const { dossierId } = await creerDossier('std');
    const onbId = await creerOnboardingSiBesoin(dossierId, { dateSignature: '2026-09-01' });
    const nb = await instancierEtapesOnboarding(onbId, { profils: ['T'] });

    // Référentiel = 27 étapes ; conditions : E04/E05/E06 (reprise_confrere),
    // E23 (profil_especes). Sans reprise ni profil E : 27 - 3 - 1 = 23.
    expect(nb).toBe(23);
    const [[cnt]] = await pool.query(
      `SELECT COUNT(*) AS n FROM onboarding_etape WHERE onboarding_id = ?`, [onbId]
    );
    expect(cnt.n).toBe(23);

    // Aucune étape conditionnelle instanciée
    const [rows] = await pool.query(
      `SELECT code_modele FROM onboarding_etape WHERE onboarding_id = ?
       AND code_modele IN ('E04','E05','E06','E23')`,
      [onbId]
    );
    expect(rows.length).toBe(0);
  });

  test('reprise_confrere = 1 → E04, E05, E06 instanciées en plus', async () => {
    const { dossierId } = await creerDossier('reprise');
    const onbId = await creerOnboardingSiBesoin(dossierId, {
      dateSignature: '2026-09-01', repriseConfrere: true, confrerePrecedent: 'Cab Dupont',
    });
    await instancierEtapesOnboarding(onbId, { profils: ['T'] });

    const [rows] = await pool.query(
      `SELECT code_modele FROM onboarding_etape
        WHERE onboarding_id = ? AND code_modele IN ('E04','E05','E06')`,
      [onbId]
    );
    expect(rows.map(r => r.code_modele).sort()).toEqual(['E04', 'E05', 'E06']);
  });

  test('profils incluant E → E23 instanciée', async () => {
    const { dossierId } = await creerDossier('especes', ['T', 'E']);
    const onbId = await creerOnboardingSiBesoin(dossierId, { dateSignature: '2026-09-01' });
    await instancierEtapesOnboarding(onbId, { profils: ['T', 'E'] });

    const [[e23]] = await pool.query(
      `SELECT COUNT(*) AS n FROM onboarding_etape WHERE onboarding_id = ? AND code_modele = 'E23'`,
      [onbId]
    );
    expect(e23.n).toBe(1);
  });

  test('idempotence : rerun ne recrée rien, étape en F reste en F', async () => {
    const { dossierId } = await creerDossier('idem');
    const onbId = await creerOnboardingSiBesoin(dossierId, { dateSignature: '2026-09-01' });
    const nb1 = await instancierEtapesOnboarding(onbId, { profils: ['T'] });
    expect(nb1).toBe(23);

    // Marque E01 comme fait
    await pool.query(
      `UPDATE onboarding_etape SET statut = 'F', fait_le = NOW()
        WHERE onboarding_id = ? AND code_modele = 'E01'`,
      [onbId]
    );

    // Rerun
    const nb2 = await instancierEtapesOnboarding(onbId, { profils: ['T'] });
    expect(nb2).toBe(0);

    const [[e01]] = await pool.query(
      `SELECT statut FROM onboarding_etape WHERE onboarding_id = ? AND code_modele = 'E01'`,
      [onbId]
    );
    expect(e01.statut).toBe('F');
  });

  test('creerOnboardingSiBesoin idempotent : deux appels renvoient le même id', async () => {
    const { dossierId } = await creerDossier('doublon');
    const id1 = await creerOnboardingSiBesoin(dossierId, { dateSignature: '2026-09-01' });
    const id2 = await creerOnboardingSiBesoin(dossierId, { dateSignature: '2026-10-15' });
    expect(id2).toBe(id1);
    const [[cnt]] = await pool.query(
      `SELECT COUNT(*) AS n FROM onboarding WHERE dossier_id = ?`, [dossierId]
    );
    expect(cnt.n).toBe(1);
  });

  test('date_fin_cible = date_signature + 60 jours', async () => {
    const { dossierId } = await creerDossier('fincible');
    const onbId = await creerOnboardingSiBesoin(dossierId, { dateSignature: '2026-09-01' });
    const [[onb]] = await pool.query(
      `SELECT date_signature, date_fin_cible FROM onboarding WHERE id = ?`, [onbId]
    );
    const toYmd = v => v instanceof Date
      ? `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,'0')}-${String(v.getUTCDate()).padStart(2,'0')}`
      : String(v).slice(0, 10);
    const sig = new Date(toYmd(onb.date_signature) + 'T00:00:00Z');
    const fin = new Date(toYmd(onb.date_fin_cible) + 'T00:00:00Z');
    const deltaJours = Math.round((fin - sig) / 86400000);
    expect(deltaJours).toBe(60);
  });

  test('date_echeance des étapes = date_signature + delai_jours', async () => {
    const { dossierId } = await creerDossier('echeance');
    const onbId = await creerOnboardingSiBesoin(dossierId, { dateSignature: '2026-09-01' });
    await instancierEtapesOnboarding(onbId, { profils: ['T'] });

    // Étape E07 : delai_jours = 5 → 2026-09-06
    // Étape E24 : delai_jours = 30 → 2026-10-01
    // Étape E26 : delai_jours = 60 → 2026-10-31
    const [rows] = await pool.query(
      `SELECT code_modele, date_echeance FROM onboarding_etape
        WHERE onboarding_id = ? AND code_modele IN ('E07','E24','E26')
        ORDER BY code_modele`,
      [onbId]
    );
    const toYmd = v => v instanceof Date
      ? `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,'0')}-${String(v.getUTCDate()).padStart(2,'0')}`
      : String(v).slice(0, 10);
    const map = {};
    for (const r of rows) map[r.code_modele] = toYmd(r.date_echeance);
    expect(map.E07).toBe('2026-09-06');
    expect(map.E24).toBe('2026-10-01');
    expect(map.E26).toBe('2026-10-31');
  });
});
