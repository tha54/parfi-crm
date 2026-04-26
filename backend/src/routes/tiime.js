const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

/**
 * Detect separator in CSV text (comma or semicolon).
 */
function detectSeparator(header) {
  const commas = (header.match(/,/g) || []).length;
  const semis = (header.match(/;/g) || []).length;
  return semis >= commas ? ';' : ',';
}

/**
 * Map CSV headers to known field names.
 * Returns an object: { nom: colIndex, siren: colIndex, type: colIndex, regime: colIndex, collaborateur: colIndex }
 */
function detectColumns(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const lh = h.toLowerCase().trim();
    if (!map.nom && (lh.includes('nom') || lh.includes('name') || lh.includes('client'))) {
      map.nom = i;
    } else if (!map.siren && lh.includes('siren')) {
      map.siren = i;
    } else if (!map.type && lh === 'type') {
      map.type = i;
    } else if (!map.regime && lh.includes('regime') || lh.includes('régime')) {
      map.regime = i;
    } else if (!map.collaborateur && (lh.includes('collaborateur') || lh.includes('collab'))) {
      map.collaborateur = i;
    }
  });
  // Second pass for type if not found yet (broader match)
  if (map.type === undefined) {
    headers.forEach((h, i) => {
      const lh = h.toLowerCase().trim();
      if (!map.type && lh.includes('type')) map.type = i;
    });
  }
  if (map.regime === undefined) {
    headers.forEach((h, i) => {
      const lh = h.toLowerCase().trim();
      if (!map.regime && (lh.includes('regime') || lh.includes('régime') || lh.includes('périodicité'))) {
        map.regime = i;
      }
    });
  }
  return map;
}

const VALID_TYPES = ['BIC', 'BNC', 'SCI', 'SA', 'SAS', 'SARL', 'EURL', 'EI'];
const VALID_REGIMES = ['mensuel', 'trimestriel', 'annuel'];

function validateRow(row) {
  const errors = [];
  if (!row.nom || !row.nom.trim()) errors.push('Nom client manquant');
  if (row.siren && !/^\d{9}$/.test(row.siren.replace(/\s/g, ''))) {
    errors.push('SIREN invalide (doit contenir 9 chiffres)');
  }
  if (row.regime && !VALID_REGIMES.includes(row.regime.toLowerCase())) {
    errors.push(`Régime invalide : ${row.regime}`);
  }
  return errors;
}

// POST /preview — parse CSV and return preview
router.post('/preview', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ message: 'CSV requis' });

  try {
    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ message: 'CSV trop court (en-tête + au moins une ligne)' });
    }

    const sep = detectSeparator(lines[0]);
    const rawHeaders = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim());
    const colMap = detectColumns(rawHeaders);

    const colonnes = Object.keys(colMap).map(k => rawHeaders[colMap[k]]);

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(sep).map(c => c.replace(/^"|"$/g, '').trim());
      const row = {
        nom: colMap.nom !== undefined ? cells[colMap.nom] || '' : '',
        siren: colMap.siren !== undefined ? (cells[colMap.siren] || '').replace(/\s/g, '') : '',
        type: colMap.type !== undefined ? cells[colMap.type] || '' : '',
        regime: colMap.regime !== undefined ? cells[colMap.regime] || '' : '',
        collaborateur: colMap.collaborateur !== undefined ? cells[colMap.collaborateur] || '' : '',
        errors: [],
      };
      row.errors = validateRow(row);
      rows.push(row);
    }

    const valid = rows.filter(r => r.errors.length === 0).length;
    const invalid = rows.length - valid;

    res.json({ rows, colonnes, total: rows.length, valid, invalid });
  } catch (e) {
    res.status(500).json({ message: 'Erreur lors du parsing CSV', detail: e.message });
  }
});

// POST /import — import validated rows into DB
router.post('/import', verifyToken, requireRole('expert'), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'rows requis' });
  }

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    try {
      // Check if client exists by SIREN or nom
      let existingId = null;

      if (row.siren && row.siren.trim()) {
        const [[existing]] = await pool.query(
          `SELECT id FROM clients WHERE siren = ? LIMIT 1`,
          [row.siren.replace(/\s/g, '')]
        );
        if (existing) existingId = existing.id;
      }

      if (!existingId && row.nom && row.nom.trim()) {
        const [[existing]] = await pool.query(
          `SELECT id FROM clients WHERE nom = ? LIMIT 1`,
          [row.nom.trim()]
        );
        if (existing) existingId = existing.id;
      }

      if (existingId) {
        skipped++;
      } else {
        const [result] = await pool.query(
          `INSERT INTO clients (nom, siren, type_societe, regime_fiscal, statut)
           VALUES (?, ?, ?, ?, 'actif')`,
          [
            row.nom ? row.nom.trim() : null,
            row.siren ? row.siren.replace(/\s/g, '') : null,
            row.type || null,
            row.regime || null,
          ]
        );
        existingId = result.insertId;
        created++;
      }

      // Insert attribution if collaborateur_id is given
      if (row.collaborateur_id && existingId) {
        // Avoid duplicate attribution
        const [[attr]] = await pool.query(
          `SELECT id FROM attributions WHERE client_id = ? AND utilisateur_id = ? LIMIT 1`,
          [existingId, row.collaborateur_id]
        );
        if (!attr) {
          await pool.query(
            `INSERT INTO attributions (client_id, utilisateur_id) VALUES (?, ?)`,
            [existingId, row.collaborateur_id]
          );
        }
      }
    } catch (e) {
      errors.push({ nom: row.nom, error: e.message });
    }
  }

  res.json({ created, skipped, errors });
});

module.exports = router;
