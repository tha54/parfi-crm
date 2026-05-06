'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { calculer }   = require('../utils/dimensionnement');

/**
 * POST /api/chiffrage/calculer
 *
 * Calcule les lignes d'un chiffrage (mode temps + mode forfait) sans persistance.
 * Charge les tauxOverrides depuis taches_dimensionnement_config pour le mode temps.
 *
 * Body: {
 *   params: { type_entite, regime_fiscal, regime_tva, factures_achat, ... },
 *   rubriques_forfait?: [{ libelle, section?, montant_forfait, periodicite? }]
 * }
 *
 * Response: { lignes, lignes_temps, lignes_forfait, total_temps, total_forfait, total_ht }
 */
router.post('/calculer', verifyToken, async (req, res) => {
  try {
    const { params = {}, rubriques_forfait = [] } = req.body;

    // Charger les surcharges de taux depuis la config
    let tauxOverrides = {};
    try {
      const [rows] = await pool.query(
        'SELECT libelle_tache, taux_specifique FROM taches_dimensionnement_config WHERE taux_specifique IS NOT NULL'
      );
      rows.forEach(r => { tauxOverrides[r.libelle_tache] = r.taux_specifique; });
    } catch { /* table absente ou colonne manquante — on continue sans overrides */ }

    const result = calculer({ params, tauxOverrides, rubriques_forfait });
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: 'Erreur calcul chiffrage', error: e.message });
  }
});

module.exports = router;
