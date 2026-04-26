const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const SERVER_CSV_PATH = '/opt/parfi-crm/export_dossiers_20260426.csv';

// ─── AES-256-GCM for notes_sensibles ─────────────────────────────────────────
const ENC_KEY = Buffer.from(
  (process.env.NOTES_ENCRYPTION_KEY || 'parfi-notes-enc-key-32bytes-pad!!').padEnd(32, '!').slice(0, 32)
);

function encryptNote(text) {
  if (!text?.trim()) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptNote(encStr) {
  if (!encStr?.startsWith('enc:')) return encStr;
  try {
    const [, ivHex, tagHex, ...rest] = encStr.split(':');
    const iv  = Buffer.from(ivHex,  'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(rest.join(':'), 'hex');
    const d   = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    d.setAuthTag(tag);
    return d.update(enc) + d.final('utf8');
  } catch {
    return '[Déchiffrement impossible]';
  }
}

// ─── Parse buffer (ISO-8859-1 → csv-parse) ────────────────────────────────────
function bufferToRows(buf) {
  const text = buf.toString('latin1'); // latin1 ≡ ISO-8859-1 in Node.js
  return parse(text, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
    bom: true,
  });
}

// ─── Field mapping ────────────────────────────────────────────────────────────
function extractSIREN(ref, siret) {
  const c = (ref || '').replace(/\D/g, '');
  if (c.length === 9) return c;
  if (c.length === 8) return '0' + c;
  const s = (siret || '').replace(/\D/g, '');
  return s.length >= 9 ? s.slice(0, 9) : null;
}

function parseDate(v) {
  if (!v?.trim()) return null;
  const [d, m, y] = v.trim().split('/');
  return y?.length >= 4 ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null;
}

function extractAPE(val) {
  if (!val) return { code_ape: null, activite: null };
  const m = val.match(/^([A-Z0-9]{4,5}[A-Z]?)\s+(.*)/i);
  return m
    ? { code_ape: m[1].toUpperCase(), activite: m[2].trim() }
    : { code_ape: null, activite: val.trim() };
}

function mapClientType(fj, ri) {
  const f = (fj || '').toUpperCase();
  const r = (ri || '').toUpperCase();
  if (f.includes('SCI'))    return 'SCI';
  if (f === 'SA')           return 'SA';
  if (f.includes('ASSOC')) return 'Association';
  if (r.startsWith('BNC')) return 'BNC';
  if (r.startsWith('BIC') || ['SARL','SAS','EURL','EI','SASU'].some(x => f.includes(x))) return 'BIC';
  return 'Autre';
}

function mapRegime(val) {
  return (val || '').toLowerCase().includes('trimestriel') ? 'trimestriel' : 'mensuel';
}

function mapRegimeTVACode(val) {
  const v = (val || '').toLowerCase();
  if (v.includes('trimestriel')) return 'trimestriel';
  if (v.includes('mensuel'))     return 'mensuel';
  if (v.includes('non'))         return 'non_soumis';
  return val?.trim() || null;
}

// ─── Fuzzy user name match ────────────────────────────────────────────────────
function fuzzyMatchUser(name, users) {
  if (!name?.trim()) return null;
  const n = name.toLowerCase().trim();
  for (const u of users) {
    const nom    = u.nom.toLowerCase();
    const prenom = u.prenom.toLowerCase();
    if (n === `${prenom} ${nom}` || n === `${nom} ${prenom}`) return u.id;
  }
  const parts = n.split(/\s+/);
  for (const u of users) {
    const nom    = u.nom.toLowerCase();
    const prenom = u.prenom.toLowerCase();
    if (parts.every(p => nom.includes(p) || prenom.includes(p))) return u.id;
    if (parts.some(p => p.length >= 3 && nom === p)) return u.id;
  }
  return null;
}

// ─── Map one csv-parse row object → CRM fields ────────────────────────────────
function mapRow(r) {
  const fj    = r['Forme Juridique']   || '';
  const ri    = r["Régime d'imposition"] || '';
  const tva   = r['Régime de TVA']     || '';
  const ref   = r['Numéro de référence'] || '';
  const siret = r['Siret']             || '';
  const siren = extractSIREN(ref, siret);
  const ape   = extractAPE(r["Code APE et activité liée à l'APE"]);
  const dossier   = r['Dossier'] || '';
  const nomDir    = r['Nom Dirigeant'] || '';
  const prenomDir = r['Prénom dirigeant'] || '';
  const raisonSoc = [nomDir, prenomDir].filter(Boolean).join(' ') || null;
  const nom       = dossier || raisonSoc || siren || 'INCONNU';
  const capRaw    = (r['Capital'] || '').replace(',', '.');
  const capital   = capRaw ? parseFloat(capRaw) : null;

  return {
    etat:               r['Etat'] || '',
    nom,
    dossier:            dossier || null,
    raison_sociale:     raisonSoc,
    siren,
    siret:              siret || null,
    forme_juridique:    fj || null,
    adresse:            r["Adresse de la société"] || null,
    code_postal:        r['Code postal'] || null,
    ville:              r['Ville'] || null,
    capital:            isNaN(capital) ? null : capital,
    code_ape:           ape.code_ape,
    activite:           ape.activite,
    regime_tva:         mapRegimeTVACode(tva),
    regime_fiscal:      ri || null,
    type:               mapClientType(fj, ri),
    regime:             mapRegime(tva),
    date_cloture:       parseDate(r['Date de clôture du premier exercice ouvert']),
    email_dirigeant:    r['Email dirigeant'] || null,
    telephone_dirigeant:r['Téléphone du dirigeant'] || null,
    notes_sensibles:    r['Note dossier'] || null,
    groupe:             r['Groupe'] || null,
    expert:             r['Expert-comptable'] || null,
    chef_mission:       r['Chef de Mission'] || null,
    collaborateur:      r['Collaborateur'] || null,
    autres_intervenants:r['Autres intervenants'] || null,
  };
}

// ─── Shared: build analysis from rows array ────────────────────────────────────
async function buildAnalysis(rows) {
  const [users]    = await pool.query('SELECT id, nom, prenom FROM utilisateurs WHERE actif = 1');
  const [existing] = await pool.query('SELECT siren FROM clients WHERE siren IS NOT NULL');
  const existingSIRENs = new Set(existing.map(c => c.siren));

  const mapped     = rows.map(mapRow);
  const actifRows  = mapped.filter(r => r.etat === 'Actif');
  const archRows   = mapped.filter(r => r.etat === 'Fin de mission' || r.etat === 'Arrêt des travaux');
  const prosRows   = mapped.filter(r => r.etat === 'Création');
  const dupRows    = mapped.filter(r => r.siren && existingSIRENs.has(r.siren));

  const unmatchedSet = new Set();
  mapped.forEach(r => {
    [r.expert, r.chef_mission, r.collaborateur,
      ...(r.autres_intervenants?.split(',').map(s => s.trim()) || [])]
      .filter(Boolean)
      .forEach(n => { if (!fuzzyMatchUser(n, users)) unmatchedSet.add(n); });
  });

  const preview = actifRows.slice(0, 5).map(r => ({
    nom:             r.nom,
    raison_sociale:  r.raison_sociale,
    siren:           r.siren,
    siret:           r.siret,
    forme_juridique: r.forme_juridique,
    ville:           r.ville,
    type:            r.type,
    regime_tva:      r.regime_tva,
    regime_fiscal:   r.regime_fiscal,
    expert:          r.expert,
    collaborateur:   r.collaborateur,
    groupe:          r.groupe,
    hasNote:         !!(r.notes_sensibles?.trim()),
    isDuplicate:     !!(r.siren && existingSIRENs.has(r.siren)),
  }));

  return {
    total:            mapped.length,
    actif:            actifRows.length,
    archive:          archRows.length,
    prospects:        prosRows.length,
    duplicates:       dupRows.length,
    hasSensitiveNotes: mapped.some(r => r.notes_sensibles?.trim()),
    unmatchedUsers:   [...unmatchedSet].slice(0, 30),
    preview,
  };
}

// ─── Shared: run the import ────────────────────────────────────────────────────
async function runImport(rows, options, userId) {
  const { includeArchived = false } = options;
  const [users]    = await pool.query('SELECT id, nom, prenom FROM utilisateurs WHERE actif = 1');
  const [existing] = await pool.query('SELECT siren FROM clients WHERE siren IS NOT NULL');
  const existingSIRENs = new Set(existing.map(c => c.siren));

  let created = 0, archived = 0, skipped = 0, prospects = 0;
  const errorLog = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = mapRow(rows[idx]);
    try {
      const isArch = r.etat === 'Fin de mission' || r.etat === 'Arrêt des travaux';
      if (isArch && !includeArchived) { skipped++; continue; }

      // Création → prospect
      if (r.etat === 'Création') {
        if (r.siren) {
          const [[ep]] = await pool.query('SELECT id FROM prospects WHERE siren = ?', [r.siren]);
          if (ep) { skipped++; continue; }
        }
        await pool.query(
          `INSERT INTO prospects
             (nom, siren, siret, forme_juridique, adresse, code_postal, ville,
              activite, email, telephone, notes, statut, source, type_prospect, cree_par)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,'nouveau','Tiime','entreprise',?)`,
          [r.nom, r.siren, r.siret, r.forme_juridique, r.adresse, r.code_postal,
           r.ville, r.activite, r.email_dirigeant, r.telephone_dirigeant,
           null /* never store raw notes in prospects */, userId]
        );
        prospects++;
        continue;
      }

      // SIREN dedup
      if (r.siren && existingSIRENs.has(r.siren)) { skipped++; continue; }

      const [result] = await pool.query(
        `INSERT INTO clients
           (nom, siren, siret, type, regime, actif,
            forme_juridique, raison_sociale,
            adresse, code_postal, ville, capital, code_ape, activite,
            regime_tva, regime_fiscal, date_cloture, groupe,
            email_dirigeant, telephone_dirigeant, notes_sensibles)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          r.nom, r.siren, r.siret, r.type, r.regime, isArch ? 0 : 1,
          r.forme_juridique, r.raison_sociale,
          r.adresse, r.code_postal, r.ville,
          r.capital, r.code_ape, r.activite,
          r.regime_tva, r.regime_fiscal,
          r.date_cloture, r.groupe,
          r.email_dirigeant, r.telephone_dirigeant,
          encryptNote(r.notes_sensibles),
        ]
      );
      const clientId = result.insertId;
      if (r.siren) existingSIRENs.add(r.siren);
      if (isArch) archived++; else created++;

      // Attributions
      const seen = new Set();
      const addAttr = async (name, role) => {
        const uid = fuzzyMatchUser(name, users);
        if (!uid || seen.has(uid)) return;
        seen.add(uid);
        const [[ex]] = await pool.query(
          'SELECT id FROM attributions WHERE client_id=? AND utilisateur_id=?',
          [clientId, uid]
        );
        if (!ex) await pool.query(
          'INSERT INTO attributions (client_id, utilisateur_id, role_sur_dossier) VALUES (?,?,?)',
          [clientId, uid, role]
        );
      };
      await addAttr(r.expert,       'responsable');
      await addAttr(r.chef_mission, 'responsable');
      await addAttr(r.collaborateur,'assistant');
      for (const n of (r.autres_intervenants?.split(',').map(s=>s.trim()).filter(Boolean) || [])) {
        await addAttr(n, 'assistant');
      }
    } catch (e) {
      errorLog.push({ row: idx + 2, nom: r.nom, siren: r.siren || '—', reason: e.message });
    }
  }

  return { created, archived, skipped, prospects, errors: errorLog.length, errorLog };
}

// ════════════════════════════════════════════════════════════════════════════════
// Routes
// ════════════════════════════════════════════════════════════════════════════════

// GET /tiime/server-analyze — read server file and return analysis
router.get('/server-analyze', verifyToken, requireRole('expert'), async (req, res) => {
  if (!fs.existsSync(SERVER_CSV_PATH)) {
    return res.status(404).json({ message: `Fichier non trouvé : ${SERVER_CSV_PATH}` });
  }
  try {
    const rows = bufferToRows(fs.readFileSync(SERVER_CSV_PATH));
    res.json(await buildAnalysis(rows));
  } catch (e) {
    res.status(500).json({ message: 'Erreur analyse', detail: e.message });
  }
});

// POST /tiime/upload-analyze — accept file upload (multipart) and return analysis
router.post('/upload-analyze', verifyToken, requireRole('expert'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  try {
    const rows = bufferToRows(req.file.buffer);
    res.json(await buildAnalysis(rows));
  } catch (e) {
    res.status(500).json({ message: 'Erreur analyse', detail: e.message });
  }
});

// GET /tiime/server-import — import from server file
router.get('/server-import', verifyToken, requireRole('expert'), async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  if (!fs.existsSync(SERVER_CSV_PATH)) {
    return res.status(404).json({ message: `Fichier non trouvé : ${SERVER_CSV_PATH}` });
  }
  try {
    const rows = bufferToRows(fs.readFileSync(SERVER_CSV_PATH));
    res.json(await runImport(rows, { includeArchived }, req.user.id));
  } catch (e) {
    res.status(500).json({ message: "Erreur import", detail: e.message });
  }
});

// POST /tiime/upload-import — import from uploaded file
router.post('/upload-import', verifyToken, requireRole('expert'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const includeArchived = req.query.includeArchived === 'true';
  try {
    const rows = bufferToRows(req.file.buffer);
    res.json(await runImport(rows, { includeArchived }, req.user.id));
  } catch (e) {
    res.status(500).json({ message: "Erreur import", detail: e.message });
  }
});

// GET /tiime/client-notes/:id — expert only: decrypt and return sensitive notes
router.get('/client-notes/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    const [[c]] = await pool.query('SELECT notes_sensibles FROM clients WHERE id = ?', [req.params.id]);
    if (!c) return res.status(404).json({ message: 'Client introuvable' });
    res.json({ notes: c.notes_sensibles ? decryptNote(c.notes_sensibles) : null });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
