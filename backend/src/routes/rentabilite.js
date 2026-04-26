const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// GET / — rentabilité globale de toutes les missions
router.get('/', verifyToken, async (req, res) => {
  try {
    const { intervenantId, statut, annee } = req.query;
    let where = '1=1';
    const params = [];
    if (intervenantId) { where += ' AND m.intervenantId = ?'; params.push(intervenantId); }
    if (statut) { where += ' AND m.statut = ?'; params.push(statut); }
    if (annee) { where += ' AND YEAR(m.createdAt) = ?'; params.push(annee); }

    const [missions] = await pool.query(
      `SELECT m.*,
        c.raisonSociale AS contactNom,
        CONCAT(i.prenom, ' ', i.nom) AS intervenantNom,
        COALESCE((SELECT SUM(totalHT) FROM factures f WHERE f.contactId = m.contactId AND f.statut IN ('payee','partielle')),0) AS caFacture,
        ROUND(m.tempsPasseH / NULLIF(m.tempsBudgeteH,0) * 100, 1) AS tauxUtilisation,
        ROUND(COALESCE((SELECT SUM(totalHT) FROM factures f WHERE f.contactId = m.contactId AND f.statut IN ('payee','partielle')),0) / NULLIF(m.honorairesBudgetes,0) * 100, 1) AS tauxRentabilite,
        (COALESCE((SELECT SUM(totalHT) FROM factures f WHERE f.contactId = m.contactId AND f.statut IN ('payee','partielle')),0) - m.honorairesBudgetes) AS boniMali
       FROM missions m
       LEFT JOIN contacts c ON m.contactId = c.id
       LEFT JOIN intervenants i ON m.intervenantId = i.id
       WHERE ${where}
       ORDER BY m.createdAt DESC`,
      params
    );

    // Stats globales
    const totals = missions.reduce((acc, m) => {
      acc.totalBudget += Number(m.honorairesBudgetes || 0);
      acc.totalCaFacture += Number(m.caFacture || 0);
      acc.totalTempsBudgete += Number(m.tempsBudgeteH || 0);
      acc.totalTempsPasse += Number(m.tempsPasseH || 0);
      return acc;
    }, { totalBudget: 0, totalCaFacture: 0, totalTempsBudgete: 0, totalTempsPasse: 0 });

    totals.tauxRentabiliteGlobal = totals.totalBudget > 0
      ? Math.round((totals.totalCaFacture / totals.totalBudget) * 100)
      : 0;
    totals.tauxUtilisationGlobal = totals.totalTempsBudgete > 0
      ? Math.round((totals.totalTempsPasse / totals.totalTempsBudgete) * 100)
      : 0;

    // Par collaborateur
    const [parCollab] = await pool.query(
      `SELECT i.id, CONCAT(i.prenom, ' ', i.nom) AS nom, i.categorie,
        COUNT(m.id) AS nbMissions,
        COALESCE(SUM(m.honorairesBudgetes),0) AS totalBudget,
        COALESCE(SUM(m.tempsBudgeteH),0) AS totalTempsBudgete,
        COALESCE(SUM(m.tempsPasseH),0) AS totalTempsPasse
       FROM intervenants i
       LEFT JOIN missions m ON m.intervenantId = i.id AND m.statut IN ('en_cours','terminee')
       WHERE i.actif = 1
       GROUP BY i.id
       ORDER BY i.nom`
    );

    res.json({ missions, totals, parCollaborateur: parCollab });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /charge-travail — charge par collaborateur
router.get('/charge-travail', verifyToken, async (req, res) => {
  try {
    const [intervenants] = await pool.query(
      `SELECT i.id, CONCAT(i.prenom, ' ', i.nom) AS nom, i.categorie,
        COUNT(DISTINCT m.id) AS nbMissions,
        COALESCE(SUM(m.tempsBudgeteH),0) AS tempsBudgeteTotal,
        COALESCE(SUM(m.tempsPasseH),0) AS tempsPasseTotal,
        COUNT(DISTINCT CASE WHEN t.statut IN ('a_faire','en_cours') AND t.date_echeance >= NOW() AND t.date_echeance <= DATE_ADD(NOW(), INTERVAL 7 DAY) THEN t.id END) AS tachesSemaine
       FROM intervenants i
       LEFT JOIN missions m ON m.intervenantId = i.id AND m.statut = 'en_cours'
       LEFT JOIN taches t ON t.utilisateur_id = i.utilisateurId AND t.statut != 'termine'
       WHERE i.actif = 1
       GROUP BY i.id
       ORDER BY i.nom`
    );
    res.json(intervenants);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

module.exports = router;
