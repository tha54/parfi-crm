const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const fs = require('fs');
const crypto = require('crypto');

const SERVER_CSV_PATH = '/opt/parfi-crm/export_dossiers_20260426.csv';

// ─── AES-256-GCM encryption for sensitive notes ───────────────────────────────
const ENC_KEY = Buffer.from(
  (process.env.NOTES_ENCRYPTION_KEY || 'parfi-notes-default-key-32bytes!!').padEnd(32, '!').slice(0, 32)
);

function encryptNote(text) {
  if (!text || !text.trim()) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

// ─── RFC-4180 CSV parser — handles semicolons, quoted fields, embedded newlines ─
function parseCSV(text) {
  const sep = ';';
  const rows = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const row = [];

    while (i < n) {
      let field = '';

      if (text[i] === '"') {
        i++; // skip opening quote
        while (i < n) {
          if (text[i] === '"') {
            if (i + 1 < n && text[i + 1] === '"') {
              field += '"'; i += 2; // escaped ""
            } else {
              i++; break; // closing quote
            }
          } else {
            field += text[i++];
          }
        }
      } else {
        while (i < n && text[i] !== sep && text[i] !== '\r' && text[i] !== '\n') {
          field += text[i++];
        }
      }

      row.push(field);

      if (i < n && text[i] === sep) {
        i++; // consume separator, continue row
      } else {
        break; // end of row
      }
    }

    if (i < n && text[i] === '\r') i++;
    if (i < n && text[i] === '\n') i++;

    if (row.some(f => f.trim())) rows.push(row);
  }

  return rows;
}

// ─── Field helpers ────────────────────────────────────────────────────────────
function extractSIREN(ref, siret) {
  const clean = (ref || '').replace(/\D/g, '');
  if (clean.length === 9) return clean;
  if (clean.length === 8) return '0' + clean;
  const s = (siret || '').replace(/\D/g, '');
  if (s.length >= 9) return s.substring(0, 9);
  return null;
}

function parseDate(val) {
  if (!val || !val.trim()) return null;
  const parts = val.trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!y || y.length < 4) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function extractAPE(val) {
  if (!val) return { code_ape: null, activite: null };
  const m = val.match(/^([A-Z0-9]{4,5}[A-Z]?)\s+(.*)/i);
  if (m) return { code_ape: m[1].trim().toUpperCase(), activite: m[2].trim() };
  if (val.length <= 7) return { code_ape: val.trim(), activite: null };
  return { code_ape: null, activite: val.trim() };
}

function mapClientType(formeJur, regimeImp) {
  const fj = (formeJur || '').toUpperCase();
  const ri = (regimeImp || '').toUpperCase();
  if (fj.includes('SCI')) return 'SCI';
  if (fj === 'SA') return 'SA';
  if (fj.includes('ASSOC')) return 'Association';
  if (ri.startsWith('BNC')) return 'BNC';
  if (ri.startsWith('BIC')) return 'BIC';
  if (['SARL', 'SAS', 'EURL', 'EI', 'SASU'].some(f => fj.includes(f))) return 'BIC';
  return 'Autre';
}

function mapRegime(val) {
  const v = (val || '').toLowerCase();
  if (v.includes('trimestriel')) return 'trimestriel';
  if (v.includes('mensuel')) return 'mensuel';
  return 'mensuel'; // default for 'Non soumis' etc.
}

function mapRegimeTVACode(val) {
  const v = (val || '').toLowerCase();
  if (v.includes('trimestriel')) return 'trimestriel';
  if (v.includes('mensuel')) return 'mensuel';
  if (v.includes('non soumis') || v.includes('non_soumis')) return 'non_soumis';
  return val ? val.trim() : null;
}

// ─── Fuzzy user name matcher ──────────────────────────────────────────────────
function fuzzyMatchUser(name, users) {
  if (!name?.trim()) return null;
  const n = name.toLowerCase().trim();
  // Exact full name (either order)
  for (const u of users) {
    const nom = u.nom.toLowerCase();
    const prenom = u.prenom.toLowerCase();
    if (n === `${prenom} ${nom}` || n === `${nom} ${prenom}`) return u.id;
  }
  // Contains last name (case-insensitive)
  const parts = n.split(/\s+/);
  for (const u of users) {
    const nom = u.nom.toLowerCase();
    if (parts.some(p => p.length >= 3 && nom === p)) return u.id;
    if (parts.every(p => u.nom.toLowerCase().includes(p) || u.prenom.toLowerCase().includes(p))) return u.id;
  }
  return null;
}

