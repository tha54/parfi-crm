const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const https = require('https');

// ── Appel Claude API pour résumé IA ──────────────────────────────────────────
async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          resolve(r.content?.[0]?.text || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(30000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// GET / — liste des interactions (tous clients ou filtré)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id, type, statut, limit = 50 } = req.query;
    let where = '1=1';
    const params = [];
    if (client_id) { where += ' AND i.client_id = ?'; params.push(client_id); }
    if (type) { where += ' AND i.type = ?'; params.push(type); }
    if (statut) { where += ' AND i.statut = ?'; params.push(statut); }
    const [rows] = await pool.query(
      `SELECT i.*, c.nom AS client_nom, CONCAT(u.prenom,' ',u.nom) AS utilisateur_nom
       FROM interactions_log i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN utilisateurs u ON i.utilisateur_id = u.id
       WHERE ${where}
       ORDER BY i.date_interaction DESC
       LIMIT ?`,
      [...params, Number(limit)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /:id — détail
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      `SELECT i.*, c.nom AS client_nom, CONCAT(u.prenom,' ',u.nom) AS utilisateur_nom
       FROM interactions_log i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN utilisateurs u ON i.utilisateur_id = u.id
       WHERE i.id = ?`, [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'Interaction introuvable' });
    res.json(row);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST / — créer une interaction
router.post('/', verifyToken, async (req, res) => {
  const { client_id, type, direction, date_interaction, duree_minutes, objet, contenu, urgence } = req.body;
  if (!type) return res.status(400).json({ message: 'Type requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO interactions_log (client_id, utilisateur_id, type, direction, date_interaction, duree_minutes, objet, contenu, urgence)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [client_id || null, req.user.id, type, direction || 'interne',
       date_interaction || new Date(), duree_minutes || null, objet || null, contenu || null, urgence || 'normale']
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// PUT /:id — mettre à jour
router.put('/:id', verifyToken, async (req, res) => {
  const allowed = ['type','direction','date_interaction','duree_minutes','objet','contenu','urgence','statut','resume_ia','transcription'];
  const fields = [], values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { fields.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE interactions_log SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// DELETE /:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM interactions_log WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supprimée' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST /ai/summarize — résumé IA d'une transcription/interaction
router.post('/ai/summarize', verifyToken, async (req, res) => {
  const { transcription, interactionId, contexte } = req.body;
  if (!transcription) return res.status(400).json({ message: 'Transcription requise' });

  const prompt = `Tu es l'assistant d'un cabinet d'expertise comptable (ParFi France).
Voici la transcription d'une interaction avec un client${contexte ? ` (${contexte})` : ''} :

---
${transcription}
---

Génère un résumé professionnel en français avec :
1. **Résumé** (2-3 phrases)
2. **Décisions prises** (liste à puces)
3. **Actions à réaliser** (liste avec responsable suggéré et délai si mentionné)
4. **Points d'attention** (risques ou sujets sensibles)

Format JSON strict :
{
  "resume": "...",
  "decisions": ["..."],
  "actions": [{"description":"...","responsable":"...","delai":"..."}],
  "pointsAttention": ["..."]
}`;

  try {
    const result = await callClaude(prompt);
    let parsed = null;
    if (result) {
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch { parsed = { resume: result }; }
    }

    // Sauvegarder le résumé si interactionId fourni
    if (interactionId && parsed) {
      await pool.query('UPDATE interactions_log SET resume_ia = ?, transcription = ? WHERE id = ?',
        [JSON.stringify(parsed), transcription, interactionId]);
    }

    res.json({ success: !!result, resume: parsed, raw: result });
  } catch (e) { res.status(500).json({ message: 'Erreur IA', e: e.message }); }
});

// POST /ai/extract-tasks — extraire des tâches depuis un texte (email/réunion)
router.post('/ai/extract-tasks', verifyToken, async (req, res) => {
  const { texte, type = 'email' } = req.body;
  if (!texte) return res.status(400).json({ message: 'Texte requis' });

  const [collaborateurs] = await pool.query('SELECT id, prenom, nom FROM utilisateurs WHERE actif = 1');
  const [clientsRows] = await pool.query('SELECT id, nom FROM clients WHERE actif = 1 LIMIT 100');

  const collabList = collaborateurs.map(c => `${c.prenom} ${c.nom}`).join(', ');

  const prompt = `Tu es l'assistant d'un cabinet d'expertise comptable (ParFi France).
Voici un ${type === 'email' ? 'email reçu' : 'texte'} :

---
${texte}
---

Extrait toutes les tâches à réaliser mentionnées.
Collaborateurs disponibles : ${collabList}.

Réponds en JSON strict :
{
  "taches": [
    {
      "description": "description claire de la tâche",
      "collaborateur": "prénom nom du collaborateur (ou null si non précisé)",
      "client": "nom du client (ou null si non précisé)",
      "date_echeance": "YYYY-MM-DD (ou null si non précisé)",
      "duree": 1.0,
      "priorite": "normale"
    }
  ]
}`;

  try {
    const result = await callClaude(prompt);
    let taches = [];
    if (result) {
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          taches = parsed.taches || [];
          // Mapper les collaborateurs aux IDs
          taches = taches.map(t => {
            const collab = collaborateurs.find(c =>
              t.collaborateur && `${c.prenom} ${c.nom}`.toLowerCase().includes(t.collaborateur.toLowerCase())
            );
            const client = clientsRows.find(c => t.client && c.nom.toLowerCase().includes(t.client.toLowerCase()));
            return { ...t, utilisateur_id: collab?.id || null, client_id: client?.id || null };
          });
        }
      } catch { taches = []; }
    }
    res.json({ success: !!result, taches });
  } catch (e) { res.status(500).json({ message: 'Erreur IA', e: e.message }); }
});

module.exports = router;
