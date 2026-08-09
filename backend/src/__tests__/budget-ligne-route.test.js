/**
 * Chantier F — route /api/budget-ligne.
 *
 * Test d'intégration : monte le routeur sur une app Express éphémère et
 * exerce le CRUD complet contre la DB parfi_test. Vérifie surtout les
 * garde-fous (statut LDM verrouillé, contrainte quantite en base).
 *
 * Fixtures __TEST_BLROUTE__ pour nettoyage.
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
process.env.DB_NAME = process.env.DB_NAME_TEST || 'parfi_test';
process.env.JWT_SECRET = 'test-secret-bl-route';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const budgetRouter = require('../routes/budget-ligne');

const TAG = '__TEST_BLROUTE__';

const app = express();
app.use(express.json());
app.use('/api/budget-ligne', budgetRouter);

const expertToken = jwt.sign({ id: 1, role: 'expert' }, process.env.JWT_SECRET);
const collabToken = jwt.sign({ id: 1, role: 'collaborateur' }, process.env.JWT_SECRET);

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

async function creerMission(suffix, { statut = 'brouillon' } = {}) {
  const [[existing]] = await pool.query(
    `SELECT id FROM contacts WHERE raisonSociale = ? LIMIT 1`, [TAG]
  );
  const contactId = existing
    ? existing.id
    : (await pool.query(`INSERT INTO contacts (type, raisonSociale) VALUES ('client', ?)`, [TAG]))[0].insertId;

  const [lm] = await pool.query(
    `INSERT INTO lettres_mission (numero, contactId, statut, typeMission, montantHonorairesHT)
     VALUES (?, ?, ?, 'tenue_comptable', 0)`,
    [`${TAG}${suffix}`, contactId, statut]
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

beforeEach(async () => { await truncate(); });
afterAll(async () => { await truncate(); await pool.end(); });

// ═══════════════════════════════════════════════════════════════════════════
//   Référentiels
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /referentiel', () => {
  test('/referentiel/taux-grade retourne les grades seedés', async () => {
    const res = await request(app)
      .get('/api/budget-ligne/referentiel/taux-grade')
      .set('Authorization', `Bearer ${expertToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const grades = res.body.map(r => r.grade);
    expect(grades).toEqual(expect.arrayContaining(['junior', 'medior', 'senior']));
  });

  test('/referentiel/code-temps retourne les codes actifs', async () => {
    const res = await request(app)
      .get('/api/budget-ligne/referentiel/code-temps')
      .set('Authorization', `Bearer ${expertToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    // Chaque ligne a un code sur 3 caractères
    for (const row of res.body) {
      expect(row.code).toMatch(/^[A-Z0-9]{3}$/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   Auth & rôles
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth & rôles', () => {
  test('401 sans token', async () => {
    const res = await request(app).get('/api/budget-ligne?mission_id=1');
    expect(res.status).toBe(401);
  });

  test('403 sur POST si rôle collaborateur', async () => {
    const { missionId } = await creerMission('403');
    const res = await request(app)
      .post('/api/budget-ligne')
      .set('Authorization', `Bearer ${collabToken}`)
      .send({ mission_id: missionId, code_temps: 'C01', grade: 'medior',
              quantite_minutes: 60, periodicite: 'mensuelle' });
    expect(res.status).toBe(403);
  });

  test('GET (lecture) reste accessible au collaborateur', async () => {
    const { missionId } = await creerMission('lect');
    const res = await request(app)
      .get(`/api/budget-ligne?mission_id=${missionId}`)
      .set('Authorization', `Bearer ${collabToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe('CRUD budget-ligne', () => {
  test('POST crée une ligne, GET la retourne, PUT modifie, DELETE supprime', async () => {
    const { missionId } = await creerMission('crud');

    // CREATE
    const post = await request(app)
      .post('/api/budget-ligne')
      .set('Authorization', `Bearer ${expertToken}`)
      .send({
        mission_id: missionId, code_temps: 'C01', grade: 'medior',
        quantite_minutes: 150, periodicite: 'mensuelle', libelle: 'saisie test',
      });
    expect(post.status).toBe(201);
    expect(post.body.id).toBeGreaterThan(0);
    expect(parseFloat(post.body.montant_ht)).toBe(1650.00); // 150×12=1800min×55/60
    const id = post.body.id;

    // LIST
    const list = await request(app)
      .get(`/api/budget-ligne?mission_id=${missionId}`)
      .set('Authorization', `Bearer ${expertToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].code_temps_libelle).toBeDefined(); // JOIN sur code_temps

    // Cache honoraires_ht mis à jour côté mission
    const [[m]] = await pool.query(
      `SELECT honoraires_ht FROM ldm_missions WHERE id = ?`, [missionId]
    );
    expect(parseFloat(m.honoraires_ht)).toBe(1650.00);

    // UPDATE quantite = 60 → 720 min ann × 55/60 = 660€
    const put = await request(app)
      .put(`/api/budget-ligne/${id}`)
      .set('Authorization', `Bearer ${expertToken}`)
      .send({ quantite_minutes: 60, periodicite: 'mensuelle' });
    expect(put.status).toBe(200);
    expect(parseFloat(put.body.montant_ht)).toBe(660.00);

    // DELETE
    const del = await request(app)
      .delete(`/api/budget-ligne/${id}`)
      .set('Authorization', `Bearer ${expertToken}`);
    expect(del.status).toBe(204);

    const listApres = await request(app)
      .get(`/api/budget-ligne?mission_id=${missionId}`)
      .set('Authorization', `Bearer ${expertToken}`);
    expect(listApres.body).toHaveLength(0);
  });

  test('POST refuse quantite_minutes non multiple de 15', async () => {
    const { missionId } = await creerMission('ck');
    const res = await request(app)
      .post('/api/budget-ligne')
      .set('Authorization', `Bearer ${expertToken}`)
      .send({
        mission_id: missionId, code_temps: 'C01', grade: 'medior',
        quantite_minutes: 10, periodicite: 'mensuelle',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/multiple de 15/);
  });

  test('POST refuse grade inconnu', async () => {
    const { missionId } = await creerMission('bg');
    const res = await request(app)
      .post('/api/budget-ligne')
      .set('Authorization', `Bearer ${expertToken}`)
      .send({
        mission_id: missionId, code_temps: 'C01', grade: 'stagiaire',
        quantite_minutes: 60, periodicite: 'mensuelle',
      });
    // FK bloque à l'INSERT (grade n'existe pas dans taux_grade)
    // OU lireTauxGrade lève avant. Les deux sont valides — on veut !=201.
    expect([400, 500]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   Verrou LDM signée / active
// ═══════════════════════════════════════════════════════════════════════════

describe('Verrou LDM verrouillée', () => {
  test('POST refuse si LDM signée (409)', async () => {
    const { missionId } = await creerMission('lock-post', { statut: 'signee' });
    const res = await request(app)
      .post('/api/budget-ligne')
      .set('Authorization', `Bearer ${expertToken}`)
      .send({
        mission_id: missionId, code_temps: 'C01', grade: 'medior',
        quantite_minutes: 60, periodicite: 'mensuelle',
      });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/statut/i);
  });

  test('PUT et DELETE refusent si LDM devient signée après création', async () => {
    const { ldmId, missionId } = await creerMission('lock-mut');

    // Création en brouillon
    const post = await request(app)
      .post('/api/budget-ligne')
      .set('Authorization', `Bearer ${expertToken}`)
      .send({
        mission_id: missionId, code_temps: 'C01', grade: 'medior',
        quantite_minutes: 60, periodicite: 'mensuelle',
      });
    expect(post.status).toBe(201);
    const id = post.body.id;

    // Bascule LDM en active
    await pool.query(`UPDATE lettres_mission SET statut='active' WHERE id=?`, [ldmId]);

    const put = await request(app)
      .put(`/api/budget-ligne/${id}`)
      .set('Authorization', `Bearer ${expertToken}`)
      .send({ quantite_minutes: 120 });
    expect(put.status).toBe(409);

    const del = await request(app)
      .delete(`/api/budget-ligne/${id}`)
      .set('Authorization', `Bearer ${expertToken}`);
    expect(del.status).toBe(409);
  });
});
