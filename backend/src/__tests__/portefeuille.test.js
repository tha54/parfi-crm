/**
 * Tests d'intégration — route portefeuille (routes/portefeuille.js)
 * La couche DB est mockée : aucune connexion MySQL réelle.
 */
jest.mock('../config/db', () => ({ query: jest.fn() }));

const pool = require('../config/db');
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret-portefeuille';
process.env.JWT_SECRET = JWT_SECRET;

const portefeuilleRouter = require('../routes/portefeuille');

const app = express();
app.use(express.json());
app.use('/api/portefeuille', portefeuilleRouter);

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET);
}

const COLLAB_TOKEN = makeToken({ id: 1, role: 'collaborateur', prenom: 'Théo' });
const EXPERT_TOKEN  = makeToken({ id: 2, role: 'expert', prenom: 'Thierry' });

// ─── Authentification ─────────────────────────────────────────────────────────

describe('GET /api/portefeuille — authentification', () => {
  test('401 sans token', async () => {
    const res = await request(app).get('/api/portefeuille');
    expect(res.status).toBe(401);
  });

  test('401 avec un token invalide', async () => {
    const res = await request(app)
      .get('/api/portefeuille')
      .set('Authorization', 'Bearer faux.token.ici');
    expect(res.status).toBe(401);
  });
});

// ─── Contrôle d'accès ────────────────────────────────────────────────────────

describe('GET /api/portefeuille — contrôle d\'accès', () => {
  test('403 si un collaborateur demande le portefeuille d\'un autre utilisateur', async () => {
    const res = await request(app)
      .get('/api/portefeuille?userId=99')
      .set('Authorization', `Bearer ${COLLAB_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

// ─── Calcul du portefeuille collaborateur ────────────────────────────────────

describe('GET /api/portefeuille — structure et calcul', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('retourne dossiers, taches, stats pour un collaborateur avec 1 dossier', async () => {
    pool.query
      // Premier appel : dossiers attribués
      .mockResolvedValueOnce([[
        {
          id: 10, nom: 'Dupont SARL', siren: '123456789', type: 'client', regime: 'is',
          role_sur_dossier: 'responsable',
          ldm_id: 1, ldm_numero: 'LM-2026-001', ldm_statut: 'active', ldm_montant: '3600',
          ca_facture_annee: '3600', // stats.caAnnuel dérive de ce champ depuis la refonte portefeuille
          ldm_date_debut: '2026-01-01',
          nb_taches: '5', nb_retard: '1', nb_en_cours: '2', nb_a_faire: '3',
          prochaine_echeance: '2026-05-10',
        },
      ]])
      // Deuxième appel : tâches actives
      .mockResolvedValueOnce([[
        {
          id: 100, libelle: 'Liasse 2025', titre: 'Liasse 2025', statut: 'a_faire',
          date_echeance: '2026-05-10', priorite: 'haute',
          client_id: 10, client_nom: 'Dupont SARL', budget_minutes: 120,
          source: 'manuelle', origine: null,
        },
      ]]);

    const res = await request(app)
      .get('/api/portefeuille')
      .set('Authorization', `Bearer ${COLLAB_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dossiers');
    expect(res.body).toHaveProperty('taches');
    expect(res.body).toHaveProperty('stats');

    expect(res.body.dossiers).toHaveLength(1);
    expect(res.body.dossiers[0].nom).toBe('Dupont SARL');
    expect(res.body.dossiers[0].role_sur_dossier).toBe('responsable');

    expect(res.body.taches).toHaveLength(1);

    // stats
    expect(res.body.stats.nbDossiers).toBe(1);
    expect(res.body.stats.caAnnuel).toBe(3600);
    expect(res.body.stats.nbRetard).toBe(1);
  });

  test('stats avec 0 dossier retourne des zéros', async () => {
    pool.query
      .mockResolvedValueOnce([[]])   // dossiers
      .mockResolvedValueOnce([[]]); // taches

    const res = await request(app)
      .get('/api/portefeuille')
      .set('Authorization', `Bearer ${COLLAB_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.dossiers).toHaveLength(0);
    expect(res.body.stats.nbDossiers).toBe(0);
    expect(res.body.stats.caAnnuel).toBe(0);
    expect(res.body.stats.nbRetard).toBe(0);
  });

  test('un expert peut consulter le portefeuille d\'un autre utilisateur', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/portefeuille?userId=999')
      .set('Authorization', `Bearer ${EXPERT_TOKEN}`);

    expect(res.status).toBe(200);
  });
});

// ─── GET /cabinet ─────────────────────────────────────────────────────────────

describe('GET /api/portefeuille/cabinet — contrôle d\'accès', () => {
  test('403 si rôle collaborateur', async () => {
    const res = await request(app)
      .get('/api/portefeuille/cabinet')
      .set('Authorization', `Bearer ${COLLAB_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/portefeuille/cabinet — données', () => {
  beforeEach(() => jest.clearAllMocks());

  test('retourne total_clients réel (pas la somme des responsables)', async () => {
    pool.query
      // 1er appel : SELECT COUNT(*) total_clients
      .mockResolvedValueOnce([[{ total_clients: 306 }]])
      // 2e appel : collaborateurs + dossiers
      .mockResolvedValueOnce([[
        {
          utilisateur_id: 5, prenom: 'Théo', nom: 'D', role_metier: 'collaborateur',
          client_id: 10, client_nom: 'Dupont SARL', role_sur_dossier: 'responsable',
          ldm_montant: '2400',
        },
      ]]);

    const res = await request(app)
      .get('/api/portefeuille/cabinet')
      .set('Authorization', `Bearer ${EXPERT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_clients', 306);
    expect(res.body).toHaveProperty('collaborateurs');
  });
});
