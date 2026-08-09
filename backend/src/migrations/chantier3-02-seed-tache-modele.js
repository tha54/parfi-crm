'use strict';
/**
 * Chantier 3 — Lot 1 : seed tache_modele
 *
 * Charge docs-production/seed/tache_modele.csv dans tache_modele.
 * Rejouable : INSERT ... ON DUPLICATE KEY UPDATE sur le code (PK).
 *
 * Format CSV attendu (10 colonnes, séparateur `,`) :
 *   code, bloc, ordre, libelle, diligence_attendue, point_de_vigilance,
 *   obligatoire, profils_applicables, classes_applicables, code_temps_defaut
 *
 *   - profils_applicables et classes_applicables : séparateur pipe `|`
 *     (ex : « T », « A|B|C »). Stockés en JSON array.
 *   - obligatoire : true|false, stocké en TINYINT.
 *
 * Usage : node chantier3-02-seed-tache-modele.js [--db parfi_test|parfi]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
if (!process.env.DB_PASSWORD) { throw new Error('DB_PASSWORD manquant (charger backend/.env)'); }
const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB };

const CSV_PATH = path.join(__dirname, '..', '..', '..', 'docs-production', 'seed', 'tache_modele.csv');

// Parseur CSV minimal supportant les guillemets doubles avec virgules internes
// (RFC-4180 sans multiligne, ce qui suffit pour ce seed).
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  return lines.map(line => {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else {
        if (ch === ',') { fields.push(cur); cur = ''; }
        else if (ch === '"') { inQuotes = true; }
        else { cur += ch; }
      }
    }
    fields.push(cur);
    return fields;
  });
}

async function run() {
  console.log(`\n=== Chantier 3 — seed tache_modele (${DB}) ===\n`);
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV introuvable : ${CSV_PATH}`);
  }
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  if (raw.trimStart().startsWith('<')) {
    throw new Error(`CSV corrompu (contenu HTML détecté) : ${CSV_PATH}`);
  }

  const rows = parseCsv(raw);
  const header = rows.shift();
  const expected = ['code','bloc','ordre','libelle','diligence_attendue','point_de_vigilance',
                    'obligatoire','profils_applicables','classes_applicables','code_temps_defaut'];
  for (let i = 0; i < expected.length; i++) {
    if (header[i] !== expected[i]) {
      throw new Error(`En-tête inattendu à la colonne ${i}: attendu « ${expected[i]} », lu « ${header[i]} »`);
    }
  }

  const conn = await mysql.createConnection(CONF);
  try {
    let upserted = 0;
    for (const r of rows) {
      const [code, bloc, ordre, libelle, diligence, vigilance,
             obligatoire, profils, classes, codeTemps] = r;
      const profilsJson = JSON.stringify(profils.split('|').map(s => s.trim()).filter(Boolean));
      const classesJson = JSON.stringify(classes.split('|').map(s => s.trim()).filter(Boolean));
      const obliInt = /^true$/i.test(obligatoire) ? 1 : 0;
      const codeTempsVal = codeTemps && codeTemps.trim() ? codeTemps.trim() : null;

      await conn.query(
        `INSERT INTO tache_modele
           (code, bloc, ordre, libelle, diligence_attendue, point_de_vigilance,
            obligatoire, profils_applicables, classes_applicables, code_temps_defaut)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           bloc = VALUES(bloc),
           ordre = VALUES(ordre),
           libelle = VALUES(libelle),
           diligence_attendue = VALUES(diligence_attendue),
           point_de_vigilance = VALUES(point_de_vigilance),
           obligatoire = VALUES(obligatoire),
           profils_applicables = VALUES(profils_applicables),
           classes_applicables = VALUES(classes_applicables),
           code_temps_defaut = VALUES(code_temps_defaut)`,
        [code, bloc, Number(ordre), libelle, diligence, vigilance || null,
         obliInt, profilsJson, classesJson, codeTempsVal]
      );
      upserted++;
    }
    console.log(`  [SEED] tache_modele : ${upserted} ligne(s) upserted`);

    const [[{ nb }]] = await conn.query(`SELECT COUNT(*) AS nb FROM tache_modele`);
    console.log(`  [CHK]  tache_modele contient ${nb} ligne(s)`);
    if (nb !== 26) {
      console.warn(`  [WARN] 26 lignes attendues, ${nb} trouvées`);
    }

    console.log('\n=== seed tache_modele OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
