const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.get('/kpis', verifyToken, async (req, res) => {
  try {
    const isExpertOrChef = ['expert', 'chef_mission'].includes(req.user.role);

    let totalClients, clientsParType, tachesStats, collaborateurs, clientsParRegime;

    if (isExpertOrChef) {
      [[{ total: totalClients }]] = await pool.query(
        'SELECT COUNT(*) AS total FROM clients WHERE actif = 1'
      );
      [clientsParType] = await pool.query(
        'SELECT type, COUNT(*) AS nb FROM clients WHERE actif = 1 GROUP BY type'
      );
      [clientsParRegime] = await pool.query(
        'SELECT regime, COUNT(*) AS nb FROM clients WHERE actif = 1 GROUP BY regime'
      );
      [tachesStats] = await pool.query(
        `SELECT statut, COUNT(*) AS nb FROM taches GROUP BY statut`
      );
      [[{ total: collaborateurs }]] = await pool.query(
        "SELECT COUNT(*) AS total FROM utilisateurs WHERE actif = 1"
      );
    } else {
      [[{ total: totalClients }]] = await pool.query(
        'SELECT COUNT(DISTINCT a.client_id) AS total FROM attributions a JOIN clients c ON a.client_id = c.id WHERE a.utilisateur_id = ? AND c.actif = 1',
        [req.user.id]
      );
      [clientsParType] = await pool.query(
        'SELECT c.type, COUNT(*) AS nb FROM clients c JOIN attributions a ON c.id = a.client_id WHERE a.utilisateur_id = ? AND c.actif = 1 GROUP BY c.type',
        [req.user.id]
      );
      [clientsParRegime] = await pool.query(
        'SELECT c.regime, COUNT(*) AS nb FROM clients c JOIN attributions a ON c.id = a.client_id WHERE a.utilisateur_id = ? AND c.actif = 1 GROUP BY c.regime',
        [req.user.id]
      );
      [tachesStats] = await pool.query(
        `SELECT statut, COUNT(*) AS nb FROM taches WHERE utilisateur_id = ? GROUP BY statut`,
        [req.user.id]
      );
      collaborateurs = null;
    }

    // Recent clients
    const [recentClients] = await pool.query(
      'SELECT id, nom, type, regime, cree_le FROM clients WHERE actif = 1 ORDER BY cree_le DESC LIMIT 5'
    );

    // Tasks due soon (next 7 days)
    const [tachesProches] = isExpertOrChef
      ? await pool.query(
          `SELECT t.*, c.nom AS client_nom, u.prenom, u.nom AS user_nom
           FROM taches t
           LEFT JOIN clients c ON t.client_id = c.id
           LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
           WHERE t.date_echeance BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
             AND t.statut != 'termine'
           ORDER BY t.date_echeance LIMIT 10`
        )
      : await pool.query(
          `SELECT t.*, c.nom AS client_nom
           FROM taches t
           LEFT JOIN clients c ON t.client_id = c.id
           WHERE t.utilisateur_id = ? AND t.date_echeance BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
             AND t.statut != 'termine'
           ORDER BY t.date_echeance LIMIT 10`,
          [req.user.id]
        );

    res.json({
      totalClients,
      collaborateurs,
      clientsParType,
      clientsParRegime,
      tachesStats,
      recentClients,
      tachesProches,
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