// ─── Map CSV row to structured object ─────────────────────────────────────────
function buildRow(headers, cells) {
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
  const get = (col) => (idx[col] !== undefined ? (cells[idx[col]] || '').trim() : '');

  const ref   = get('Numéro de référence');
  const siret = get('Siret');
  const siren = extractSIREN(ref, siret);
  const ape   = extractAPE(get("Code APE et activité liée à l'APE"));
  const fj    = get('Forme Juridique');
  const ri    = get("Régime d'imposition");
  const tvaRaw = get('Régime de TVA');
  const dossier    = get('Dossier');
  const nomDir     = get('Nom Dirigeant');
  const prenomDir  = get('Prénom dirigeant');
  const raisonSoc  = [nomDir, prenomDir].filter(Boolean).join(' ') || null;
  const nom        = dossier || raisonSoc || siren || 'INCONNU';
  const capitalRaw = get('Capital').replace(',', '.');
  const capital    = capitalRaw ? parseFloat(capitalRaw) : null;

  return {
    etat:              get('Etat'),
    nom,
    dossier:           dossier || null,
    raison_sociale:    raisonSoc,
    siren,
    siret:             siret || null,
    forme_juridique:   fj || null,
    adresse:           get('Adresse de la société') || null,
    code_postal:       get('Code postal') || null,
    ville:             get('Ville') || null,
    capital:           isNaN(capital) ? null : capital,
    code_ape:          ape.code_ape,
    activite:          ape.activite,
    regime_tva:        mapRegimeTVACode(tvaRaw),
    regime_fiscal:     ri || null,
    type:              mapClientType(fj, ri),
    regime:            mapRegime(tvaRaw),
    date_cloture:      parseDate(get('Date de clôture du premier exercice ouvert')),
    email_dirigeant:   get('Email dirigeant') || null,
    telephone_dirigeant: get('Téléphone du dirigeant') || null,
    notes_sensibles:   get('Note dossier') || null,
    groupe:            get('Groupe') || null,
    expert:            get('Expert-comptable') || null,
    chef_mission:      get('Chef de Mission') || null,
    collaborateur:     get('Collaborateur') || null,
    autres_intervenants: get('Autres intervenants') || null,
  };
}

// ─── GET /tiime/server-file — load the known CSV from server ─────────────────
router.get('/server-file', verifyToken, requireRole('expert'), (req, res) => {
  if (!fs.existsSync(SERVER_CSV_PATH)) {
    return res.status(404).json({
      message: `Fichier non trouvé : ${SERVER_CSV_PATH}`,
    });
  }
  try {
    const buf  = fs.readFileSync(SERVER_CSV_PATH);
    const text = buf.toString('latin1'); // ISO-8859-1 → UTF-16 JS string
    res.json({ text, filename: 'export_dossiers_20260426.csv' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur lecture fichier', detail: e.message });
  }
});

// ─── POST /tiime/analyze — parse & preview ────────────────────────────────────
router.post('/analyze', verifyToken, requireRole('expert'), async (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ message: 'CSV requis' });

  try {
    const parsed = parseCSV(csv);
    if (parsed.length < 2) return res.status(400).json({ message: 'CSV trop court' });

    const headers  = parsed[0];
    const dataRows = parsed.slice(1).map(cells => buildRow(headers, cells));

    const [users]     = await pool.query('SELECT id, nom, prenom FROM utilisateurs WHERE actif = 1');
    const [existing]  = await pool.query('SELECT siren FROM clients WHERE siren IS NOT NULL');
    const existingSIRENs = new Set(existing.map(c => c.siren));

    const actifRows   = dataRows.filter(r => r.etat === 'Actif');
    const archRows    = dataRows.filter(r => r.etat === 'Fin de mission' || r.etat === 'Arrêt des travaux');
    const prospectsR  = dataRows.filter(r => r.etat === 'Création');
    const duplicates  = dataRows.filter(r => r.siren && existingSIRENs.has(r.siren));
    const hasSensNotes = dataRows.some(r => r.notes_sensibles?.trim());

    // Collect user names that can't be matched
    const unmatchedSet = new Set();
    dataRows.forEach(r => {
      const names = [
        r.expert, r.chef_mission, r.collaborateur,
        ...(r.autres_intervenants?.split(',').map(s => s.trim()) || []),
      ];
      names.forEach(n => {
        if (n && !fuzzyMatchUser(n, users)) unmatchedSet.add(n);
      });
    });

    const preview = actifRows.slice(0, 10).map(r => ({
      nom:            r.nom,
      raison_sociale: r.raison_sociale,
      siren:          r.siren,
      forme_juridique:r.forme_juridique,
      ville:          r.ville,
      type:           r.type,
      regime_tva:     r.regime_tva,
      regime_fiscal:  r.regime_fiscal,
      expert:         r.expert,
      collaborateur:  r.collaborateur,
      groupe:         r.groupe,
      isDuplicate:    !!(r.siren && existingSIRENs.has(r.siren)),
    }));

    res.json({
      total:          dataRows.length,
      actif:          actifRows.length,
      archive:        archRows.length,
      prospects:      prospectsR.length,
      duplicates:     duplicates.length,
      hasSensitiveNotes: hasSensNotes,
      unmatchedUsers: [...unmatchedSet].slice(0, 30),
      preview,
    });
  } catch (e) {
    res.status(500).json({ message: 'Erreur analyse CSV', detail: e.message });
  }
});

