/**
 * Chantier G — routes /api/onboarding et /api/mandats (portées onboarding).
 *
 * Vérifie le CRUD mandats scopé onboarding, la MAJ statut d'étape, et les
 * gardes-fous (types, statuts, mandat signé non supprimable).
 *
 * Fixtures __TEST_ONBROUTE__.
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
process.env.DB_NAME = process.env.DB_NAME_TEST || 'parfi_test';
process.env.JWT_SECRET = 'test-secret-onboarding-route';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const onboardingRouter = require('../routes/onboarding');
const mandatsRouter = require('../routes/mandats');
const { creerOnboardingSiBesoin, instancierEtapesOnboarding } = require('../production/onboarding');

const TAG = '__TEST_ONBROUTE__';

const app = express();
app.use(express.json());
app.use('/api/onboarding', onboardingRouter);
app.use('/api/mandats', mandatsRouter);

const expertToken = jwt.sign({ id: 1, role: 'expert' }, process.env.JWT_SECRET);
const collabToken = jwt.sign({ id: 1, role: 'collaborateur' }, process.env.JWT_SECRET);

async function truncate() {
  await pool.query(
    `DELETE FROM mandats WHERE onboarding_id IN
       (SELECT o.id FROM onboarding o JOIN dossier d ON d.id = o.dossier_id
        JOIN clients c ON c.id = d.client_id WHERE c.nom LIKE ?)`, [`${TAG}%`]
  );
  await pool.query(
    `DELETE FROM onboarding_etape WHERE onboarding_id IN
       (SELECT o.id FROM onboarding o JOIN dossier d ON d.id = o.dossier_id
        JOIN clients c ON c.id = d.client_id WHERE c.nom LIKE ?)`, [`${TAG}%`]
  );
  await pool.query(
    `DELETE o FROM onboarding o JOIN dossier d ON d.id = o.dossier_id
       JOIN clients c ON c.id = d.client_id WHERE c.nom LIKE ?`, [`${TAG}%`]
  );
  await pool.query(
    `DELETE d FROM dossier d JOIN clients c ON c.id = d.client_id
      WHERE c.nom LIKE ?`, [`${TAG}%`]
  );
  await pool.query(`DELETE FROM clients WHERE nom LIKE ?`, [`${TAG}%`]);
}

async function creerContexte(suffix) {
  const nom = `${TAG}${suffix}`;
  const [c] = await pool.query(
    `INSERT INTO clients (nom, siren, type, actif) VALUES (?, '111222333', 'BIC', 1)`,
    [nom]
  );
  const [d] = await pool.query(
    `INSERT INTO dossier (client_id, raison_sociale, classe, cotation_faite, materialite)
     VALUES (?, ?, 'B', 0, 500)`, [c.insertId, nom]
  );
  const onbId = await creerOnboardingSiBesoin(d.insertId, { dateSignature: '2026-09-01' });
  await instancierEtapesOnboarding(onbId, { profils: ['T'] });
  return { clientId: c.insertId, dossierId: d.insertId, onboardingId: onbId };
}

beforeEach(async () => { await truncate(); });
afterAll(async () => { await truncate(); await pool.end(); });

// ═══════════════════════════════════════════════════════════════════════════
//   GET /api/onboarding/:dossierId
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/onboarding/:dossierId', () => {
  test('404 si dossier sans onboarding', async () => {
    const res = await request(app)
      .get('/api/onboarding/999999')
      .set('Authorization', `Bearer ${expertToken}`);
    expect(res.status).toBe(404);
  });

  test('retourne onboarding + étapes + mandats vides', async () => {
    const { dossierId } = await creerContexte('get');
    const res = await request(app)
      .get(`/api/onboarding/${dossierId}`)
      .set('Authorization', `Bearer ${expertToken}`);
    expect(res.status).toBe(200);
    expect(res.body.onboarding).toBeDefined();
    expect(res.body.onboarding.client_nom).toContain(TAG);
    expect(res.body.etapes.length).toBeGreaterThan(0);
    // Chaque étape a phase, ordre, libelle, responsable du modèle joint
    for (const e of res.body.etapes) {
      expect(e.phase).toBeDefined();
      expect(e.libelle).toBeDefined();
      expect(['N','EC','F','NA']).toContain(e.statut);
    }
    expect(res.body.mandats).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   PUT /api/onboarding/etapes/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/onboarding/etapes/:id', () => {
  test('collaborateur peut cocher une étape → statut F, fait_le/fait_par posés', async () => {
    const { dossierId } = await creerContexte('etape');
    const { body } = await request(app)
      .get(`/api/onboarding/${dossierId}`)
      .set('Authorization', `Bearer ${collabToken}`);
    const etape = body.etapes[0];
    const res = await request(app)
      .put(`/api/onboarding/etapes/${etape.id}`)
      .set('Authorization', `Bearer ${collabToken}`)
      .send({ statut: 'F' });
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('F');
    expect(res.body.fait_le).toBeTruthy();
    expect(res.body.fait_par).toBe(1);
  });

  test('statut NA refusé sans motif_na', async () => {
    const { dossierId } = await creerContexte('na');
    const { body } = await request(app)
      .get(`/api/onboarding/${dossierId}`)
      .set('Authorization', `Bearer ${expertToken}`);
    const res = await request(app)
      .put(`/api/onboarding/etapes/${body.etapes[0].id}`)
      .set('Authorization', `Bearer ${expertToken}`)
      .send({ statut: 'NA' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/motif_na/);
  });

  test('statut invalide refusé', async () => {
    const { dossierId } = await creerContexte('inv');
    const { body } = await request(app)
      .get(`/api/onboarding/${dossierId}`)
      .set('Authorization', `Bearer ${expertToken}`);
    const res = await request(app)
      .put(`/api/onboarding/etapes/${body.etapes[0].id}`)
      .set('Authorization', `Bearer ${expertToken}`)
      .send({ statut: 'X' });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//   POST/PUT/DELETE /api/mandats
// ═══════════════════════════════════════════════════════════════════════════

describe('/api/mandats — CRUD scopé onboarding', () => {
  test('POST → GET → PUT signe → DELETE refuse mandat signé', async () => {
    const { onboardingId } = await creerContexte('mandats');

    // POST
    const post = await request(app)
      .post('/api/mandats')
      .set('Authorization', `Bearer ${collabToken}`)
      .send({ onboarding_id: onboardingId, type: 'urssaf', libelle: 'Mandat URSSAF' });
    expect(post.status).toBe(201);
    expect(post.body.type).toBe('urssaf');
    expect(post.body.onboarding_id).toBe(onboardingId);
    const id = post.body.id;

    // GET liste scopée
    const list = await request(app)
      .get(`/api/mandats?onboarding_id=${onboardingId}`)
      .set('Authorization', `Bearer ${collabToken}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);

    // PUT signe
    const put = await request(app)
      .put(`/api/mandats/${id}`)
      .set('Authorization', `Bearer ${collabToken}`)
      .send({ signe: true, date_signature: '2026-09-10' });
    expect(put.status).toBe(200);
    expect(put.body.signe).toBe(1);

    // DELETE refusé sur mandat signé
    const delSigne = await request(app)
      .delete(`/api/mandats/${id}`)
      .set('Authorization', `Bearer ${expertToken}`);
    expect(delSigne.status).toBe(409);
  });

  test('POST refuse type invalide', async () => {
    const { onboardingId } = await creerContexte('type-ko');
    const res = await request(app)
      .post('/api/mandats')
      .set('Authorization', `Bearer ${expertToken}`)
      .send({ onboarding_id: onboardingId, type: 'xxx' });
    expect(res.status).toBe(400);
  });

  test('POST refuse onboarding_id manquant', async () => {
    const res = await request(app)
      .post('/api/mandats')
      .set('Authorization', `Bearer ${expertToken}`)
      .send({ type: 'urssaf' });
    expect(res.status).toBe(400);
  });

  test('DELETE d\'un mandat non signé par expert : OK', async () => {
    const { onboardingId } = await creerContexte('del-ok');
    const post = await request(app)
      .post('/api/mandats')
      .set('Authorization', `Bearer ${expertToken}`)
      .send({ onboarding_id: onboardingId, type: 'impots' });
    const del = await request(app)
      .delete(`/api/mandats/${post.body.id}`)
      .set('Authorization', `Bearer ${expertToken}`);
    expect(del.status).toBe(204);
  });

  test('DELETE refusé au collaborateur (expert/chef_mission seulement)', async () => {
    const { onboardingId } = await creerContexte('del-collab');
    const post = await request(app)
      .post('/api/mandats')
      .set('Authorization', `Bearer ${expertToken}`)
      .send({ onboarding_id: onboardingId, type: 'impots' });
    const del = await request(app)
      .delete(`/api/mandats/${post.body.id}`)
      .set('Authorization', `Bearer ${collabToken}`);
    expect(del.status).toBe(403);
  });
});
