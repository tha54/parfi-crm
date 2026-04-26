const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const https = require('https');

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Promise((resolve) => {
    const body = JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 256, messages: [{ role: 'user', content: prompt }] });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).content?.[0]?.text || null); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

// GET / — briefing du jour pour l'utilisateur connecté
router.get('/', verifyToken, async (req, res) => {
  try {
    const uid = req.user.id;
    const today = new Date().toISOString().substring(0, 10);
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10);
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().substring(0, 10);

    // TODAY — tâches du jour + retard
    const [tachesAujourdhui] = await pool.query(
      `SELECT t.id, COALESCE(t.titre, t.description) AS titre, t.statut, t.priorite,
              t.date_echeance, t.duree, c.nom AS client_nom
       FROM taches t LEFT JOIN clients c ON t.client_id=c.id
       WHERE t.utilisateur_id=? AND t.statut != 'termine'
         AND (t.date_echeance = ? OR t.date_echeance < ?)
       ORDER BY t.date_echeance, FIELD(t.priorite,'urgente','haute','normale','basse')`,
      [uid, today, today]
    );

    // WEEK — tâches de la semaine
    const [[semaineStats]] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN statut IN ('a_faire','en_cours') AND date_echeance < ? THEN 1 ELSE 0 END) AS en_retard,
        SUM(COALESCE(duree,0)) AS heures_planifiees
       FROM taches WHERE utilisateur_id=? AND statut != 'termine'
         AND date_echeance BETWEEN ? AND ?`,
      [today, uid, today, weekEnd]
    );

    // MONTH — stats du mois
    const [[moisStats]] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN statut='termine' THEN 1 ELSE 0 END) AS terminees,
        ROUND(SUM(CASE WHEN statut='termine' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) * 100, 0) AS taux_completion
       FROM taches WHERE utilisateur_id=? AND date_echeance BETWEEN ? AND ?`,
      [uid, new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0,10), monthEnd]
    );

    // Prochaines échéances fiscales
    const [echeances] = await pool.query(
      `SELECT e.label, e.date_echeance, e.type, c.nom AS client_nom
       FROM echeances_fiscales e
       LEFT JOIN clients c ON e.client_id=c.id
       WHERE e.statut='a_faire' AND e.date_echeance BETWEEN ? AND ?
       ORDER BY e.date_echeance LIMIT 5`,
      [today, weekEnd]
    );

    // Missions actives assignées
    const [[{ missions_actives }]] = await pool.query(
      `SELECT COUNT(*) AS missions_actives FROM missions m
       LEFT JOIN attributions a ON a.client_id=m.client_id
       WHERE a.utilisateur_id=? AND m.statut='en_cours'`, [uid]
    );

    // Phrase IA résumant la journée
    let phraseIA = null;
    if (tachesAujourdhui.length > 0) {
      const enRetard = tachesAujourdhui.filter(t => t.date_echeance < today);
      const prompt = `Tu es l'assistant d'un collaborateur d'un cabinet d'expertise comptable.
Aujourd'hui : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}.
${enRetard.length} tâche(s) en retard, ${tachesAujourdhui.length} à traiter aujourd'hui.
Tâches prioritaires : ${tachesAujourdhui.slice(0,3).map(t => t.titre).join(', ')}.
Écris UNE phrase motivante et précise résumant la priorité du jour. Maximum 25 mots. En français.`;
      phraseIA = await callClaude(prompt).catch(() => null);
    }

    res.json({
      date: today,
      utilisateur: req.user,
      tachesAujourdhui,
      semaine: semaineStats,
      mois: { ...moisStats, total_mois: moisStats.total },
      echeances,
      missions_actives,
      phraseIA,
    });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', e: e.message });
  }
});

// PUT /taches/:id — marquer une tâche depuis le briefing
router.put('/taches/:id', verifyToken, async (req, res) => {
  const { statut } = req.body;
  try {
    await pool.query(
      'UPDATE taches SET statut=? WHERE id=? AND utilisateur_id=?',
      [statut, req.params.id, req.user.id]
    );
    res.json({ message: 'Tâche mise à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur' }); }
});

module.exports = router;
