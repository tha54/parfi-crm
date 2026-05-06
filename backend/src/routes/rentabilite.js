'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// GET / — rentabilité par client et par collaborateur (basée sur taches + tache_temps)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { clientId, collaborateurId, annee } = req.query;

    let clientWhere = 'c.actif = 1';
    const clientParams = [];
    if (clientId) { clientWhere += ' AND c.id = ?'; clientParams.push(clientId); }
    if (annee)    { clientWhere += ' AND YEAR(t.date_echeance) = ?'; clientParams.push(annee); }

    const [clients] = await pool.query(
      `SELECT
         c.id, c.nom,
         COALESCE(SUM(t.budget_minutes), 0)                                                AS budget_minutes,
         COALESCE(SUM(CASE WHEN tt.statut != 'rejetee' THEN tt.duree_minutes ELSE 0 END), 0) AS temps_realise_minutes,
         COALESCE(SUM(CASE WHEN tt.statut = 'validee'  THEN tt.duree_minutes ELSE 0 END), 0) AS temps_valide_minutes,
         COALESCE(SUM(CASE WHEN tt.statut = 'figee'    THEN tt.duree_minutes ELSE 0 END), 0) AS temps_figee_minutes,
         COUNT(DISTINCT t.id) AS nb_taches
       FROM clients c
       LEFT JOIN taches t  ON t.client_id = c.id AND t.budget_minutes > 0
       LEFT JOIN tache_temps tt ON tt.tache_id = t.id
       WHERE ${clientWhere}
       GROUP BY c.id
       HAVING budget_minutes > 0 OR temps_realise_minutes > 0
       ORDER BY c.nom`,
      clientParams
    );

    let collabWhere = 'u.actif = 1 AND u.role != \'client\'';
    const collabParams = [];
    if (collaborateurId) { collabWhere += ' AND u.id = ?'; collabParams.push(collaborateurId); }

    const [collaborateurs] = await pool.query(
      `SELECT
         u.id, u.prenom, u.nom, u.role_metier,
         COALESCE(SUM(t.budget_minutes), 0)                                                AS budget_minutes,
         COALESCE(SUM(CASE WHEN tt.statut != 'rejetee' THEN tt.duree_minutes ELSE 0 END), 0) AS temps_realise_minutes,
         COALESCE(SUM(CASE WHEN tt.statut = 'validee'  THEN tt.duree_minutes ELSE 0 END), 0) AS temps_valide_minutes,
         COALESCE(SUM(CASE WHEN tt.statut = 'figee'    THEN tt.duree_minutes ELSE 0 END), 0) AS temps_figee_minutes,
         COUNT(DISTINCT t.id) AS nb_taches
       FROM utilisateurs u
       LEFT JOIN taches t  ON t.utilisateur_id = u.id AND t.budget_minutes > 0
       LEFT JOIN tache_temps tt ON tt.tache_id = t.id AND tt.utilisateur_id = u.id
       WHERE ${collabWhere}
       GROUP BY u.id
       HAVING budget_minutes > 0 OR temps_realise_minutes > 0
       ORDER BY u.nom`,
      collabParams
    );

    // Compute derived fields and global KPIs
    const addDerived = (rows) => rows.map(r => {
      const bm = Number(r.budget_minutes);
      const rm = Number(r.temps_realise_minutes);
      const vm = Number(r.temps_valide_minutes);
      const fm = Number(r.temps_figee_minutes);
      const taux_utilisation = bm > 0 ? Math.round((rm / bm) * 1000) / 10 : 0;
      const fiabilite = (vm + fm) > 0 ? Math.round((vm / (vm + fm)) * 100) : null;
      return { ...r, taux_utilisation, fiabilite };
    });

    const clientsOut = addDerived(clients);
    const collabsOut = addDerived(collaborateurs);

    const totals = {
      budget_minutes:           clientsOut.reduce((s, r) => s + Number(r.budget_minutes), 0),
      temps_realise_minutes:    clientsOut.reduce((s, r) => s + Number(r.temps_realise_minutes), 0),
      temps_valide_minutes:     clientsOut.reduce((s, r) => s + Number(r.temps_valide_minutes), 0),
    };
    totals.taux_utilisation_global = totals.budget_minutes > 0
      ? Math.round((totals.temps_realise_minutes / totals.budget_minutes) * 1000) / 10 : 0;

    res.json({ clients: clientsOut, collaborateurs: collabsOut, totals });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

module.exports = router;
