'use strict';
/**
 * Chantier 3 — utilitaires DEV_USER_SWITCH : seed des 3 utilisateurs de démo.
 *
 * Ces 3 comptes existent pour le sélecteur de vues de développement
 * (frontend/src/dev-user-switch/, backend/src/dev-user-switch/). Le sélecteur
 * est un outil TEMPORAIRE qui doit disparaître à la mise en service — le
 * module est isolé et sa présence est bloquée dans les builds de prod
 * (voir frontend test dev-user-switch-absent.test.js).
 *
 * Comptes créés (emails @demo.local pour éviter toute confusion avec les
 * boîtes mail réelles du cabinet) :
 *   - theo.marchand@demo.local  — collaborateur, grade senior
 *   - valerie.ancel@demo.local  — chef_mission (rôle applicatif), grade chef_mission
 *   - ec.demo@demo.local        — expert, grade expert_comptable
 *
 * Idempotent : ON DUPLICATE KEY UPDATE sur email.
 *
 * Le mot de passe est aléatoire fort : ces comptes ne sont pas destinés au
 * login normal. Le sélecteur émet un JWT pour eux sans mot de passe.
 *
 * Usage : node chantier3-07-seed-demo-users.js --db parfi
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DB = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'parfi_test';
if (!process.env.DB_PASSWORD) { throw new Error('DB_PASSWORD manquant'); }

const CONF = { host: 'localhost', user: 'parfi', password: process.env.DB_PASSWORD, database: DB };

const COMPTES = [
  { prenom: 'Théo',       nom: 'Marchand', email: 'theo.marchand@demo.local',
    role: 'collaborateur', role_metier: 'collaborateur_senior', grade: 'senior' },
  { prenom: 'Valérie',    nom: 'Ancel',    email: 'valerie.ancel@demo.local',
    role: 'chef_mission',  role_metier: 'chef_de_mission',      grade: 'chef_mission' },
  { prenom: 'Expert',     nom: 'Démo',     email: 'ec.demo@demo.local',
    role: 'expert',        role_metier: 'expert_comptable',      grade: 'expert_comptable' },
];

async function run() {
  console.log(`\n=== Seed DEV_USER_SWITCH — 3 comptes de démo (${DB}) ===\n`);
  const conn = await mysql.createConnection(CONF);
  try {
    for (const c of COMPTES) {
      const pw = crypto.randomBytes(24).toString('base64');
      const hash = await bcrypt.hash(pw, 10);

      await conn.query(
        `INSERT INTO utilisateurs
           (prenom, nom, email, mot_de_passe, role, role_metier, grade, actif)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           prenom=VALUES(prenom), nom=VALUES(nom),
           role=VALUES(role), role_metier=VALUES(role_metier),
           grade=VALUES(grade), actif=1`,
        [c.prenom, c.nom, c.email, hash, c.role, c.role_metier, c.grade]
      );
      console.log(`  [UPSERT] ${c.email} — ${c.role} / ${c.role_metier} / grade=${c.grade}`);
    }
    console.log('\n=== OK ===\n');
  } finally {
    await conn.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
