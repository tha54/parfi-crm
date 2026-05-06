'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// GET / — alertes équipe + événements récents cabinet
router.get('/', verifyToken, async (req, res) => {
  try {
    const [prospects] = await pool.query(
      `SELECT 'prospect' AS type, id, nom AS label, cree_le AS date_evt
       FROM prospects
       WHERE statut != 'perdu'
       ORDER BY cree_le DESC LIMIT 8`
    );

    const [ldm] = await pool.query(
      `SELECT 'ldm_signe' AS type, lm.id,
         CONCAT(COALESCE(c.nom, 'Client'), ' — LDM ', lm.numero) AS label,
         lm.dateSignatureClient AS date_evt
       FROM lettres_mission lm
       LEFT JOIN clients c ON lm.client_id = c.id
       WHERE lm.dateSignatureClient IS NOT NULL
       ORDER BY lm.dateSignatureClient DESC LIMIT 8`
    );

    const evenements = [...prospects, ...ldm]
      .filter(e => e.date_evt)
      .map(e => ({ ...e, date_evt: e.date_evt instanceof Date ? e.date_evt.toISOString() : String(e.date_evt) }))
      .sort((a, b) => new Date(b.date_evt) - new Date(a.date_evt))
      .slice(0, 20);

    // Alertes équipe incomplète — expert et chef_mission uniquement
    let alertes = [];
    if (['expert', 'chef_mission'].includes(req.user.role)) {
      const [rows] = await pool.query(
        `SELECT c.id, c.nom,
           (SELECT COUNT(*) FROM attributions WHERE client_id = c.id AND role_sur_dossier = 'responsable') > 0 AS has_responsable,
           (SELECT COUNT(*) FROM attributions WHERE client_id = c.id AND role_sur_dossier = 'assistant')  > 0 AS has_assistant
         FROM clients c
         WHERE c.actif = 1
           AND (
             NOT EXISTS (SELECT 1 FROM attributions WHERE client_id = c.id AND role_sur_dossier = 'responsable')
             OR NOT EXISTS (SELECT 1 FROM attributions WHERE client_id = c.id AND role_sur_dossier = 'assistant')
           )
         ORDER BY c.nom
         LIMIT 30`
      );
      alertes = rows.map(c => {
        const parts = [];
        if (!c.has_responsable) parts.push('sans responsable');
        if (!c.has_assistant)   parts.push('sans collaborateur');
        return { type: 'client_incomplet', id: c.id, label: c.nom, detail: parts.join(' & ') };
      });
    }

    res.json({ alertes, evenements });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

module.exports = router;
