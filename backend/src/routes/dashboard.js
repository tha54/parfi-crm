const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.get('/kpis', verifyToken, async (req, res) => {
  try {
    const isExpertOrChef = ['expert', 'chef_mission'].includes(req.user.role);

    // ── Clients & prospects ───────────────────────────────────────────────────
    const [[{ clientsActifs }]] = await pool.query(
      "SELECT COUNT(*) AS clientsActifs FROM clients WHERE actif = 1 AND type = 'client'"
    );
    const [[{ prospects }]] = await pool.query(
      "SELECT COUNT(*) AS prospects FROM clients WHERE actif = 1 AND type = 'prospect'"
    );

    // ── Chiffre d'affaires ────────────────────────────────────────────────────
    const [[{ caFacture }]] = await pool.query(
      `SELECT COALESCE(SUM(totalHT),0) AS caFacture FROM factures
       WHERE statut IN ('envoyee','payee') AND YEAR(dateEmission) = YEAR(NOW())`
    );
    const [[{ caPrevisionnel }]] = await pool.query(
      `SELECT COALESCE(SUM(montantHonorairesHT),0) AS caPrevisionnel FROM lettres_mission
       WHERE statut IN ('envoyee','signee')`
    );

    // ── Devis & factures ──────────────────────────────────────────────────────
    const [[{ devisEnAttente }]] = await pool.query(
      "SELECT COUNT(*) AS devisEnAttente FROM devis WHERE statut = 'envoye'"
    );
    const [[{ impayesMontant }]] = await pool.query(
      `SELECT COALESCE(SUM(totalTTC),0) AS impayesMontant FROM factures
       WHERE statut IN ('envoyee','retard') AND dateEcheance < CURDATE()`
    );
    const [[{ impayesCount }]] = await pool.query(
      `SELECT COUNT(*) AS impayesCount FROM factures
       WHERE statut = 'envoyee' AND dateEcheance < CURDATE()`
    );

    // ── Missions ──────────────────────────────────────────────────────────────
    const [[{ missionsEnCours }]] = await pool.query(
      "SELECT COUNT(*) AS missionsEnCours FROM missions WHERE statut = 'en_cours'"
    );

    // ── Tâches ────────────────────────────────────────────────────────────────
    const userFilter = isExpertOrChef ? '' : `AND utilisateur_id = ${pool.escape(req.user.id)}`;
    const [[tachesStats]] = await pool.query(`
      SELECT
        SUM(CASE WHEN statut IN ('a_faire','en_cours') AND dateEcheance < CURDATE() THEN 1 ELSE 0 END) AS tachesEnRetard,
        SUM(CASE WHEN statut = 'a_faire' THEN 1 ELSE 0 END) AS tachesAFaire,
        SUM(CASE WHEN statut = 'en_cours' THEN 1 ELSE 0 END) AS tachesEnCours,
        SUM(CASE WHEN statut = 'termine' AND MONTH(updatedAt) = MONTH(NOW()) THEN 1 ELSE 0 END) AS tachesTermineesMois
      FROM taches WHERE 1=1 ${userFilter}
    `);

    // ── Pipeline commercial ───────────────────────────────────────────────────
    let tauxConversion = 0, totalPipeline = 0;
    if (isExpertOrChef) {
      const [[conv]] = await pool.query(`
        SELECT
          ROUND(SUM(CASE WHEN statut='gagne' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)*100, 1) AS taux,
          COALESCE(SUM(CASE WHEN statut NOT IN ('perdu','archive') THEN montantEstime ELSE 0 END),0) AS pipeline
        FROM opportunites
      `);
      tauxConversion = conv.taux || 0;
      totalPipeline = conv.pipeline || 0;
    }

    // ── Prochaines échéances fiscales ─────────────────────────────────────────
    const [echeancesProches] = await pool.query(
      `SELECT e.*, c.nom AS client_nom FROM echeances_fiscales e
       LEFT JOIN clients c ON e.client_id = c.id
       WHERE e.statut = 'a_faire' AND e.dateEcheance BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       ORDER BY e.dateEcheance LIMIT 5`
    );

    // ── Tâches proches ────────────────────────────────────────────────────────
    const [tachesProches] = await pool.query(
      `SELECT t.*, c.nom AS client_nom, CONCAT(u.prenom,' ',u.nom) AS utilisateur_nom
       FROM taches t
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
       WHERE t.statut != 'termine' AND t.dateEcheance BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       ${userFilter}
       ORDER BY t.priorite DESC, t.dateEcheance LIMIT 10`
    );

    // ── Clients récents ───────────────────────────────────────────────────────
    const [recentClients] = await pool.query(
      "SELECT id, nom, type, regime, cree_le FROM clients WHERE actif = 1 ORDER BY cree_le DESC LIMIT 5"
    );

    res.json({
      clientsActifs, prospects, caFacture, caPrevisionnel,
      devisEnAttente, impayesMontant, impayesCount,
      missionsEnCours, tauxConversion, totalPipeline,
      tachesEnRetard: tachesStats.tachesEnRetard || 0,
      tachesAFaire: tachesStats.tachesAFaire || 0,
      tachesEnCours: tachesStats.tachesEnCours || 0,
      tachesTermineesMois: tachesStats.tachesTermineesMois || 0,
      echeancesProches, tachesProches, recentClients,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur', e: err.message });
  }
});

module.exports = router;
