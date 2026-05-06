const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const https = require('https');

// POST /api/calls/webhook — receive Vapi end-of-call-report (PUBLIC, secured by x-vapi-secret)
router.post('/webhook', async (req, res) => {
  console.log('[Vapi webhook] Received POST /api/calls/webhook');
  console.log('[Vapi webhook] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[Vapi webhook] Body:', JSON.stringify(req.body, null, 2));

  // Security check
  const secret = req.headers['x-vapi-secret'];
  console.log('[Vapi webhook] x-vapi-secret received:', secret ? `"${secret}"` : '(absent)');
  console.log('[Vapi webhook] VAPI_SECRET in env:', process.env.VAPI_SECRET ? `"${process.env.VAPI_SECRET}"` : '(absent)');

  if (!secret || secret !== process.env.VAPI_SECRET) {
    console.log('[Vapi webhook] 401 — secret mismatch');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Support both Vapi payload formats:
  // - Old format: { message: { type, call, transcript } }
  // - New format: { type, call, transcript } (direct, no wrapper)
  const payload = req.body.message || req.body;
  console.log('[Vapi webhook] Resolved payload type:', payload?.type);

  // Only process end-of-call-report events
  if (!payload || payload.type !== 'end-of-call-report') {
    console.log('[Vapi webhook] Skipping event type:', payload?.type);
    return res.json({ ok: true, skipped: true });
  }

  const callId       = payload.call?.id || null;
  const duration     = payload.call?.duration || 0;
  const transcript   = payload.transcript || '';
  const recordingUrl = payload.call?.recordingUrl || payload.artifact?.recordingUrl || null;
  console.log('[Vapi webhook] Processing call:', callId, '| duration:', duration, '| transcript length:', transcript.length, '| recordingUrl:', recordingUrl);

  try {
    // Step 1 — Analyze transcript with Claude API
    let resume = null;
    let urgence = 'moyen';
    let nomClient = null;
    let nomInterlocuteur = null;
    let nomCollaborateur = null;

    if (transcript && process.env.ANTHROPIC_API_KEY) {
      try {
        const body = JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: `Tu analyses la transcription d'un appel client d'un cabinet d'expertise comptable.
L'assistant vocal a demandé au cours de l'appel :
1. Le nom de l'interlocuteur (la personne qui appelle)
2. Le nom du collaborateur demandé (le membre du cabinet que le client souhaite joindre)

Reponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks.
Format exact :
{
  "resume": "2-3 phrases decrivant ce que veut le client",
  "urgence": "faible" | "moyen" | "eleve",
  "nom_client": "nom de l'entreprise ou du client mentionné, ou null",
  "nom_interlocuteur": "prénom et/ou nom de la personne qui appelle, tel qu'il l'a donné, ou null",
  "nom_collaborateur": "prénom et/ou nom du collaborateur demandé, tel qu'il a été mentionné, ou null"
}`,
          messages: [{ role: 'user', content: transcript }],
        });

        const txt = await new Promise((resolve) => {
          const req2 = https.request(
            {
              hostname: 'api.anthropic.com',
              path: '/v1/messages',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(body),
              },
            },
            (r) => {
              let d = '';
              r.on('data', (c) => (d += c));
              r.on('end', () => resolve(d));
            }
          );
          req2.on('error', () => resolve(''));
          req2.setTimeout(15000, () => { req2.destroy(); resolve(''); });
          req2.write(body);
          req2.end();
        });

        const parsed = JSON.parse(JSON.parse(txt).content?.[0]?.text || '{}');
        resume           = parsed.resume           || null;
        urgence          = parsed.urgence          || 'moyen';
        nomClient        = parsed.nom_client       || null;
        nomInterlocuteur = parsed.nom_interlocuteur || null;
        nomCollaborateur = parsed.nom_collaborateur || null;

        console.log('[Vapi webhook] Claude analysis:', { resume, urgence, nomClient, nomInterlocuteur, nomCollaborateur });
      } catch {
        resume = `Appel de ${Math.round(duration / 60)} min`;
      }
    } else {
      resume = `Appel de ${Math.round(duration / 60)} min`;
    }

    // Step 2 — Find collaborateur by name (asked during the call)
    let collaborateurId = null;
    if (nomCollaborateur) {
      const [[collab]] = await pool.query(
        `SELECT id FROM utilisateurs
         WHERE actif = 1
           AND (CONCAT(prenom, ' ', nom) LIKE CONCAT('%', ?, '%')
             OR CONCAT(nom, ' ', prenom) LIKE CONCAT('%', ?, '%')
             OR nom LIKE CONCAT('%', ?, '%')
             OR prenom LIKE CONCAT('%', ?, '%'))
         LIMIT 1`,
        [nomCollaborateur, nomCollaborateur, nomCollaborateur, nomCollaborateur]
      );
      if (collab) {
        collaborateurId = collab.id;
        console.log('[Vapi webhook] Collaborateur trouvé par nom:', nomCollaborateur, '=> id:', collaborateurId);
      } else {
        console.log('[Vapi webhook] Collaborateur non trouvé pour:', nomCollaborateur);
      }
    }

    // Step 3 — Find client by nom_client
    let clientId = null;
    if (nomClient) {
      const [[client]] = await pool.query(
        `SELECT id, collaborateur_id FROM clients WHERE nom LIKE CONCAT('%', ?, '%') LIMIT 1`,
        [nomClient]
      );
      if (client) {
        clientId = client.id;
        // Use client's collaborateur only if the call didn't specify one
        if (!collaborateurId) {
          collaborateurId = client.collaborateur_id;
          console.log('[Vapi webhook] Collaborateur récupéré depuis le client:', collaborateurId);
        }
      }
    }

    // Fallback: assign to first active expert if no collaborateur found
    if (!collaborateurId) {
      const [[exp]] = await pool.query(
        `SELECT id FROM utilisateurs WHERE actif = 1 LIMIT 1`
      ).catch(() => [[null]]);
      collaborateurId = exp?.id || 1;
      console.log('[Vapi webhook] Fallback collaborateur:', collaborateurId);
    }

    // Step 4 — Map urgence → priorite taches + urgence appels enum
    const prioriteMap = { faible: 'basse', moyen: 'normale', eleve: 'haute' };
    const urgenceMap  = { faible: 'normale', moyen: 'elevee', eleve: 'critique' };
    const priorite    = prioriteMap[urgence] || 'normale';
    const urgenceDb   = urgenceMap[urgence]  || 'elevee';

    // Step 5 — INSERT into appels
    const resumeTrunc = (resume || '').slice(0, 200);
    const [appelResult] = await pool.query(
      `INSERT INTO appels (call_id, nom_interlocuteur, nom_collaborateur, client_id, direction, duration_seconds, transcript, recording_url, resume_ia, urgence)
       VALUES (?, ?, ?, ?, 'entrant', ?, ?, ?, ?, ?)`,
      [callId, nomInterlocuteur, nomCollaborateur, clientId, duration, transcript, recordingUrl, resumeTrunc, urgenceDb]
    );
    const appelId = appelResult.insertId;

    // Step 6 — INSERT into taches
    const interlocuteurLabel = nomInterlocuteur ? ` — ${nomInterlocuteur}` : '';
    const titre       = `Appel${interlocuteurLabel} : ${(resume || '').slice(0, 60)}`;
    const description = [
      resume || '',
      nomInterlocuteur ? `\nInterlocuteur : ${nomInterlocuteur}` : '',
      nomCollaborateur ? `Collaborateur demandé : ${nomCollaborateur}` : '',
    ].filter(Boolean).join('\n').slice(0, 250);
    const echeance    = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const [tacheResult] = await pool.query(
      `INSERT INTO taches (titre, description, client_id, utilisateur_id, priorite, source, appel_id, statut, date_echeance)
       VALUES (?, ?, ?, ?, ?, 'appel', ?, 'a_faire', ?)`,
      [titre, description, clientId, collaborateurId, priorite, appelId, echeance]
    );
    const taskId = tacheResult.insertId;

    // Step 7 — UPDATE appels with task_id
    await pool.query('UPDATE appels SET task_id = ? WHERE id = ?', [taskId, appelId]);

    console.log('[Vapi webhook] Done. appel_id:', appelId, '| task_id:', taskId, '| collaborateur_id:', collaborateurId);
    res.json({ success: true, task_id: taskId, appel_id: appelId });
  } catch (err) {
    console.error('Vapi webhook error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/calls/history — list all calls
router.get('/history', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*,
         c.nom AS client_nom,
         p.nom AS prospect_nom,
         CONCAT(u.prenom, ' ', u.nom) AS collaborateur_nom
       FROM appels a
       LEFT JOIN clients c ON a.client_id = c.id
       LEFT JOIN prospects p ON a.prospect_id = p.id
       LEFT JOIN taches t ON a.task_id = t.id
       LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
       ORDER BY a.cree_le DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