// ─── POST /tiime/import — full import ─────────────────────────────────────────
router.post('/import', verifyToken, requireRole('expert'), async (req, res) => {
  const { csv, options = {} } = req.body;
  const { includeArchived = false } = options;

  if (!csv) return res.status(400).json({ message: 'CSV requis' });

  try {
    const parsed = parseCSV(csv);
    if (parsed.length < 2) return res.status(400).json({ message: 'CSV trop court' });

    const headers  = parsed[0];
    const dataRows = parsed.slice(1).map(cells => buildRow(headers, cells));

    const [users]    = await pool.query('SELECT id, nom, prenom FROM utilisateurs WHERE actif = 1');
    const [existing] = await pool.query('SELECT siren FROM clients WHERE siren IS NOT NULL');
    const existingSIRENs = new Set(existing.map(c => c.siren));

    let created = 0, archived = 0, skipped = 0, prospects = 0;
    const errorLog = [];

    for (let idx = 0; idx < dataRows.length; idx++) {
      const r      = dataRows[idx];
      const rowNum = idx + 2; // 1-indexed, +1 for header row

      try {
        const isArch = r.etat === 'Fin de mission' || r.etat === 'Arrêt des travaux';

        if (isArch && !includeArchived) { skipped++; continue; }

        // Création → insert as prospect
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
             r.notes_sensibles, req.user.id]
          );
          prospects++;
          continue;
        }

        // SIREN uniqueness check
        if (r.siren && existingSIRENs.has(r.siren)) { skipped++; continue; }

        // Encrypt sensitive notes
        const encNotes = encryptNote(r.notes_sensibles);

        const [result] = await pool.query(
          `INSERT INTO clients
            (nom, siren, siret, type, regime, actif,
             forme_juridique, raison_sociale,
             adresse, code_postal, ville,
             capital, code_ape, activite,
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
            encNotes,
          ]
        );
        const clientId = result.insertId;
        if (r.siren) existingSIRENs.add(r.siren);
        if (isArch) archived++; else created++;

        // Attributions: expert/chef → 'responsable', collab/autres → 'assistant'
        const seen = new Set();
        const addAttrib = async (name, role) => {
          const uid = fuzzyMatchUser(name, users);
          if (!uid || seen.has(uid)) return;
          seen.add(uid);
          const [[ex]] = await pool.query(
            'SELECT id FROM attributions WHERE client_id = ? AND utilisateur_id = ?',
            [clientId, uid]
          );
          if (!ex) {
            await pool.query(
              'INSERT INTO attributions (client_id, utilisateur_id, role_sur_dossier) VALUES (?,?,?)',
              [clientId, uid, role]
            );
          }
        };

        await addAttrib(r.expert,        'responsable');
        await addAttrib(r.chef_mission,  'responsable');
        await addAttrib(r.collaborateur, 'assistant');

        if (r.autres_intervenants) {
          for (const name of r.autres_intervenants.split(',').map(s => s.trim()).filter(Boolean)) {
            await addAttrib(name, 'assistant');
          }
        }
      } catch (e) {
        errorLog.push({ row: rowNum, nom: r.nom, siren: r.siren || '—', reason: e.message });
      }
    }

    res.json({ created, archived, skipped, prospects, errors: errorLog.length, errorLog });
  } catch (e) {
    res.status(500).json({ message: "Erreur lors de l'import", detail: e.message });
  }
});

module.exports = router;
