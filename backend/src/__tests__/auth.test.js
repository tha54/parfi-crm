/**
 * Tests unitaires — middleware d'authentification (middleware/auth.js)
 * Aucune dépendance DB ni HTTP. Tests purs sur les middlewares verifyToken et requireRole.
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret-auth';
process.env.JWT_SECRET = JWT_SECRET;

const { verifyToken, requireRole } = require('../middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

// ─── verifyToken ─────────────────────────────────────────────────────────────

describe('verifyToken', () => {
  test('401 si aucun header Authorization et aucun query param token', () => {
    const req = { headers: {}, query: {} };
    const res = mockRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Token manquant' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('401 si token invalide (chaîne arbitraire)', () => {
    const req = { headers: { authorization: 'Bearer invalid.jwt.token' }, query: {} };
    const res = mockRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 si token signé avec une clé différente', () => {
    const fakeToken = jwt.sign({ id: 1, role: 'expert' }, 'mauvaise-cle');
    const req = { headers: { authorization: `Bearer ${fakeToken}` }, query: {} };
    const res = mockRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('next() appelé et req.user rempli si token Bearer valide', () => {
    const payload = { id: 42, role: 'collaborateur', prenom: 'Théo' };
    const token = jwt.sign(payload, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` }, query: {} };
    const res = mockRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ id: 42, role: 'collaborateur', prenom: 'Théo' });
    expect(res.status).not.toHaveBeenCalled();
  });

  test('accepte le token en query param (?token=)', () => {
    const payload = { id: 7, role: 'expert', prenom: 'Thierry' };
    const token = jwt.sign(payload, JWT_SECRET);
    const req = { headers: {}, query: { token } };
    const res = mockRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ id: 7, role: 'expert' });
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe('requireRole', () => {
  test('403 si le rôle n\'est pas dans la liste autorisée', () => {
    const req = { user: { role: 'collaborateur' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('expert', 'chef_mission')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('next() appelé si le rôle est dans la liste', () => {
    const req = { user: { role: 'chef_mission' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('expert', 'chef_mission')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('fonctionne avec un seul rôle autorisé', () => {
    const req = { user: { role: 'expert' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('expert')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
