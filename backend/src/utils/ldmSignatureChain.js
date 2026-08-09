'use strict';
/**
 * Chaîne d'automatisation post-signature LDM.
 *
 * Appelée depuis les 3 points d'entrée signature :
 *   - POST /api/lettres-mission/:id/signer         (CRM manuel)
 *   - POST /api/portal/sign/ldm/:id                (portail client)
 *   - PUT  /api/lettres-mission/:id (statut=signee)(mise à jour manuelle)
 *   - Yousign webhook (le cas échéant)
 *
 * Effets (tous idempotents, tous non-bloquants pour la signature) :
 *   1. plan_facturation : ligne créée à partir des vraies valeurs LDM
 *      (periodicite_facturation, jour_prelevement, date_premiere_facture).
 *      Si un plan existe déjà (même lettreMissionId) → skip + log.
 *   2. Mandat SEPA (si mode_reglement='prelevement') :
 *      - RUM déterministe : `PARFI-{ldm.numero}` — UNIQUE en base ⇒ upsert.
 *      - ICS depuis parametres_cabinet.
 *      - IBAN/BIC depuis comptes_bancaires (Powens) si connu.
 *      - Statut = 'en_attente_rib' si IBAN inconnu, 'actif' sinon.
 *   3. Notifications au collaborateur affecté :
 *      - "LDM signée — plan de facturation créé"
 *      - "RIB à collecter" si mandat créé sans IBAN.
 *   4. Journalise chaque étape dans automation_logs.
 *
 * TOUTE ERREUR est capturée : la signature elle-même n'est JAMAIS bloquée.
 * Le retour permet à l'appelant de savoir ce qui a été fait.
 */

const pool = require('../config/db');

async function logAuto(conn, ldmId, event, statut, message) {
  try {
    await conn.query(
      `INSERT INTO automation_logs (ruleId, evenement, entityType, entityId, statut, message)
       VALUES (NULL, ?, 'lettre_mission', ?, ?, ?)`,
      [event, ldmId, statut, message]
    );
  } catch (_) { /* automation_logs schema tolerant */ }
}

async function notifierUtilisateur(userId, type, titre, message, lien) {
  if (!userId) return;
  try {
    await pool.query(
      `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
       VALUES (?,?,?,?,?,0)`,
      [userId, type, titre, message, lien || null]
    );
  } catch (e) {
    console.error('[signatureChain] notif:', e.message);
  }
}

/**
 * Calcule les échéances mensuelles/trimestrielles/etc.
 * Retourne un tableau d'objets { date: 'YYYY-MM-DD' }.
 */
function calculerEcheances(periodicite, jourPrelevement, dateEffet) {
  const nb  = { mensuelle: 12, trimestrielle: 4, semestrielle: 2, annuelle: 1 }[periodicite] || 12;
  const pas = { mensuelle: 1,  trimestrielle: 3, semestrielle: 6, annuelle: 12 }[periodicite] || 1;
  const jour = Math.max(1, Math.min(28, Number(jourPrelevement) || 5));
  const start = new Date(dateEffet);
  let cursor = new Date(start.getFullYear(), start.getMonth(), jour);
  if (cursor < start) cursor = new Date(start.getFullYear(), start.getMonth() + 1, jour);
  const res = [];
  for (let i = 0; i < nb; i++) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() + i * pas, jour);
    res.push({ date: d.toISOString().slice(0, 10) });
  }
  return res;
}

/**
 * Point d'entrée principal.
 * @param {number} ldmId
 * @param {number|null} acteurId
 * @param {object} [opts]
 * @param {string} [opts.iban]  IBAN saisi à la signature (portail ou modale CRM).
 *                              Si fourni ET valide → mandat statut 'actif'.
 *                              Si absent → fallback comptes_bancaires puis 'en_attente_rib'.
 * @param {string} [opts.bic]   BIC saisi à la signature (optionnel).
 * @returns {Promise<object>} rapport structuré : { ok, plan: {created,skipped}, mandat: {…}, errors }
 */
