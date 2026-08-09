'use strict';
/**
 * Route /api/budget-ligne — CRUD sur budget_ligne (chantier F).
 *
 * Verrou métier : toute mutation (POST/PUT/DELETE) est REFUSÉE si la lettre
 * de mission porteuse est en statut `signee`, `active`, `resiliee`, `echue`,
 * `annulee` ou `archivee`. Un contrat exécuté ou en cours d'exécution ne
 * peut pas voir ses honoraires modifiés a posteriori. Même règle que le
 * CLI `backend/src/jobs/recalculer-taux.js` — les deux chemins d'écriture
 * appliquent la même politique.
 *
 * Le calcul minutes_annuelles / montant_ht / mise à jour honoraires_ht est
 * délégué au moteur `backend/src/production/budget.js` : le taux est figé
 * à la création et jamais réécrit ici.
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const budget = require('../production/budget');

const STATUTS_LDM_LOCKED = new Set([
  'signee', 'active', 'resiliee', 'echue', 'annulee', 'archivee',
]);

// Rôles autorisés à écrire — mêmes que la création LDM (expert / chef mission).
const ROLES_ECRITURE = ['expert', 'chef_mission'];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function ligneAvecStatutLdm(id) {
  const [[row]] = await pool.query(
    `SELECT bl.*, lm.statut AS ldm_statut, lm.numero AS ldm_numero
       FROM budget_ligne bl
       JOIN ldm_missions m       ON m.id = bl.mission_id
       JOIN lettres_mission lm   ON lm.id = m.lettre_mission_id
      WHERE bl.id = ?`,
    [id]
  );
  return row || null;
}

async function statutLdmDeMission(missionId) {
  const [[row]] = await pool.query(
    `SELECT lm.statut, lm.numero
       FROM ldm_missions m
       JOIN lettres_mission lm ON lm.id = m.lettre_mission_id
      WHERE m.id = ?`,
    [missionId]
  );
  return row || null;
}

function refusSiLocked(res, statut, numero) {
  if (STATUTS_LDM_LOCKED.has(statut)) {
    res.status(409).json({
      message: `LDM ${numero} en statut "${statut}" : les lignes de budget ne peuvent pas être modifiées.`,
    });
    return true;
  }
  return false;
}

// ── Référentiels (lecture publique aux utilisateurs authentifiés) ───────────

router.get('/referentiel/taux-grade', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT grade, libelle, role_applicatif, taux_horaire_cible_eur, complexite_correspondante
         FROM taux_grade ORDER BY taux_horaire_cible_eur ASC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/referentiel/code-temps', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT code, famille_cle, famille_libelle, libelle, regime_defaut,
              exige_dossier, saisie_groupee, exclu_ratio_productivite, donnee_sensible
         FROM code_temps
        WHERE actif = 1 AND archive_le IS NULL
        ORDER BY famille_cle, code`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── Lecture des lignes ──────────────────────────────────────────────────────

// GET /api/budget-ligne?mission_id=X — lignes d'une mission
router.get('/', verifyToken, async (req, res) => {
  const missionId = Number(req.query.mission_id);
  if (!missionId) return res.status(400).json({ message: 'mission_id requis' });
  try {
    const [rows] = await pool.query(
      `SELECT bl.*, ct.libelle AS code_temps_libelle, ct.famille_libelle AS code_temps_famille
         FROM budget_ligne bl
         JOIN code_temps ct ON ct.code = bl.code_temps
        WHERE bl.mission_id = ?
        ORDER BY bl.poste, bl.ordre, bl.id`,
      [missionId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/budget-ligne/:id — une ligne
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const row = await ligneAvecStatutLdm(Number(req.params.id));
    if (!row) return res.status(404).json({ message: 'Ligne introuvable' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── Écriture ────────────────────────────────────────────────────────────────

// POST /api/budget-ligne — création
router.post('/', verifyToken, requireRole(...ROLES_ECRITURE), async (req, res) => {
  const {
    mission_id, code_temps, grade, quantite_minutes, periodicite,
    poste, origine, libelle, ordre,
  } = req.body;

  if (!mission_id || !code_temps || !grade || quantite_minutes == null || !periodicite) {
    return res.status(400).json({
      message: 'Champs requis : mission_id, code_temps, grade, quantite_minutes, periodicite',
    });
  }

  try {
    const ldm = await statutLdmDeMission(mission_id);
    if (!ldm) return res.status(404).json({ message: 'Mission introuvable' });
    if (refusSiLocked(res, ldm.statut, ldm.numero)) return;

    const id = await budget.creerLigne(pool, {
      missionId: mission_id,
      codeTemps: code_temps,
      grade,
      quantiteMinutes: quantite_minutes,
      periodicite,
      poste: poste || 'production',
      origine: origine || 'saisie',
      libelle: libelle || null,
      ordre: ordre || 0,
      creePar: req.user.id,
    });

    const created = await ligneAvecStatutLdm(id);
    res.status(201).json(created);
  } catch (e) {
    // Contrainte CHECK MySQL sur quantite_minutes (multiple 15, 15-720)
    if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
      return res.status(400).json({
        message: 'quantite_minutes doit être un multiple de 15 entre 15 et 720',
      });
    }
    if (/Grade inconnu|Périodicité inconnue/.test(e.message)) {
      return res.status(400).json({ message: e.message });
    }
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/budget-ligne/:id — modification (quantite, périodicité, libellé, ordre)
// Le taux figé n'est PAS modifiable ici (invariant chantier F).
router.put('/:id', verifyToken, requireRole(...ROLES_ECRITURE), async (req, res) => {
  const id = Number(req.params.id);
  const { quantite_minutes, periodicite, libelle, ordre } = req.body;

  try {
    const ligne = await ligneAvecStatutLdm(id);
    if (!ligne) return res.status(404).json({ message: 'Ligne introuvable' });
    if (refusSiLocked(res, ligne.ldm_statut, ligne.ldm_numero)) return;

    await budget.mettreAJourLigne(pool, id, {
      quantiteMinutes: quantite_minutes,
      periodicite,
      libelle,
      ordre,
      modifiePar: req.user.id,
    });

    const updated = await ligneAvecStatutLdm(id);
    res.json(updated);
  } catch (e) {
    if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
      return res.status(400).json({
        message: 'quantite_minutes doit être un multiple de 15 entre 15 et 720',
      });
    }
    if (/Périodicité inconnue/.test(e.message)) {
      return res.status(400).json({ message: e.message });
    }
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/budget-ligne/:id
router.delete('/:id', verifyToken, requireRole(...ROLES_ECRITURE), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const ligne = await ligneAvecStatutLdm(id);
    if (!ligne) return res.status(404).json({ message: 'Ligne introuvable' });
    if (refusSiLocked(res, ligne.ldm_statut, ligne.ldm_numero)) return;

    await budget.supprimerLigne(pool, id);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
