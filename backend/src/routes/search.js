const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// GET /api/search?q=... — universal search
router.get('/', verifyToken, async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json({ results: [] });

  const term = `%${q.trim()}%`;
  const isExpertOrChef = ['expert', 'chef_mission'].includes(req.user.role);
  const results = [];

  try {
    // Clients
    const clientWhere = isExpertOrChef ? '' : `AND EXISTS (SELECT 1 FROM attributions a WHERE a.client_id=c.id AND a.utilisateur_id=${req.user.id})`;
    const [clients] = await pool.query(
      `SELECT id, nom, siren, ville, type FROM clients c
       WHERE actif=1 AND (nom LIKE ? OR siren LIKE ? OR ville LIKE ? OR raison_sociale LIKE ?)
       ${clientWhere} LIMIT 8`,
      [term, term, term, term]
    );
    clients.forEach(c => results.push({
      type: 'client', icon: '👥', label: c.nom,
      sub: [c.siren, c.ville, c.type].filter(Boolean).join(' · '),
      link: `/clients/${c.id}`
    }));

    // Prospects
    if (isExpertOrChef) {
      const [prospects] = await pool.query(
        `SELECT id, nom, ville, statut FROM prospects
         WHERE nom LIKE ? OR siren LIKE ? OR ville LIKE ? LIMIT 5`,
        [term, term, term]
      );
      prospects.forEach(p => results.push({
        type: 'prospect', icon: '📡', label: p.nom,
        sub: [p.ville, p.statut].filter(Boolean).join(' · '),
        link: `/pipeline`
      }));
    }

    // Tâches
    const tacheWhere = isExpertOrChef ? '' : `AND t.utilisateur_id=${req.user.id}`;
    const [taches] = await pool.query(
      `SELECT t.id, t.description, t.statut, c.nom AS client_nom
       FROM taches t LEFT JOIN clients c ON t.client_id=c.id
       WHERE t.description LIKE ? ${tacheWhere} LIMIT 6`,
      [term]
    );
    taches.forEach(t => results.push({
      type: 'tache', icon: '✅', label: t.description,
      sub: [t.client_nom, t.statut].filter(Boolean).join(' · '),
      link: `/taches`
    }));

    // Devis
    if (isExpertOrChef) {
      const [devis] = await pool.query(
        `SELECT d.id, d.numero, d.statut, c.nom AS client_nom
         FROM devis d LEFT JOIN clients c ON d.client_id=c.id
         WHERE d.numero LIKE ? OR c.nom LIKE ? LIMIT 5`,
        [term, term]
      );
      devis.forEach(d => results.push({
        type: 'devis', icon: '📄', label: d.numero || `Devis #${d.id}`,
        sub: [d.client_nom, d.statut].filter(Boolean).join(' · '),
        link: `/devis`
      }));
    }

    // Interactions
    const interWhere = isExpertOrChef ? '' : `AND i.client_id IN (SELECT client_id FROM attributions WHERE utilisateur_id=${req.user.id})`;
    const [interactions] = await pool.query(
      `SELECT i.id, i.objet, i.type, i.client_id, c.nom AS client_nom
       FROM interactions_log i LEFT JOIN clients c ON i.client_id=c.id
       WHERE (i.objet LIKE ? OR i.contenu LIKE ?) ${interWhere} LIMIT 5`,
      [term, term]
    );
    interactions.forEach(i => results.push({
      type: 'interaction', icon: '💬', label: i.objet || i.type,
      sub: i.client_nom || '',
      link: `/clients/${i.client_id}`
    }));

    res.json({ results, total: results.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
