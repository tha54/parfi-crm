#!/usr/bin/env node
// verify-no-dev-switch-in-prod.mjs
//
// Test de non-régression : construit le frontend en mode production et vérifie
// que la chaîne sentinelle DEV_USER_SWITCH n'apparaît nulle part dans dist/.
//
// C'est le seul garde-fou qui prouve que Rollup a effectivement éliminé le
// code du sélecteur. Une variable mal positionnée, un import mal écrit, une
// condition évaluée seulement à l'exécution → cette chaîne réapparaît, ce
// script échoue, la CI bloque.
//
// Usage : node scripts/verify-no-dev-switch-in-prod.mjs
//         (ou : npm run verify-no-dev-switch depuis frontend/)
//
// Sortie : exit 0 si absent, exit 1 sinon.

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE     = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..');
const DIST     = join(FRONTEND, 'dist');

// Sentinelles cherchées : le minifier supprime commentaires et identifiants
// mais préserve les chaînes littérales. On cherche donc à la fois :
//   - la sentinelle en toutes lettres (chaîne / commentaires) — supprimée par
//     le minifier ; sa présence en prod signale un fichier non traité.
//   - le slug fonctionnel de l'URL — chaîne littérale préservée. Sa présence
//     en prod signale que le chunk n'a pas été éliminé.
//   - un email @demo.local — même logique, chaîne préservée.
const NEEDLES = [
  { needle: 'DEV_USER_SWITCH',   description: 'sentinelle textuelle' },
  { needle: 'dev-user-switch',   description: 'slug d\'URL' },
  { needle: '@demo.local',       description: 'domaine des comptes démo' },
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

console.log(`▶ vite build --mode production (depuis ${FRONTEND})`);
try {
  execSync('npx vite build --mode production', { cwd: FRONTEND, stdio: 'inherit' });
} catch (e) {
  console.error('❌ échec du build de production');
  process.exit(1);
}

console.log(`▶ recherche des ${NEEDLES.length} sentinelles dans dist/`);
const files = walk(DIST);
let hits = 0;
for (const f of files) {
  const buf = readFileSync(f);
  for (const { needle, description } of NEEDLES) {
    if (buf.includes(needle)) {
      console.error(`  ❌ ${f} : "${needle}" (${description})`);
      hits++;
    }
  }
}

if (hits === 0) {
  console.log(`✅ ${files.length} fichier(s) scanné(s), aucune sentinelle trouvée. Le sélecteur est bien éliminé du bundle de production.`);
  process.exit(0);
} else {
  console.error(`\n❌ ${hits} occurrence(s) de sentinelle(s) dans le bundle de production. Le sélecteur n'a pas été éliminé — refaire vérifier la mécanique define/import dynamique de main.jsx et vite.config.js.`);
  process.exit(1);
}
