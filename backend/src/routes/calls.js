const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// POST /api/calls/webhook — receive Vapi call events
router.post('/webhook', async (req, res) => {
  const {
    call_id, phone_number, duration_seconds,
    transcript, recording_url, started_at, ended_at,
    message
  } = req.body;

  // Vapi sends different event types — only process call.ended
  const eventType = message?.type || req.body.type;
  if (eventType && eventType !== 'end-of-call-report') {
    return res.json({ ok: true, skipped: true });
  }

  const callId = call_id || message?.call?.id;
  const phone  = phone_number || message?.call?.customer?.number;
  const dur    = duration_seconds || message?.durationSeconds || 0;
  const trans  = transcript || message?.transcript || '';
  const recUrl = recording_url || message?.recordingUrl;
  const start  = started_at  || message?.startedAt;
  const end    = ended_at    || message?.endedAt;

  try {
    // 1. Find client by phone number
    let clientId = null;
    let prospectId = null;
    if (phone) {
      const [[client]] = await pool.query(
        `SELECT id FROM clients WHERE telephone_dirigeant LIKE ? LIMIT 1`,
        [`%${phone.replace(/\D/g, '').slice(-9)}%`]
      );
      if (client) clientId = client.id;

      if (!clientId) {
        const [[prospect]] = await pool.query(
          `SELECT id FROM prospects WHERE telephone LIKE ? OR contact_telephone LIKE ? LIMIT 1`,
          [`%${phone.replace(/\D/g, '').slice(-9)}%`, `%${phone.replace(/\D/g, '').slice(-9)}%`]
        );
        if (prospect) prospectId = prospect.id;
      }
    }

    // 2. Analyze transcript with Claude API if available
    let resumeIa = null;
    let urgence = 'normale';
    let demandes = [];
    let tachesFromIa = [];

    if (trans && process.env.ANTHROPIC_API_KEY) {
      try {
        const https = require('https');
        const body = JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 500,
          messages: [{ role: 'user', content: `Analyse cette transcription d'appel pour un cabinet comptable. Retourne UNIQUEMENT du JSON valide:\n{"resume":"2 lignes max","demandes":["demande 1"],"urgence":"normale","collaborateur_concerne":null,"taches":[{"description":"action","urgence":"normale","delai":"cette_semaine"}]}\n\nTranscription: ${trans.slice(0, 2000)}` }]
        });
        const txt = await new Promise((resolve) => {
          const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
            let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d));
          });
          req.on('error', () => resolve(''));
          req.setTimeout(15000, () => { req.destroy(); resolve(''); });
          req.write(body); req.end();
        });
        const parsed = JSON.parse(JSON.parse(txt).content?.[0]?.text || '{}');
        resumeIa = parsed.resume;
        urgence = parsed.urgence || 'normale';
        demandes = parsed.demandes || [];
        tachesFromIa = parsed.taches || [];
      } catch (aiErr) {
        resumeIa = `Appel de ${dur}s depuis ${phone || 'inconnu'}`;
      }
    } else if (trans) {
      resumeIa = `Appel entrant — ${Math.round(dur / 60)}min — ${phone || 'inconnu'}`;
    }

    // 3. Insert call record
    const [result] = await pool.query(
      `INSERT INTO appels (call_id, phone_number, client_id, prospect_id, direction, duration_seconds,
        transcript, recording_url, resume_ia, urgence, demandes, started_at, ended_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE transcript=VALUES(transcript), resume_ia=VALUES(resume_ia)`,
      [callId, phone, clientId, prospectId, 'entrant', dur,
       trans, recUrl, resumeIa, urgence,
       JSON.stringify(demandes), start || null, end || null]
    );
    const appelId = result.insertId;

    // 4. Create interaction record
    if (clientId) {
      const [[uid]] = await pool.query(`SELECT id FROM utilisateurs WHERE role='expert' AND actif=1 LIMIT 1`).catch(() => [[{ id: 1 }]]);
      await pool.query(
        `INSERT INTO interactions_log (client_id, utilisateur_id, type, direction, objet, contenu, resume_ia, duree_minutes, urgence)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [clientId, uid?.id || 1, 'appel', 'entrant', `Appel entrant — ${phone}`,
         trans, resumeIa, Math.round(dur / 60), urgence]
      ).catch(() => {});
    }

    // 5. Create tasks from AI analysis
    let tachesCreees = 0;
    if (tachesFromIa.length > 0 && (clientId || prospectId)) {
      const [[expert]] = await pool.query(
        `SELECT id FROM utilisateurs WHERE role='expert' AND actif=1 LIMIT 1`
      ).catch(() => [[null]]);

      for (const t of tachesFromIa.slice(0, 5)) {
        const echeance = t.delai === 'aujourd_hui' ? new Date()
          : t.delai === 'demain' ? new Date(Date.now() + 86400000)
          : new Date(Date.now() + 7 * 86400000);
        const echeanceStr = echeance.toISOString().slice(0, 10);

        await pool.query(
          `INSERT INTO taches (client_id, utilisateur_id, description, date_echeance, priorite, source, origine)
           VALUES (?,?,?,?,?,?,?)`,
          [clientId, expert?.id || 1, t.description, echeanceStr,
           t.urgence === 'elevee' ? 'haute' : 'normale', 'manuelle', 'email']
        ).catch(() => {});
        tachesCreees++;
      }

      // Update taches_creees count
      if (appelId) {
        await pool.query('UPDATE appels SET taches_creees=? WHERE id=?', [tachesCreees, appelId]).catch(() => {});
      }
    }

    // 6. Send notification to expert
    if (clientId || prospectId) {
      const [[exp]] = await pool.query(
        `SELECT id FROM utilisateurs WHERE role='expert' AND actif=1 LIMIT 1`
      ).catch(() => [[{ id: 1 }]]);
      if (exp) {
        await pool.query(
          `INSERT INTO notifications (utilisateur_id, type, titre, message, lien)
           VALUES (?,?,?,?,?)`,
          [exp.id, 'appel',
           `Appel entrant — ${phone}`,
           resumeIa || `Appel de ${Math.round(dur / 60)}min`,
           `/clients/${clientId || ''}`]
        ).catch(() => {});
      }
    }

    res.json({ ok: true, appelId, tachesCreees, urgence });
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
         p.nom AS prospect_nom
       FROM appels a
       LEFT JOIN clients c ON a.client_id = c.id
       LEFT JOIN prospects p ON a.prospect_id = p.id
       ORDER BY a.cree_le DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
