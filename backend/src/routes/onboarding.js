'use strict';
/**
 * Route /api/onboarding — pilote du parcours d'entrée en relation client.
 *
 * L'onboarding est créé automatiquement à la signature LDM (voir
 * ldmService.transitionner('signer')). Cette route sert à le consulter,
 * mettre à jour le statut des 27 étapes E01..E27, et accéder à ses annexes
 * (dont les mandats, désormais rattachés via `onboarding_id`).
 *
 * Chantier G. Table `mandats.ldm_id` conservée pour rétro-compat mais la
 * relation métier vit désormais sur `onboarding_id`.
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const ROLES_ECRITURE = ['expert', 'chef_mission', 'collaborateur'];

// ── GET / — liste des onboardings en cours (léger) ─────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.dossier_id, o.date_signature, o.date_fin_cible, o.statut,
              o.reprise_confrere, c.id AS client_id, c.nom AS client_nom,
              (SELECT COUNT(*) FROM onboarding_etape e WHERE e.onboarding_id = o.id) AS nb_etapes,
              (SELECT COUNT(*) FROM onboarding_etape e WHERE e.onboarding_id = o.id AND e.statut = 'F') AS nb_faites
         FROM onboarding o
         JOIN dossier d ON d.id = o.dossier_id
         JOIN clients c ON c.id = d.client_id
        WHERE o.archive_le IS NULL
        ORDER BY o.date_signature DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── GET /:dossierId — onboarding + étapes + mandats ─────────────────────────
router.get('/:dossierId', verifyToken, async (req, res) => {
  const dossierId = Number(req.params.dossierId);
  if (!dossierId) return res.status(400).json({ message: 'dossierId invalide' });

  try {
    const [[onboarding]] = await pool.query(
      `SELECT o.*, c.id AS client_id, c.nom AS client_nom, c.siren AS client_siren
         FROM onboarding o
         JOIN dossier d ON d.id = o.dossier_id
         JOIN clients c ON c.id = d.client_id
        WHERE o.dossier_id = ?
        LIMIT 1`,
      [dossierId]
    );
    if (!onboarding) return res.status(404).json({ message: 'Onboarding introuvable pour ce dossier' });

    const [etapes] = await pool.query(
      `SELECT e.id, e.code_modele, e.date_echeance, e.statut, e.motif_na,
              e.fait_par, e.fait_le, e.commentaire,
              m.phase, m.ordre, m.libelle, m.responsable, m.bloquant, m.delai_jours,
              u.prenom AS fait_par_prenom, u.nom AS fait_par_nom
         FROM onboarding_etape e
         JOIN onboarding_etape_modele m ON m.code = e.code_modele
         LEFT JOIN utilisateurs u ON u.id = e.fait_par
        WHERE e.onboarding_id = ?
        ORDER BY m.ordre, e.id`,
      [onboarding.id]
    );

    const [mandats] = await pool.query(
      `SELECT id, ldm_id, onboarding_id, onboarding_etape_id, client_id, type, libelle,
              rum, ics, iban, bic, statut, signe, date_signature,
              yousign_request_id, yousign_signer_id, chemin_pdf_signe
         FROM mandats
        WHERE onboarding_id = ?
        ORDER BY id`,
      [onboarding.id]
    );

    res.json({ onboarding, etapes, mandats });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── PUT /etapes/:etapeId — mise à jour statut d'étape ──────────────────────
// Body accepté : { statut, motif_na, commentaire }
// - statut='F' → fait_le = now(), fait_par = user
// - statut='NA' → motif_na requis
router.put('/etapes/:etapeId', verifyToken, requireRole(...ROLES_ECRITURE), async (req, res) => {
  const etapeId = Number(req.params.etapeId);
  const { statut, motif_na, commentaire } = req.body || {};
  const STATUTS_VALIDES = ['N', 'EC', 'F', 'NA'];
  if (!STATUTS_VALIDES.includes(statut)) {
    return res.status(400).json({ message: `statut invalide (attendu ${STATUTS_VALIDES.join('/')})` });
  }
  if (statut === 'NA' && (!motif_na || !String(motif_na).trim())) {
    return res.status(400).json({ message: 'motif_na requis pour statut NA' });
  }

  try {
    const [[etape]] = await pool.query(`SELECT id FROM onboarding_etape WHERE id = ?`, [etapeId]);
    if (!etape) return res.status(404).json({ message: 'Étape introuvable' });

    const faitLe = statut === 'F' ? new Date() : null;
    const faitPar = statut === 'F' ? req.user.id : null;

    await pool.query(
      `UPDATE onboarding_etape
          SET statut = ?, motif_na = ?, commentaire = COALESCE(?, commentaire),
              fait_le = ?, fait_par = ?, modifie_par = ?
        WHERE id = ?`,
      [statut, statut === 'NA' ? motif_na : null, commentaire ?? null,
       faitLe, faitPar, req.user.id, etapeId]
    );

    const [[updated]] = await pool.query(
      `SELECT e.*, u.prenom AS fait_par_prenom, u.nom AS fait_par_nom
         FROM onboarding_etape e
         LEFT JOIN utilisateurs u ON u.id = e.fait_par
        WHERE e.id = ?`,
      [etapeId]
    );
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
