'use strict';
/**
 * Chantier 3 — module onboarding (entrée en relation).
 *
 * Deux fonctions, exactement sur le patron de generer-periodes.js.
 *
 *   creerOnboardingSiBesoin(dossierId, opts, connexion)
 *       Idempotent : la contrainte UNIQUE (dossier_id) fait foi. Si un
 *       onboarding existe déjà, renvoyer son id sans rien modifier.
 *       Sinon insertion avec date_fin_cible = date_signature + 60 j.
 *
 *   instancierEtapesOnboarding(onboardingId, dossier, connexion)
 *       Filtre le référentiel selon les conditions :
 *         - condition NULL              → toujours instanciée
 *         - condition = reprise_confrere → si onboarding.reprise_confrere = 1
 *         - condition = profil_especes  → si le dossier a le profil 'E'
 *       Insère les étapes manquantes (UNIQUE (onboarding_id, code_modele)
 *       garantit qu'aucun doublon ne peut être créé au rerun). Ne
 *       réinstancie jamais une étape déjà présente — les statuts F, EC, NA
 *       restent intacts, exactement comme instancierTaches pour les périodes.
 *       date_echeance = onboarding.date_signature + modele.delai_jours.
 */

const pool = require('../config/db');

const CONDITIONS_APPLICABLES = {
  reprise_confrere: (onb, _dossier) => onb.reprise_confrere === 1,
  profil_especes:   (_onb, dossier) => Array.isArray(dossier.profils) && dossier.profils.includes('E'),
};

function normaliserJson(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

// mysql2 renvoie DATE en Date JS. On veut YYYY-MM-DD peu importe l'entrée.
function toYmd(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

async function creerOnboardingSiBesoin(dossierId, opts = {}, connexion = null) {
  const conn = connexion || pool;
  const [[existing]] = await conn.query(
    `SELECT id FROM onboarding WHERE dossier_id = ? LIMIT 1`, [dossierId]
  );
  if (existing) return existing.id;

  const dateSignature = opts.dateSignature
    ? toYmd(opts.dateSignature)
    : new Date().toISOString().slice(0, 10);

  // date_fin_cible = date_signature + 60 jours (posée à la création, jamais
  // recalculée à la lecture — c'est un point de rendez-vous, pas une durée).
  const finCible = new Date(dateSignature + 'T00:00:00Z');
  finCible.setUTCDate(finCible.getUTCDate() + 60);
  const dateFinCible = finCible.toISOString().slice(0, 10);

  const repriseConfrere = opts.repriseConfrere ? 1 : 0;
  const confrerePrecedent = opts.confrerePrecedent || null;
  const creePar = opts.creePar || null;

  const [ins] = await conn.query(
    `INSERT INTO onboarding
       (dossier_id, date_signature, date_fin_cible, statut,
        reprise_confrere, confrere_precedent, cree_par)
     VALUES (?, ?, ?, 'en_cours', ?, ?, ?)`,
    [dossierId, dateSignature, dateFinCible, repriseConfrere, confrerePrecedent, creePar]
  );
  return ins.insertId;
}

async function instancierEtapesOnboarding(onboardingId, dossier, connexion = null) {
  const conn = connexion || pool;

  const [[onb]] = await conn.query(
    `SELECT id, date_signature, reprise_confrere FROM onboarding WHERE id = ?`,
    [onboardingId]
  );
  if (!onb) return 0;

  const [modeles] = await conn.query(
    `SELECT code, delai_jours, \`condition\` FROM onboarding_etape_modele
      WHERE archive_le IS NULL AND actif = 1`
  );

  const dossierResolu = { ...dossier, profils: normaliserJson(dossier?.profils) || [] };
  const applicables = modeles.filter(m => {
    if (!m.condition) return true;
    const fn = CONDITIONS_APPLICABLES[m.condition];
    return fn ? fn(onb, dossierResolu) : false;
  });
  if (applicables.length === 0) return 0;

  const dateSignatureYmd = toYmd(onb.date_signature);
  const dateSignature = new Date(dateSignatureYmd + 'T00:00:00Z');

  const values = [];
  const params = [];
  for (const m of applicables) {
    const echeance = new Date(dateSignature.getTime());
    echeance.setUTCDate(echeance.getUTCDate() + m.delai_jours);
    values.push('(?, ?, ?, "N")');
    params.push(onboardingId, m.code, echeance.toISOString().slice(0, 10));
  }

  // INSERT IGNORE : à la RE-instanciation (dossier profils changés, ou
  // reprise_confrere révisé) on ajoute les nouvelles étapes applicables
  // sans jamais réécrire celles déjà présentes. Aucun statut ni horodatage
  // n'est touché, la piste probante est intacte.
  const [r] = await conn.query(
    `INSERT IGNORE INTO onboarding_etape (onboarding_id, code_modele, date_echeance, statut)
     VALUES ${values.join(',')}`,
    params
  );
  return r.affectedRows;
}

module.exports = { creerOnboardingSiBesoin, instancierEtapesOnboarding };
