'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// GET / — portefeuille du collaborateur connecté (ou d'un autre si expert/chef)
router.get('/', verifyToken, async (req, res) => {
  try {
    const targetId = req.query.userId ? Number(req.query.userId) : req.user.id;

    if (targetId !== req.user.id && !['expert', 'chef_mission'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    // Dossiers attribués OU liés via LDM (collaborateur_id / chef_mission_id)
    const [dossiers] = await pool.query(`
      SELECT
        c.id, c.nom, c.siren, c.type, c.regime,
        COALESCE(a.role_sur_dossier, 'responsable') AS role_sur_dossier,
        lm.id               AS ldm_id,
        lm.numero           AS ldm_numero,
        lm.statut           AS ldm_statut,
        lm.montantHonorairesHT AS ldm_montant,
        lm.dateDebut        AS ldm_date_debut,
        COALESCE(COUNT(DISTINCT t.id), 0)                                                              AS nb_taches,
        COALESCE(SUM(CASE WHEN t.statut IN ('a_faire','en_cours') AND t.date_echeance < CURDATE() THEN 1 ELSE 0 END), 0) AS nb_retard,
        COALESCE(SUM(CASE WHEN t.statut = 'a_faire'  THEN 1 ELSE 0 END), 0)                           AS nb_a_faire,
        COALESCE(SUM(CASE WHEN t.statut = 'en_cours' THEN 1 ELSE 0 END), 0)                           AS nb_en_cours,
        MIN(CASE WHEN t.statut IN ('a_faire','en_cours') AND t.date_echeance IS NOT NULL THEN t.date_echeance END) AS prochaine_echeance
      FROM clients c
      LEFT JOIN attributions a ON a.client_id = c.id
        AND a.utilisateur_id = ? AND a.role_sur_dossier IN ('responsable','assistant','chef_mission')
      LEFT JOIN lettres_mission lm ON lm.client_id = c.id AND lm.statut = 'active'
      LEFT JOIN taches t ON t.client_id = c.id AND t.utilisateur_id = ? AND t.statut != 'termine'
      WHERE c.actif = 1
        AND (
          a.client_id IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM lettres_mission lm_link
            WHERE lm_link.client_id = c.id
              AND (lm_link.collaborateur_id = ? OR lm_link.chef_mission_id = ?)
              AND lm_link.statut NOT IN ('brouillon', 'resiliee')
          )
        )
      GROUP BY c.id, lm.id, COALESCE(a.role_sur_dossier, 'responsable')
      ORDER BY
        FIELD(COALESCE(a.role_sur_dossier,'responsable'),'responsable','chef_mission','assistant'),
        nb_retard DESC, prochaine_echeance ASC, c.nom ASC
    `, [targetId, targetId, targetId, targetId]);

    // Toutes les tâches actives du collaborateur
    const [taches] = await pool.query(`
      SELECT
        t.id, t.libelle, t.titre, t.statut, t.date_echeance, t.priorite,
        t.client_id, t.periodicite, t.type_travail, t.budget_minutes,
        t.source, t.origine, t.categorie,
        c.nom AS client_nom
      FROM taches t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE t.utilisateur_id = ?
      ORDER BY
        CASE
          WHEN t.statut IN ('a_faire','en_cours') AND t.date_echeance < CURDATE() THEN 0
          WHEN t.statut = 'en_cours' THEN 1
          WHEN t.statut = 'a_faire'  THEN 2
          ELSE 3
        END,
        t.date_echeance ASC
    `, [targetId]);

    const actives = taches.filter(t => t.statut !== 'termine');

    const stats = {
      nbDossiers: dossiers.length,
      nbRetard:   dossiers.reduce((s, d) => s + Number(d.nb_retard), 0),
      nbEnCours:  dossiers.reduce((s, d) => s + Number(d.nb_en_cours), 0),
      nbAFaire:   actives.filter(t => t.statut === 'a_faire').length,
      caAnnuel:   dossiers.reduce((s, d) => s + Number(d.ldm_montant || 0), 0),
    };

    res.json({ dossiers, taches, stats });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// GET /cabinet — vue d'ensemble expert : tous les collaborateurs + leurs dossiers
router.get('/cabinet', verifyToken, async (req, res) => {
  if (!['expert', 'chef_mission'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Réservé aux experts et chefs de mission' });
  }
  try {
    const [[{ total_clients }]] = await pool.query(
      `SELECT COUNT(*) AS total_clients FROM clients WHERE actif=1`
    );

    const [rows] = await pool.query(`
      SELECT
        u.id          AS user_id,
        u.prenom, u.nom,
        u.role, u.role_metier,
        a.role_sur_dossier,
        c.id          AS client_id,
        c.nom         AS client_nom,
        c.siren,
        lm.id         AS ldm_id,
        lm.numero     AS ldm_numero,
        lm.statut     AS ldm_statut,
        lm.montantHonorairesHT AS ldm_montant,
        COALESCE(COUNT(DISTINCT t.id), 0) AS nb_taches,
        COALESCE(SUM(CASE WHEN t.statut IN ('a_faire','en_cours') AND t.date_echeance < CURDATE() THEN 1 ELSE 0 END), 0) AS nb_retard,
        COALESCE(SUM(CASE WHEN t.statut = 'en_cours' THEN 1 ELSE 0 END), 0) AS nb_en_cours,
        MIN(CASE WHEN t.statut IN ('a_faire','en_cours') AND t.date_echeance IS NOT NULL THEN t.date_echeance END) AS prochaine_echeance
      FROM utilisateurs u
      LEFT JOIN attributions a  ON a.utilisateur_id = u.id
        AND a.role_sur_dossier IN ('responsable','assistant','chef_mission')
      LEFT JOIN clients c       ON c.id = a.client_id AND c.actif = 1
      LEFT JOIN lettres_mission lm ON lm.client_id = c.id AND lm.statut = 'active'
      LEFT JOIN taches t        ON t.client_id = c.id AND t.utilisateur_id = u.id AND t.statut != 'termine'
      WHERE u.actif = 1 AND u.role NOT IN ('client')
      GROUP BY u.id, c.id, lm.id, a.role_sur_dossier
      ORDER BY
        FIELD(COALESCE(u.role_metier,''), 'expert_comptable','chef_de_groupe','chef_de_mission',
          'collaborateur','collaborateur_medior','collaborateur_junior',
          'collaborateur_social','collaborateur_juridique','juriste'),
        u.nom ASC,
        FIELD(COALESCE(a.role_sur_dossier,''), 'responsable','chef_mission','assistant'),
        nb_retard DESC, c.nom ASC
    `);

    // Regrouper par utilisateur
    const usersMap = new Map();
    for (const r of rows) {
      if (!usersMap.has(r.user_id)) {
        usersMap.set(r.user_id, {
          id: r.user_id, prenom: r.prenom, nom: r.nom,
          role: r.role, role_metier: r.role_metier,
          dossiers: [],
        });
      }
      if (r.client_id) {
        usersMap.get(r.user_id).dossiers.push({
          id: r.client_id, nom: r.client_nom, siren: r.siren,
          role_sur_dossier: r.role_sur_dossier,
          ldm_id: r.ldm_id, ldm_numero: r.ldm_numero,
          ldm_statut: r.ldm_statut, ldm_montant: r.ldm_montant,
          nb_taches: Number(r.nb_taches), nb_retard: Number(r.nb_retard),
          nb_en_cours: Number(r.nb_en_cours),
          prochaine_echeance: r.prochaine_echeance,
        });
      }
    }

    const collaborateurs = Array.from(usersMap.values()).map(u => ({
      ...u,
      nb_dossiers: u.dossiers.length,
      nb_retard:   u.dossiers.reduce((s, d) => s + d.nb_retard, 0),
      nb_taches:   u.dossiers.reduce((s, d) => s + d.nb_taches, 0),
      ca_annuel:   u.dossiers
        .filter(d => d.role_sur_dossier === 'responsable')
        .reduce((s, d) => s + Number(d.ldm_montant || 0), 0),
    }));

    res.json({ collaborateurs, total_clients: Number(total_clients) });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── /budget/synthese — résumé par collaborateur (expert/chef uniquement) ────
router.get('/budget/synthese', verifyToken, async (req, res) => {
  const isManager = ['expert','chef_mission'].includes(req.user.role) ||
    ['expert_comptable','chef_de_groupe','chef_de_mission'].includes(req.user.role_metier);
  if (!isManager) return res.status(403).json({ message: 'Accès refusé' });

  const p = req.query.periode || 'exercice';
  const tC = p === 'exercice' ? 'AND YEAR(tt2.date_travail)=YEAR(CURDATE())'
           : p === 'mois'     ? 'AND YEAR(tt2.date_travail)=YEAR(CURDATE()) AND MONTH(tt2.date_travail)=MONTH(CURDATE())'
           : '';
  const fC = p === 'exercice' ? 'AND YEAR(f2.dateEmission)=YEAR(CURDATE())'
           : p === 'mois'     ? 'AND YEAR(f2.dateEmission)=YEAR(CURDATE()) AND MONTH(f2.dateEmission)=MONTH(CURDATE())'
           : '';

  try {
    const [rows] = await pool.query(`
      SELECT
        u.id AS utilisateur_id, u.prenom, u.nom, u.role_metier,
        COUNT(DISTINCT c.id) AS nb_dossiers,
        COALESCE(SUM(
          COALESCE(lm.budget_minutes_collab,0)+COALESCE(lm.budget_minutes_chef,0)+COALESCE(lm.budget_minutes_expert,0)
        ),0) AS budget_minutes_total,
        COALESCE(SUM(COALESCE(lm.montant_annuel_ht, lm.montantHonorairesHT, 0)),0) AS budget_honoraires,
        (SELECT COALESCE(SUM(tt2.duree_minutes),0)
         FROM tache_temps tt2 JOIN taches ta2 ON ta2.id=tt2.tache_id
         JOIN utilisateurs u2 ON u2.id=tt2.utilisateur_id
         JOIN attributions a2 ON a2.client_id=ta2.client_id AND a2.utilisateur_id=u.id
         WHERE tt2.statut NOT IN ('rejetee')
           AND u2.role_metier NOT IN ('collaborateur_social','juriste','collaborateur_juridique')
           ${tC}
        ) AS temps_saisi_minutes,
        (SELECT COALESCE(SUM(f2.totalHT),0)
         FROM factures f2 JOIN attributions a3 ON a3.client_id=f2.client_id AND a3.utilisateur_id=u.id
         WHERE f2.statut NOT IN ('annulee','brouillon') ${fC}
        ) AS honoraires_factures
      FROM utilisateurs u
      JOIN attributions a ON a.utilisateur_id=u.id
      JOIN clients c ON c.id=a.client_id AND c.actif=1
      LEFT JOIN lettres_mission lm
        ON lm.client_id=c.id AND lm.statut IN ('signee','active')
        AND lm.id=(SELECT MAX(lm2.id) FROM lettres_mission lm2
                   WHERE lm2.client_id=c.id AND lm2.statut IN ('signee','active'))
      WHERE u.actif=1
        AND u.role_metier NOT IN ('collaborateur_social','juriste','collaborateur_juridique')
      GROUP BY u.id, u.prenom, u.nom, u.role_metier
      ORDER BY u.nom
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── /budget — tableau budget/temps par dossier pour un collaborateur ─────────
router.get('/budget', verifyToken, async (req, res) => {
  const isManager = ['expert','chef_mission'].includes(req.user.role) ||
    ['expert_comptable','chef_de_groupe','chef_de_mission'].includes(req.user.role_metier);

  let targetId = req.user.id;
  if (isManager && req.query.utilisateur_id) targetId = parseInt(req.query.utilisateur_id);

  const p = req.query.periode || 'exercice';
  const tC = p === 'exercice' ? 'AND YEAR(tt.date_travail)=YEAR(CURDATE())'
           : p === 'mois'     ? 'AND YEAR(tt.date_travail)=YEAR(CURDATE()) AND MONTH(tt.date_travail)=MONTH(CURDATE())'
           : '';
  const fC = p === 'exercice' ? 'AND YEAR(f.dateEmission)=YEAR(CURDATE())'
           : p === 'mois'     ? 'AND YEAR(f.dateEmission)=YEAR(CURDATE()) AND MONTH(f.dateEmission)=MONTH(CURDATE())'
           : '';

  try {
    const [rows] = await pool.query(`
      SELECT
        c.id AS client_id, c.nom AS client_nom, c.type AS client_type,
        lm.typeMission AS type_mission,
        COALESCE(lm.budget_minutes_collab,0)+COALESCE(lm.budget_minutes_chef,0)
          +COALESCE(lm.budget_minutes_expert,0) AS budget_minutes_total,
        COALESCE(lm.montant_annuel_ht, lm.montantHonorairesHT, 0) AS budget_honoraires,
        (SELECT COALESCE(SUM(tt.duree_minutes),0)
         FROM tache_temps tt JOIN taches ta ON ta.id=tt.tache_id
         JOIN utilisateurs u2 ON u2.id=tt.utilisateur_id
         WHERE ta.client_id=c.id AND tt.statut NOT IN ('rejetee')
           AND u2.role_metier NOT IN ('collaborateur_social','juriste','collaborateur_juridique')
           ${tC}
        ) AS temps_saisi_minutes,
        (SELECT COALESCE(SUM(f.totalHT),0)
         FROM factures f
         WHERE f.client_id=c.id AND f.statut NOT IN ('annulee','brouillon') ${fC}
        ) AS honoraires_factures
      FROM clients c
      JOIN attributions a ON a.client_id=c.id AND a.utilisateur_id=?
      LEFT JOIN lettres_mission lm
        ON lm.client_id=c.id AND lm.statut IN ('signee','active')
        AND lm.id=(SELECT MAX(lm2.id) FROM lettres_mission lm2
                   WHERE lm2.client_id=c.id AND lm2.statut IN ('signee','active'))
      WHERE c.actif=1
      ORDER BY c.nom
    `, [targetId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

module.exports = router;
