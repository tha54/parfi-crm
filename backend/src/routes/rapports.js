const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const https = require('https');

async function callClaude(prompt, maxTokens = 300) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const body = JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] });
  return new Promise((resolve) => {
    const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        try { resolve(JSON.parse(d).content?.[0]?.text || null); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

// Generate weekly report data
async function generateWeeklyData() {
  const today = new Date();
  const weekAgo = new Date(today - 7 * 86400000);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [[tachesStats]] = await pool.query(
    `SELECT
       SUM(CASE WHEN statut='termine' AND cree_le >= ? THEN 1 ELSE 0 END) AS terminees,
       SUM(CASE WHEN statut != 'termine' AND date_echeance < ? THEN 1 ELSE 0 END) AS en_retard,
       SUM(CASE WHEN statut = 'reporte' THEN 1 ELSE 0 END) AS reportees
     FROM taches WHERE cree_le >= ?`,
    [weekAgoStr, todayStr, weekAgoStr]
  );

  const [[caStats]] = await pool.query(
    `SELECT COALESCE(SUM(totalTTC),0) AS facture_total FROM factures WHERE statut='envoyee' AND DATE(cree_le) >= ?`, [weekAgoStr]
  ).catch(() => [[{ facture_total: 0 }]]);

  const [nouveauxClients] = await pool.query(
    `SELECT COUNT(*) AS nb FROM clients WHERE DATE(cree_le) >= ?`, [weekAgoStr]
  ).catch(() => [[{ nb: 0 }]]);

  const [nouveauxProspects] = await pool.query(
    `SELECT COUNT(*) AS nb FROM prospects WHERE DATE(cree_le) >= ?`, [weekAgoStr]
  ).catch(() => [[{ nb: 0 }]]);

  const [ldmSignees] = await pool.query(
    `SELECT COUNT(*) AS nb FROM lettres_mission WHERE statut='signee' AND DATE(date_signature) >= ?`, [weekAgoStr]
  ).catch(() => [[{ nb: 0 }]]);

  return {
    periode: `Semaine du ${weekAgo.toLocaleDateString('fr-FR')} au ${today.toLocaleDateString('fr-FR')}`,
    taches: {
      terminees: tachesStats.terminees || 0,
      en_retard: tachesStats.en_retard || 0,
      reportees: tachesStats.reportees || 0,
    },
    commercial: {
      nouveaux_clients: nouveauxClients[0]?.nb || 0,
      nouveaux_prospects: nouveauxProspects[0]?.nb || 0,
      ldm_signees: ldmSignees[0]?.nb || 0,
      ca_facture: caStats.facture_total || 0,
    }
  };
}

// GET /api/rapports/weekly
router.get('/weekly', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const data = await generateWeeklyData();

    let analyse = null;
    if (process.env.ANTHROPIC_API_KEY) {
      const prompt = `Tu es expert-comptable et génères un rapport hebdomadaire pour ton cabinet.
Données de la semaine:
- Tâches terminées: ${data.taches.terminees}, en retard: ${data.taches.en_retard}
- Nouveaux clients: ${data.commercial.nouveaux_clients}, prospects: ${data.commercial.nouveaux_prospects}
- LDM signées: ${data.commercial.ldm_signees}
Écris un résumé professionnel en 3-4 phrases (français, ton neutre et factuel).`;
      analyse = await callClaude(prompt);
    }

    res.json({ ...data, analyse });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/rapports/monthly
router.get('/monthly', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayStr = firstDay.toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    // CA mensuel
    const [[caMonth]] = await pool.query(
      `SELECT COALESCE(SUM(totalTTC),0) AS total FROM factures WHERE statut IN ('envoyee','payee') AND DATE(cree_le) >= ?`,
      [firstDayStr]
    ).catch(() => [[{ total: 0 }]]);

    // Taux réalisation par collaborateur
    const [collabStats] = await pool.query(
      `SELECT u.prenom, u.nom, u.role,
         SUM(CASE WHEN t.type_travail IN ('recurrent','exceptionnel_facturable') THEN COALESCE(t.temps_passe_minutes,0) ELSE 0 END) AS minutes_facturables,
         SUM(COALESCE(t.temps_passe_minutes,0)) AS minutes_total
       FROM utilisateurs u
       LEFT JOIN taches t ON t.utilisateur_id=u.id AND DATE(t.cree_le) >= ?
       WHERE u.actif=1
       GROUP BY u.id`, [firstDayStr]
    ).catch(() => [[]]);

    // Top 5 clients CA
    const [topClients] = await pool.query(
      `SELECT c.nom, COALESCE(SUM(f.totalTTC),0) AS ca
       FROM clients c
       LEFT JOIN factures f ON f.client_id=c.id AND statut IN ('envoyee','payee') AND DATE(f.cree_le) >= ?
       WHERE c.actif=1
       GROUP BY c.id ORDER BY ca DESC LIMIT 5`, [firstDayStr]
    ).catch(() => [[]]);

    // Portfolio movement
    const [entrees] = await pool.query(
      `SELECT COUNT(*) AS nb FROM clients WHERE DATE(cree_le) >= ?`, [firstDayStr]
    ).catch(() => [[{ nb: 0 }]]);

    res.json({
      periode: `${firstDay.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
      ca_mensuel: caMonth.total,
      collaborateurs: collabStats.map(c => ({
        nom: `${c.prenom} ${c.nom}`,
        role: c.role,
        taux_realisation: c.minutes_total > 0 ? Math.round((c.minutes_facturables / c.minutes_total) * 100) : 0,
      })),
      top_clients: topClients,
      entrees_portfolio: entrees[0]?.nb || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/rapports/portfolio — portfolio movement and churn
router.get('/portfolio', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayStr = firstDay.toISOString().slice(0, 10);

    const [[entrees]] = await pool.query(
      `SELECT COUNT(*) AS nb, COALESCE(SUM(ca_mensuel_signe),0) AS ca FROM clients WHERE DATE(cree_le) >= ?`, [firstDayStr]
    ).catch(() => [[{ nb: 0, ca: 0 }]]);

    const [[sorties]] = await pool.query(
      `SELECT COUNT(*) AS nb, COALESCE(SUM(ca_mensuel_perdu),0) AS ca FROM clients WHERE actif=0 AND DATE(cree_le) >= ?`, [firstDayStr]
    ).catch(() => [[{ nb: 0, ca: 0 }]]);

    // Source breakdown
    const [sources] = await pool.query(
      `SELECT source_acquisition, COUNT(*) AS nb FROM clients WHERE source_acquisition IS NOT NULL GROUP BY source_acquisition`
    ).catch(() => [[]]);

    // Motifs churn
    const [motifs] = await pool.query(
      `SELECT motif_fin, COUNT(*) AS nb FROM clients WHERE motif_fin IS NOT NULL GROUP BY motif_fin ORDER BY nb DESC`
    ).catch(() => [[]]);

    // Clients sans interaction depuis 60 jours (signal faible)
    const [signalFaible] = await pool.query(
      `SELECT c.id, c.nom, MAX(i.cree_le) AS derniere_interaction
       FROM clients c
       LEFT JOIN interactions i ON i.client_id=c.id
       WHERE c.actif=1
       GROUP BY c.id
       HAVING derniere_interaction IS NULL OR DATEDIFF(NOW(), derniere_interaction) > 60
       ORDER BY derniere_interaction ASC
       LIMIT 10`
    ).catch(() => [[]]);

    res.json({
      entrees: { nb: entrees.nb, ca: entrees.ca },
      sorties: { nb: sorties.nb, ca: sorties.ca },
      solde: entrees.nb - sorties.nb,
      sources,
      motifs_churn: motifs,
      signal_faible: signalFaible,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
