const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');

const DOCS_BASE = '/opt/parfi-data/documents';

// ── Storage ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const clientId = req.body.client_id || 'general';
    const year = new Date().getFullYear();
    const dir = path.join(DOCS_BASE, String(clientId), String(year));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Text extraction ────────────────────────────────────────────────────────────
async function extractText(filePath, mimeType) {
  try {
    if (mimeType === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const buf = fs.readFileSync(filePath);
      const data = await pdfParse(buf);
      return data.text?.substring(0, 10000) || '';
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value?.substring(0, 10000) || '';
    }
    return '';
  } catch { return ''; }
}

// ── Claude classify ────────────────────────────────────────────────────────────
async function classifyDocument(text, filename) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !text) return null;
  const prompt = `Tu es l'assistant d'un cabinet d'expertise comptable.
Voici le contenu partiel d'un document (${filename}) :
---
${text.substring(0, 2000)}
---
Classe ce document. Réponds UNIQUEMENT en JSON :
{"type_document":"bilan|liasse|facture|ldm|courrier|contrat|releve_bancaire|bulletin_paie|autre","annee_fiscale":"2024","requires_action":false,"tags":["tag1"]}`;

  return new Promise((resolve) => {
    const body = JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 256, messages: [{ role: 'user', content: prompt }] });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          const text = r.content?.[0]?.text || '';
          const match = text.match(/\{[\s\S]*\}/);
          resolve(match ? JSON.parse(match[0]) : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET / — liste des documents
router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id, type_document, annee_fiscale, limit = 100 } = req.query;
    let where = '1=1';
    const params = [];
    // Collaborateurs: only assigned clients
    if (req.user.role === 'collaborateur') {
      where += ' AND d.client_id IN (SELECT client_id FROM attributions WHERE utilisateur_id=?)';
      params.push(req.user.id);
    }
    if (client_id) { where += ' AND d.client_id=?'; params.push(client_id); }
    if (type_document) { where += ' AND d.type_document=?'; params.push(type_document); }
    if (annee_fiscale) { where += ' AND d.annee_fiscale=?'; params.push(annee_fiscale); }

    const [rows] = await pool.query(
      `SELECT d.*, c.nom AS client_nom, CONCAT(u.prenom,' ',u.nom) AS uploade_par_nom
       FROM documents d
       LEFT JOIN clients c ON d.client_id=c.id
       LEFT JOIN utilisateurs u ON d.uploadePar=u.id
       WHERE ${where}
       ORDER BY d.createdAt DESC
       LIMIT ?`,
      [...params, Number(limit)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /search?q=... — recherche full-text simple (LIKE)
router.get('/search', verifyToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const term = `%${q}%`;
    const [rows] = await pool.query(
      `SELECT d.id, d.nom, d.type_document, d.annee_fiscale, d.createdAt,
              c.nom AS client_nom
       FROM documents d
       LEFT JOIN clients c ON d.client_id=c.id
       WHERE d.nom LIKE ? OR d.description LIKE ? OR JSON_SEARCH(d.tags, 'one', ?) IS NOT NULL
       ORDER BY d.createdAt DESC
       LIMIT 30`,
      [term, term, q]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// GET /:id/download
router.get('/:id/download', verifyToken, async (req, res) => {
  try {
    const [[doc]] = await pool.query('SELECT * FROM documents WHERE id=?', [req.params.id]);
    if (!doc) return res.status(404).json({ message: 'Document introuvable' });
    if (!fs.existsSync(doc.chemin)) return res.status(404).json({ message: 'Fichier introuvable' });
    res.download(doc.chemin, doc.nom);
  } catch (e) { res.status(500).json({ message: 'Erreur', e: e.message }); }
});

// POST /upload — upload avec extraction + auto-classif
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  try {
    const { client_id, type_document, annee_fiscale, description } = req.body;
    const filePath = req.file.path;
    const mimeType = req.file.mimetype;

    // Extract text
    const contenuTexte = await extractText(filePath, mimeType);

    // Auto-classify via Claude
    let classification = null;
    if (contenuTexte && process.env.ANTHROPIC_API_KEY) {
      classification = await classifyDocument(contenuTexte, req.file.originalname);
    }

    const finalType = type_document || classification?.type_document || 'autre';
    const finalAnnee = annee_fiscale || classification?.annee_fiscale || String(new Date().getFullYear());
    const tags = classification?.tags || [];

    const [r] = await pool.query(
      `INSERT INTO documents (client_id, nom, description, type_document, chemin, taille, mimeType,
        annee_fiscale, contenu_texte, tags, uploadePar, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [client_id || null, req.file.originalname, description || null, finalType, filePath,
       req.file.size, mimeType, finalAnnee, contenuTexte || null,
       tags.length ? JSON.stringify(tags) : null, req.user.id]
    );

    // Si requires_action, créer une tâche
    if (classification?.requires_action) {
      await pool.query(
        `INSERT INTO taches (client_id, utilisateur_id, titre, description, priorite, origine, date_echeance)
         VALUES (?,?,?,?,?,?,?)`,
        [client_id || null, req.user.id, `Traiter : ${req.file.originalname}`,
         `Document classifié automatiquement : ${finalType} ${finalAnnee}`,
         'haute', 'manuelle', new Date(Date.now() + 7*86400000)]
      ).catch(() => {});
    }

    res.status(201).json({
      id: r.insertId,
      nom: req.file.originalname,
      type_document: finalType,
      annee_fiscale: finalAnnee,
      classification,
    });
  } catch (e) { res.status(500).json({ message: 'Erreur upload', e: e.message }); }
});

// PUT /:id — mettre à jour métadonnées
router.put('/:id', verifyToken, async (req, res) => {
  const { type_document, annee_fiscale, description, tags } = req.body;
  const fields = [], values = [];
  if (type_document !== undefined) { fields.push('type_document=?'); values.push(type_document); }
  if (annee_fiscale !== undefined) { fields.push('annee_fiscale=?'); values.push(annee_fiscale); }
  if (description !== undefined) { fields.push('description=?'); values.push(description); }
  if (tags !== undefined) { fields.push('tags=?'); values.push(JSON.stringify(tags)); }
  if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE documents SET ${fields.join(',')} WHERE id=?`, values);
    res.json({ message: 'Mis à jour' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// DELETE /:id
router.delete('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[doc]] = await pool.query('SELECT chemin FROM documents WHERE id=?', [req.params.id]);
    await pool.query('DELETE FROM documents WHERE id=?', [req.params.id]);
    if (doc?.chemin && fs.existsSync(doc.chemin)) fs.unlinkSync(doc.chemin);
    res.json({ message: 'Document supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

// POST /:id/share — générer un lien de partage temporaire
router.post('/:id/share', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { duree = '24h' } = req.body;
  const dureeMap = { '24h': 86400, '7d': 604800, '30d': 2592000 };
  const expiry = Date.now() + (dureeMap[duree] || 86400) * 1000;
  const token = Buffer.from(`${req.params.id}:${expiry}:${process.env.JWT_SECRET}`).toString('base64url');
  res.json({ shareUrl: `/api/ged/shared/${token}`, expires: new Date(expiry).toISOString() });
});

// GET /shared/:token — accès public par lien partagé
router.get('/shared/:token', async (req, res) => {
  try {
    const decoded = Buffer.from(req.params.token, 'base64url').toString();
    const [docId, expiry] = decoded.split(':');
    if (Date.now() > Number(expiry)) return res.status(403).json({ message: 'Lien expiré' });
    const [[doc]] = await pool.query('SELECT * FROM documents WHERE id=?', [docId]);
    if (!doc || !fs.existsSync(doc.chemin)) return res.status(404).json({ message: 'Document introuvable' });
    res.download(doc.chemin, doc.nom);
  } catch { res.status(403).json({ message: 'Lien invalide' }); }
});

module.exports = router;
