'use strict';
/**
 * Routes API pour la gestion des mandats — annexes d'onboarding (chantier G).
 *
 * Les mandats (prélèvement SEPA, mandat fiscal impôts, mandat social URSSAF,
 * plateforme EDI) sont désormais rattachés à l'onboarding du dossier via
 * `mandats.onboarding_id`. La colonne `ldm_id` reste renseignée en rétro-compat
 * mais n'est plus la relation métier de référence.
 *
 * Endpoints :
 *   GET    /api/mandats?onboarding_id=X          — liste des mandats d'un onboarding
 *   GET    /api/mandats/en-attente-rib?client_id — mandats SEPA sans IBAN (compat)
 *   POST   /api/mandats                          — créer un mandat (onboarding_id requis)
 *   PUT    /api/mandats/:id                      — MAJ générique (libelle, statut, signe, date_signature)
 *   PUT    /api/mandats/:id/rib                  — { iban, bic }, valide mod 97 → statut actif
 *   DELETE /api/mandats/:id
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { validerIban } = require('../utils/ldmSignatureChain');

const TYPES_VALIDES = ['prelevement', 'impots', 'urssaf', 'autre'];
const STATUTS_VALIDES = ['en_attente_rib', 'actif', 'revoque', 'suspendu'];
const ROLES_ECRITURE = ['expert', 'chef_mission', 'collaborateur'];

// ── GET /?onboarding_id=X — liste des mandats d'un onboarding ──────────────
router.get('/', verifyToken, async (req, res) => {
  const onboardingId = req.query.onboarding_id ? Number(req.query.onboarding_id) : null;
  if (!onboardingId) return res.status(400).json({ message: 'onboarding_id requis' });
  try {
    const [rows] = await pool.query(
      `SELECT id, ldm_id, onboarding_id, onboarding_etape_id, client_id, type, libelle,
              rum, ics, iban, bic, statut, signe, date_signature,
              yousign_request_id, yousign_signer_id, chemin_pdf_signe, contrat_id
         FROM mandats
        WHERE onboarding_id = ?
        ORDER BY FIELD(type,'prelevement','impots','urssaf','autre'), id`,
      [onboardingId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ── GET /en-attente-rib ─────────────────────────────────────────────────────
// Retourne les mandats SEPA dont l'IBAN est manquant, filtrable par client.
// Aucune donnée n'est renvoyée pour un client_id inexistant.
router.get('/en-attente-rib', verifyToken, async (req, res) => {
  const clientId = req.query.client_id ? Number(req.query.client_id) : null;
  try {
    const where = ['m.statut = ?'];
    const params = ['en_attente_rib'];
    if (clientId) { where.push('m.client_id = ?'); params.push(clientId); }
    const [rows] = await pool.query(
      `SELECT m.id, m.ldm_id, m.client_id, m.type, m.libelle, m.rum, m.ics, m.statut,
              l.numero AS ldm_numero, c.nom AS client_nom
       FROM mandats m
       LEFT JOIN lettres_mission l ON l.id = m.ldm_id
       LEFT JOIN clients c ON c.id = m.client_id
       WHERE ${where.join(' AND ')}
       ORDER BY m.id DESC`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ── PUT /:id/rib ────────────────────────────────────────────────────────────
// Reçoit { iban, bic } ; valide l'IBAN par clé de contrôle (mod 97).
// À la validation, passe le mandat en 'actif'.
router.put('/:id/rib', verifyToken, async (req, res) => {
  const { iban, bic } = req.body || {};
  if (!iban) return res.status(400).json({ message: 'IBAN requis' });
  const ibanClean = String(iban).replace(/\s+/g, '').toUpperCase();
  const bicClean  = bic ? String(bic).replace(/\s+/g, '').toUpperCase() : null;
  if (!validerIban(ibanClean)) return res.status(400).json({ message: 'IBAN invalide (clé de contrôle)' });
  if (bicClean && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bicClean)) {
    return res.status(400).json({ message: 'BIC invalide' });
  }
  try {
    const [[m]] = await pool.query('SELECT id, statut FROM mandats WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ message: 'Mandat introuvable' });
    // Ne pas re-écraser un mandat révoqué / suspendu par erreur
    if (m.statut === 'revoque' || m.statut === 'suspendu') {
      return res.status(400).json({ message: `Mandat en statut ${m.statut}, non modifiable` });
    }
    await pool.query(
      `UPDATE mandats SET iban = ?, bic = ?, statut = 'actif' WHERE id = ?`,
      [ibanClean, bicClean, req.params.id]
    );
    res.json({ ok: true, statut: 'actif' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ── POST / — créer un mandat ────────────────────────────────────────────────
router.post('/', verifyToken, requireRole(...ROLES_ECRITURE), async (req, res) => {
  const { onboarding_id, onboarding_etape_id, type, libelle, rum, ics } = req.body || {};
  if (!onboarding_id) return res.status(400).json({ message: 'onboarding_id requis' });
  if (!TYPES_VALIDES.includes(type)) {
    return res.status(400).json({ message: `type invalide (${TYPES_VALIDES.join('/')})` });
  }
  try {
    const [[onb]] = await pool.query(
      `SELECT o.id, d.client_id
         FROM onboarding o JOIN dossier d ON d.id = o.dossier_id
        WHERE o.id = ?`, [onboarding_id]
    );
    if (!onb) return res.status(404).json({ message: 'onboarding introuvable' });

    const [ins] = await pool.query(
      `INSERT INTO mandats
         (onboarding_id, onboarding_etape_id, client_id, type, libelle, rum, ics, statut, signe)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [onboarding_id, onboarding_etape_id || null, onb.client_id,
       type, libelle || null, rum || null, ics || null,
       type === 'prelevement' ? 'en_attente_rib' : 'actif']
    );
    const [[created]] = await pool.query(`SELECT * FROM mandats WHERE id = ?`, [ins.insertId]);
    res.status(201).json(created);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Mandat déjà existant (RUM unique)' });
    }
    res.status(500).json({ message: e.message });
  }
});

// ── PUT /:id — MAJ générique ────────────────────────────────────────────────
// Body : { libelle?, statut?, signe?, date_signature?, onboarding_etape_id? }
router.put('/:id', verifyToken, requireRole(...ROLES_ECRITURE), async (req, res) => {
  const id = Number(req.params.id);
  const { libelle, statut, signe, date_signature, onboarding_etape_id } = req.body || {};
  if (statut !== undefined && !STATUTS_VALIDES.includes(statut)) {
    return res.status(400).json({ message: `statut invalide (${STATUTS_VALIDES.join('/')})` });
  }
  try {
    const [[m]] = await pool.query(`SELECT id FROM mandats WHERE id = ?`, [id]);
    if (!m) return res.status(404).json({ message: 'Mandat introuvable' });

    const sets = [];
    const params = [];
    if (libelle !== undefined)             { sets.push('libelle = ?');             params.push(libelle); }
    if (statut !== undefined)              { sets.push('statut = ?');              params.push(statut); }
    if (signe !== undefined)               { sets.push('signe = ?');               params.push(signe ? 1 : 0); }
    if (date_signature !== undefined)      { sets.push('date_signature = ?');      params.push(date_signature || null); }
    if (onboarding_etape_id !== undefined) { sets.push('onboarding_etape_id = ?'); params.push(onboarding_etape_id || null); }
    if (sets.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });

    params.push(id);
    await pool.query(`UPDATE mandats SET ${sets.join(', ')} WHERE id = ?`, params);
    const [[updated]] = await pool.query(`SELECT * FROM mandats WHERE id = ?`, [id]);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── DELETE /:id ─────────────────────────────────────────────────────────────
router.delete('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[m]] = await pool.query(`SELECT id, signe FROM mandats WHERE id = ?`, [req.params.id]);
    if (!m) return res.status(404).json({ message: 'Mandat introuvable' });
    if (m.signe) return res.status(409).json({ message: 'Mandat signé : suppression interdite (révocation via PUT statut=revoque)' });
    await pool.query(`DELETE FROM mandats WHERE id = ?`, [req.params.id]);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