async function executerChainePostSignature(ldmId, acteurId, opts = {}) {
  const rapport = {
    ok: true,
    plan:   { created: false, skipped: false, id: null },
    mandat: { created: false, skipped: false, id: null, statut: null, rum: null },
    notifications: 0,
    errors: [],
  };
  const conn = await pool.getConnection();
  try {
    // ── Chargement LDM avec toutes les colonnes plan de facturation ──────────
    const [[ldm]] = await conn.query(
      `SELECT l.*, c.nom AS client_nom
       FROM lettres_mission l LEFT JOIN clients c ON c.id = l.client_id
       WHERE l.id = ?`, [ldmId]
    );
    if (!ldm) {
      rapport.ok = false;
      rapport.errors.push('LDM introuvable');
      return rapport;
    }

    const collaborateurId = ldm.collaborateur_id || ldm.intervenantId || null;
    const clientId = ldm.client_id || null;
    const periodicite = ldm.periodicite_facturation || ldm.modaliteFacturation || 'mensuelle';
    const jourPrelevement = ldm.jour_prelevement || 5;
    const dateEffet = ldm.dateDebut || ldm.date_premiere_facture || new Date();
    const modeReglement = ldm.mode_reglement || 'prelevement';
    const montantHT = Number(ldm.montantHonorairesHT || 0);

    // ── 1. plan_facturation ─────────────────────────────────────────────────
    try {
      const [[existant]] = await conn.query(
        'SELECT id FROM plan_facturation WHERE lettreMissionId = ? LIMIT 1',
        [ldmId]
      );
      if (existant) {
        rapport.plan.skipped = true;
        rapport.plan.id = existant.id;
        await logAuto(conn, ldmId, 'signature_plan', 'skipped', `Plan existant #${existant.id}`);
      } else {
        const echeances = calculerEcheances(periodicite, jourPrelevement, dateEffet);
        const dateDebut = ldm.date_premiere_facture || (echeances[0] ? echeances[0].date : null);
        const [ins] = await conn.query(
          `INSERT INTO plan_facturation
             (lettreMissionId, client_id, frequence, montantHT, tauxTVA, dateDebut, echeances, statut)
           VALUES (?,?,?,?,20,?,?,'actif')`,
          [ldmId, clientId, periodicite, montantHT, dateDebut, JSON.stringify(echeances)]
        );
        rapport.plan.created = true;
        rapport.plan.id = ins.insertId;
        await logAuto(conn, ldmId, 'signature_plan', 'success',
          `Plan #${ins.insertId} créé (${periodicite}, ${echeances.length} échéances)`);
      }
    } catch (e) {
      rapport.errors.push(`plan: ${e.message}`);
      await logAuto(conn, ldmId, 'signature_plan', 'error', e.message);
    }

    // ── 2. Mandat SEPA ──────────────────────────────────────────────────────
    // Le mandat SEPA reste créé à la signature LDM pour permettre la collecte
    // immédiate du RIB. Depuis le chantier G, il est rattaché à l'onboarding
    // du dossier (annexe opérationnelle), plus à la LDM (relation contractuelle).
    // ldm_id reste renseigné le temps que le workflow onboarding soit exercé
    // en UI ; l'onboarding_id est résolu ci-dessous via lm.client_id → dossier.
    if (modeReglement === 'prelevement') {
      try {
        const [[cabinet]] = await conn.query('SELECT ics FROM parametres_cabinet LIMIT 1').catch(() => [[null]]);
        const ics = cabinet?.ics || null;

        // Résolution onboarding_id : l'onboarding peut ne pas encore exister
        // (creerOnboardingSiBesoin est appelé plus loin dans transitionner).
        // On tolère NULL — un job de rattachement (ou l'UI onboarding) pourra
        // lier plus tard. Priorité au dossier du client.
        const [[dossierRow]] = clientId
          ? await conn.query(`SELECT id FROM dossier WHERE client_id = ? LIMIT 1`, [clientId])
              .catch(() => [[null]])
          : [[null]];
        const [[onbRow]] = dossierRow?.id
          ? await conn.query(`SELECT id FROM onboarding WHERE dossier_id = ? LIMIT 1`, [dossierRow.id])
              .catch(() => [[null]])
          : [[null]];
        const onboardingId = onbRow?.id || null;

        let iban = null, bic = null;
        // 1) Priorité à l'IBAN saisi à la signature (portail ou modale CRM).
        if (opts.iban) {
          const cleanIban = String(opts.iban).replace(/\s+/g, '').toUpperCase();
          if (validerIban(cleanIban)) {
            iban = cleanIban;
            bic = opts.bic ? String(opts.bic).replace(/\s+/g, '').toUpperCase() : null;
          }
        }
        // 2) Fallback : IBAN déjà connu en base (Powens).
        if (!iban && clientId) {
          const [[cpt]] = await conn.query(
            `SELECT iban FROM comptes_bancaires WHERE client_id = ? AND actif = 1 LIMIT 1`,
            [clientId]
          ).catch(() => [[null]]);
          if (cpt?.iban) iban = cpt.iban;
        }
        const statutMandat = iban ? 'actif' : 'en_attente_rib';
        const rum = `PARFI-${ldm.numero}`;

        // Upsert : si opts.iban a été fourni ET validé (donc iban non nul ici),
        // on écrase iban/bic/statut pour "activer" un mandat resté en_attente_rib.
        // Sinon on ne touche pas aux colonnes iban/bic/statut existantes.
        const forceIban = !!opts.iban && !!iban;
        const [ins] = await conn.query(
          `INSERT INTO mandats
             (ldm_id, onboarding_id, client_id, type, libelle, rum, ics, iban, bic, statut, signe)
           VALUES (?,?,?,?,?,?,?,?,?,?,0)
           ON DUPLICATE KEY UPDATE
             ldm_id        = VALUES(ldm_id),
             onboarding_id = COALESCE(onboarding_id, VALUES(onboarding_id)),
             client_id     = COALESCE(client_id, VALUES(client_id)),
             ics           = COALESCE(ics, VALUES(ics)),
             iban          = IF(?, VALUES(iban), iban),
             bic           = IF(?, COALESCE(VALUES(bic), bic), bic),
             statut        = IF(?, VALUES(statut), statut)`,
          [ldmId, onboardingId, clientId, 'prelevement', 'Mandat de prélèvement SEPA',
           rum, ics, iban, bic, statutMandat,
           forceIban ? 1 : 0, forceIban ? 1 : 0, forceIban ? 1 : 0]
        );

        // Récupérer l'id + statut effectifs (upsert peut renvoyer id ancien)
        const [[m]] = await conn.query('SELECT id, statut FROM mandats WHERE rum = ?', [rum]);
        const nouveau = ins.affectedRows === 1 && ins.insertId === m.id;

        rapport.mandat.id = m.id;
        rapport.mandat.rum = rum;
        rapport.mandat.statut = m.statut;
        if (nouveau) {
          rapport.mandat.created = true;
          await logAuto(conn, ldmId, 'signature_mandat_sepa', 'success',
            `Mandat #${m.id} créé (RUM ${rum}, statut ${m.statut})`);
        } else {
          rapport.mandat.skipped = true;
          await logAuto(conn, ldmId, 'signature_mandat_sepa', 'skipped',
            `Mandat existant #${m.id} (RUM ${rum})`);
        }
      } catch (e) {
        rapport.errors.push(`mandat: ${e.message}`);
        await logAuto(conn, ldmId, 'signature_mandat_sepa', 'error', e.message);
      }
    }

    // ── 3. Notifications collaborateur ──────────────────────────────────────
    try {
      if (rapport.plan.created && collaborateurId) {
        await notifierUtilisateur(collaborateurId,
          'ldm_plan_facturation',
          `Plan de facturation créé — ${ldm.numero}`,
          `Le plan de facturation de la LDM ${ldm.numero} (${periodicite}) a été créé automatiquement à la signature.`,
          `/lettres-mission/${ldmId}`);
        rapport.notifications++;
      }
      if (rapport.mandat.statut === 'en_attente_rib' && rapport.mandat.created && collaborateurId) {
        await notifierUtilisateur(collaborateurId,
          'mandat_rib_manquant',
          `RIB à collecter — ${ldm.client_nom || 'client'}`,
          `Le mandat SEPA ${rapport.mandat.rum} est créé mais l'IBAN du client est inconnu. Merci de le collecter.`,
          clientId ? `/clients/${clientId}` : null);
        rapport.notifications++;
      }
    } catch (e) {
      rapport.errors.push(`notifications: ${e.message}`);
    }

    return rapport;
  } catch (fatal) {
    // Erreur inattendue : log + retour, ne relance JAMAIS
    console.error('[signatureChain] fatal:', fatal.message);
    rapport.ok = false;
    rapport.errors.push(fatal.message);
    try { await logAuto(conn, ldmId, 'signature_chain', 'error', fatal.message); } catch {}
    return rapport;
  } finally {
    conn.release();
  }
}

/**
 * Validation IBAN par clé de contrôle (mod 97).
 * Retourne true si valide, false sinon.
 */
function validerIban(iban) {
  if (!iban) return false;
  const clean = String(iban).replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{15,34}$/.test(clean)) return false;
  // Déplace les 4 premiers caractères à la fin, convertit lettres → chiffres
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let numeric = '';
  for (const c of rearranged) {
    numeric += /[A-Z]/.test(c) ? (c.charCodeAt(0) - 55).toString() : c;
  }
  // Calcul mod 97 par morceaux (nombre trop grand pour Number)
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}

module.exports = {
  executerChainePostSignature,
  validerIban,
  calculerEcheances,
};
