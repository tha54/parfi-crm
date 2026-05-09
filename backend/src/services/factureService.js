'use strict';
const pool = require('../config/db');
const { generateFacturXML, generateFacturePDF } = require('../utils/facturx');
const { sendEmail } = require('../utils/mailer');

// ─── Numérotation ────────────────────────────────────────────────────────────

async function nextNumeroBrouillon() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT numero FROM factures WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
    [`BR-${year}-%`]
  );
  const seq = rows.length ? parseInt(rows[0].numero.split('-').pop(), 10) + 1 : 1;
  return `BR-${year}-${String(seq).padStart(4, '0')}`;
}

async function nextNumeroFiscal() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT numero_fiscal FROM factures WHERE numero_fiscal LIKE ? ORDER BY id DESC LIMIT 1`,
    [`FACT-${year}-%`]
  );
  const seq = rows.length ? parseInt(rows[0].numero_fiscal.split('-').pop(), 10) + 1 : 1;
  return `FACT-${year}-${String(seq).padStart(4, '0')}`;
}

// ─── Jours ouvrés (France) ───────────────────────────────────────────────────

function calculerPaques(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

function joursFeries(y) {
  const paques = calculerPaques(y);
  const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return new Set([
    `${y}-01-01`, `${y}-05-01`, `${y}-05-08`, `${y}-07-14`,
    `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`,
    fmt(add(paques, 1)),   // Lundi de Pâques
    fmt(add(paques, 39)),  // Ascension
    fmt(add(paques, 50)),  // Lundi de Pentecôte
  ]);
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isFerie(d) {
  return joursFeries(d.getFullYear()).has(fmtDate(d));
}

function prochainJourOuvre(date) {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6 || isFerie(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// ─── Periodicité ─────────────────────────────────────────────────────────────

function normaliserPeriodicite(text) {
  if (!text) return 'mensuelle';
  const t = text.toLowerCase();
  if (t.includes('trim')) return 'trimestrielle';
  if (t.includes('semest')) return 'semestrielle';
  if (t.includes('an')) return 'annuelle';
  return 'mensuelle';
}

const PERIODICITE_MOIS  = { mensuelle: 1, trimestrielle: 3, semestrielle: 6, annuelle: 12 };
const PERIODICITE_COUNT = { mensuelle: 12, trimestrielle: 4, semestrielle: 2, annuelle: 1 };

// ─── Événements ──────────────────────────────────────────────────────────────

async function logEvenement(factureId, type, acteurId, description, opts = {}) {
  await pool.query(
    `INSERT INTO factures_evenements
       (facture_id, type, description, montant_avant, montant_apres, motif, acteur_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      factureId, type, description || null,
      opts.montantAvant ?? null, opts.montantApres ?? null,
      opts.motif || null, acteurId || null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
    ]
  );
}

// ─── Génération brouillons depuis LDM ────────────────────────────────────────

async function genererBrouillonsLDM(ldmId, acteurId) {
  const [[ldm]] = await pool.query('SELECT * FROM lettres_mission WHERE id = ?', [ldmId]);
  if (!ldm) throw Object.assign(new Error('LDM introuvable'), { status: 404 });
  if (ldm.statut !== 'active') throw Object.assign(new Error('LDM doit être active'), { status: 400 });

  // Don't regenerate if brouillons already exist for this LDM
  const [[existing]] = await pool.query(
    `SELECT COUNT(*) AS nb FROM factures WHERE lettre_mission_id = ? AND statut IN ('brouillon','vu')`,
    [ldmId]
  );
  if (Number(existing.nb) > 0) return { created: 0, ids: [], message: 'Brouillons déjà existants' };

  const [missions] = await pool.query('SELECT * FROM ldm_missions WHERE lettre_mission_id = ?', [ldmId]);

  const periodicite  = ldm.periodicite_facturation || normaliserPeriodicite(ldm.modaliteFacturation);
  const intervalMois = PERIODICITE_MOIS[periodicite];
  const nbPeriodes   = PERIODICITE_COUNT[periodicite];

  // Date de début : date_premiere_facture > dateDebut > mois en cours
  let debutMois;
  if (ldm.date_premiere_facture) {
    const d = new Date(ldm.date_premiere_facture);
    debutMois = new Date(d.getFullYear(), d.getMonth(), 1);
  } else if (ldm.dateDebut) {
    const d = new Date(ldm.dateDebut);
    debutMois = new Date(d.getFullYear(), d.getMonth(), 1);
  } else {
    const now = new Date();
    debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const [[cab]] = await pool.query('SELECT tauxTva FROM parametres_cabinet LIMIT 1').catch(() => [[{ tauxTva: 20 }]]);
  const tauxTva = Number(cab?.tauxTva || 20);

  // Montant total HT : depuis ldm_missions si disponibles, sinon montantHonorairesHT
  const montantTotalHT = missions.length
    ? missions.reduce((s, m) => s + Number(m.honoraires_ht), 0)
    : parseFloat(ldm.montantHonorairesHT || 0);

  if (montantTotalHT <= 0) return { created: 0, ids: [], message: 'Montant HT nul' };

  const createdIds = [];

  for (let i = 0; i < nbPeriodes; i++) {
    const moisDate = new Date(debutMois.getFullYear(), debutMois.getMonth() + i * intervalMois, 1);
    const datePrevue = prochainJourOuvre(new Date(moisDate));
    const moisStr = fmtDate(new Date(moisDate.getFullYear(), moisDate.getMonth(), 1));
    const datePrevStr = fmtDate(datePrevue);

    const totalHT = montantTotalHT / nbPeriodes;
    const totalTVA = totalHT * tauxTva / 100;
    const totalTTC = totalHT + totalTVA;

    const numero = await nextNumeroBrouillon();

    const [r] = await pool.query(
      `INSERT INTO factures
         (numero, client_id, contactId, type, statut,
          totalHT, tauxTVA, totalTVA, totalTTC,
          lettre_mission_id, collaborateur_referent_id,
          date_emission_prevue, mois_facturation)
       VALUES (?, ?, 0, 'recurrence', 'brouillon', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        numero, ldm.client_id, totalHT, tauxTva, totalTVA, totalTTC,
        ldmId, ldm.collaborateur_id || null, datePrevStr, moisStr,
      ]
    );
    const factureId = r.insertId;

    if (missions.length) {
      for (let j = 0; j < missions.length; j++) {
        const m = missions[j];
        const montant = Number(m.honoraires_ht) / nbPeriodes;
        await pool.query(
          `INSERT INTO lignes_facture
             (factureId, ordre, description, quantite, prixUnitaireHT, totalHT, mission_ldm_id)
           VALUES (?, ?, ?, 1, ?, ?, ?)`,
          [factureId, j, m.libelle, montant, montant, m.id]
        );
      }
    } else {
      await pool.query(
        `INSERT INTO lignes_facture (factureId, ordre, description, quantite, prixUnitaireHT, totalHT)
         VALUES (?, 0, ?, 1, ?, ?)`,
        [factureId, ldm.objetMission || ldm.typeMission || 'Honoraires', totalHT, totalHT]
      );
    }

    await logEvenement(factureId, 'creation', acteurId,
      `Brouillon généré depuis LDM ${ldm.numero} — ${periodicite}`,
      { metadata: { ldm_id: ldmId, mois: moisStr, periodicite } }
    );
    createdIds.push(factureId);
  }

  return { created: createdIds.length, ids: createdIds, periodicite };
}

// ─── Transitions d'état ───────────────────────────────────────────────────────

async function marquerVu(factureId, acteurId) {
  const [[f]] = await pool.query('SELECT * FROM factures WHERE id = ?', [factureId]);
  if (!f) throw Object.assign(new Error('Facture introuvable'), { status: 404 });
  if (f.statut !== 'brouillon') throw Object.assign(new Error(`Statut invalide: ${f.statut}`), { status: 400 });
  await pool.query(`UPDATE factures SET statut = 'vu' WHERE id = ?`, [factureId]);
  await logEvenement(factureId, 'vu', acteurId, 'Brouillon validé');
  return { id: factureId, statut: 'vu' };
}

async function emettre(factureId, acteurId, opts = {}) {
  const [[f]] = await pool.query(
    `SELECT f.*, c.id AS client_id_real, c.nom AS client_nom, c.siren AS client_siren, c.adresse AS client_adresse,
            COALESCE(c.email_dirigeant, c.portal_email) AS client_email, c.nom AS client_nom2
     FROM factures f LEFT JOIN clients c ON f.client_id = c.id WHERE f.id = ?`,
    [factureId]
  );
  if (!f) throw Object.assign(new Error('Facture introuvable'), { status: 404 });
  if (!['brouillon', 'vu'].includes(f.statut)) throw Object.assign(new Error(`Statut invalide: ${f.statut}`), { status: 400 });

  // Email effectif : email_override saisi à la volée, sinon email enregistré
  const emailEffectif = (opts.email_override || '').trim() || f.client_email || null;

  const numeroFiscal = await nextNumeroFiscal();
  const todayStr = fmtDate(new Date());

  await pool.query(
    `UPDATE factures SET statut = 'emise', numero_fiscal = ?,
       date_emission_effective = ?, dateEmission = NOW(), dateEcheance = ?
     WHERE id = ?`,
    [numeroFiscal, todayStr, todayStr, factureId]
  );
  await logEvenement(factureId, 'emission', acteurId, `Facture émise — ${numeroFiscal}`,
    { metadata: { numero_fiscal: numeroFiscal } });

  // Sauvegarder l'email sur la fiche client si demandé et pas déjà renseigné
  if (emailEffectif && opts.sauvegarder_email && !f.client_email && f.client_id_real) {
    await pool.query(
      `UPDATE clients SET email_dirigeant = ? WHERE id = ?`,
      [emailEffectif, f.client_id_real]
    ).catch(() => {});
  }

  // Génération PDF + envoi email
  let emailStatut = 'non_envoye';
  if (emailEffectif) {
    try {
      const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
      const cabinet = cab || {};
      const [lignes] = await pool.query('SELECT * FROM lignes_facture WHERE factureId = ? ORDER BY ordre', [factureId]);
      const fAvecNumero = { ...f, numero_fiscal: numeroFiscal, statut: 'emise' };
      const xml = generateFacturXML(fAvecNumero, cabinet, lignes);
      const pdfBuffer = await generateFacturePDF(fAvecNumero, cabinet, lignes, xml);

      const mois = f.mois_facturation
        ? new Date(f.mois_facturation).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

      await sendEmail({
        to: emailEffectif,
        toName: f.client_nom,
        subject: `Facture ${numeroFiscal} — ${mois}`,
        htmlContent: `<p>Bonjour,</p>
<p>Veuillez trouver ci-joint votre facture <strong>${numeroFiscal}</strong> pour la période ${mois}.</p>
<p>Montant TTC : <strong>${Number(f.totalTTC || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong></p>
<p>Cordialement,<br>${cabinet.nomCabinet || 'ParFi France'}</p>`,
        attachments: [{ filename: `facture-${numeroFiscal}.pdf`, base64: pdfBuffer.toString('base64') }],
      });

      emailStatut = 'envoye';
      await pool.query(`UPDATE factures SET statut = 'envoyee' WHERE id = ?`, [factureId]);
      await logEvenement(factureId, 'envoi', acteurId, `Facture envoyée par email à ${emailEffectif}`);
    } catch (emailErr) {
      console.error('Envoi email facture échoué:', emailErr.message);
      await logEvenement(factureId, 'erreur_envoi', acteurId, `Échec envoi email : ${emailErr.message}`);
    }
  }

  return {
    id: factureId,
    statut: emailStatut === 'envoye' ? 'envoyee' : 'emise',
    numero_fiscal: numeroFiscal,
    email_envoye: emailStatut === 'envoye',
    email_destinataire: emailEffectif,
  };
}

async function marquerPayee(factureId, acteurId) {
  const [[f]] = await pool.query('SELECT * FROM factures WHERE id = ?', [factureId]);
  if (!f) throw Object.assign(new Error('Facture introuvable'), { status: 404 });
  if (!['emise', 'envoyee', 'retard', 'partielle'].includes(f.statut)) {
    throw Object.assign(new Error(`Statut invalide: ${f.statut}`), { status: 400 });
  }
  await pool.query(
    `UPDATE factures SET statut = 'payee', datePaiement = NOW(), montantPaye = totalTTC WHERE id = ?`,
    [factureId]
  );
  await logEvenement(factureId, 'paiement', acteurId, 'Facture marquée payée');
  return { id: factureId, statut: 'payee' };
}

async function annuler(factureId, acteurId, motif) {
  const [[f]] = await pool.query('SELECT * FROM factures WHERE id = ?', [factureId]);
  if (!f) throw Object.assign(new Error('Facture introuvable'), { status: 404 });
  if (['payee', 'annulee'].includes(f.statut)) {
    throw Object.assign(new Error(`Impossible d'annuler une facture ${f.statut}`), { status: 400 });
  }
  await pool.query(`UPDATE factures SET statut = 'annulee' WHERE id = ?`, [factureId]);
  await logEvenement(factureId, 'annulation', acteurId, motif || 'Facture annulée', { motif });
  return { id: factureId, statut: 'annulee' };
}

async function modifierBrouillon(factureId, updates, acteurId) {
  const [[f]] = await pool.query('SELECT * FROM factures WHERE id = ?', [factureId]);
  if (!f) throw Object.assign(new Error('Facture introuvable'), { status: 404 });
  if (!['brouillon', 'vu'].includes(f.statut)) {
    throw Object.assign(new Error('Seuls les brouillons sont modifiables'), { status: 400 });
  }
  const montantChange = updates.totalHT !== undefined && Number(updates.totalHT) !== Number(f.totalHT);
  if (montantChange && !updates.motif_modification) {
    throw Object.assign(new Error('Un motif est requis pour modifier le montant'), { status: 400 });
  }
  const fields = [], values = [];
  for (const k of ['totalHT', 'tauxTVA', 'totalTVA', 'totalTTC', 'notesInternes', 'date_emission_prevue', 'motif_modification']) {
    if (updates[k] !== undefined) { fields.push(`${k} = ?`); values.push(updates[k]); }
  }
  if (!fields.length) return { id: factureId, message: 'Aucune modification' };
  // Rollback to brouillon if amount changed while 'vu'
  if (montantChange && f.statut === 'vu') fields.push(`statut = 'brouillon'`);
  values.push(factureId);
  await pool.query(`UPDATE factures SET ${fields.join(', ')} WHERE id = ?`, values);
  if (montantChange) {
    await logEvenement(factureId, 'modification', acteurId,
      `Montant modifié: ${f.totalHT} → ${updates.totalHT}`,
      { montantAvant: f.totalHT, montantApres: updates.totalHT, motif: updates.motif_modification }
    );
  }
  return { id: factureId, message: 'Brouillon mis à jour' };
}

// ─── Aide à la décision ───────────────────────────────────────────────────────

const TAUX_ROLE = { expert: 84, expert_comptable: 84, chef_mission: 58, chef_de_mission: 58, chef_de_groupe: 58, collaborateur: 40, collaborateur_social: 40, collaborateur_juridique: 40, assistant: 28 };

async function getAideDecision(factureId) {
  const [[f]] = await pool.query(
    `SELECT f.*, c.nom AS client_nom FROM factures f LEFT JOIN clients c ON f.client_id = c.id WHERE f.id = ?`,
    [factureId]
  );
  if (!f) throw Object.assign(new Error('Facture introuvable'), { status: 404 });

  const clientId = f.client_id;
  const moisDebut = f.mois_facturation
    ? new Date(f.mois_facturation)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const moisFin = new Date(moisDebut.getFullYear(), moisDebut.getMonth() + 1, 0);

  // Section A: temps passé vs budget LDM
  const [tachesTemps] = await pool.query(
    `SELECT t.titre, t.statut, t.temps_passe_minutes, t.budget_minutes,
            t.type_travail, u.role, u.role_metier, u.prenom, u.nom
     FROM taches t
     LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
     WHERE t.client_id = ?
       AND (t.date_echeance BETWEEN ? AND ?
            OR t.statut IN ('en_cours','a_faire'))`,
    [clientId, fmtDate(moisDebut), fmtDate(moisFin)]
  );

  let tempsTotalMinutes = 0;
  let valeurTotale = 0;
  for (const t of tachesTemps) {
    const roleKey = t.role_metier || t.role || 'collaborateur';
    const taux = TAUX_ROLE[roleKey] ?? TAUX_ROLE.collaborateur;
    const mins = Number(t.temps_passe_minutes || 0);
    tempsTotalMinutes += mins;
    valeurTotale += (mins / 60) * taux;
  }

  // Budget LDM pour la période
  let budgetLDM = 0;
  if (f.lettre_mission_id) {
    const [[ldm]] = await pool.query('SELECT modaliteFacturation FROM lettres_mission WHERE id = ?', [f.lettre_mission_id]);
    if (ldm) {
      const nbPeriodes = PERIODICITE_COUNT[normaliserPeriodicite(ldm.modaliteFacturation)];
      const [missions] = await pool.query('SELECT honoraires_ht FROM ldm_missions WHERE lettre_mission_id = ?', [f.lettre_mission_id]);
      budgetLDM = missions.reduce((s, m) => s + Number(m.honoraires_ht) / nbPeriodes, 0);
    }
  }
  const depassementPct = budgetLDM > 0 ? ((valeurTotale - budgetLDM) / budgetLDM) * 100 : null;

  // Section B: tâches hors-LDM en cours
  const [tachesHorsLDM] = await pool.query(
    `SELECT t.titre, t.statut, t.temps_passe_minutes, u.prenom, u.nom
     FROM taches t
     LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
     WHERE t.client_id = ? AND t.dimensionnement_ligne_id IS NULL AND t.statut != 'termine'`,
    [clientId]
  );

  // Section C: historique 6 mois
  const [historique] = await pool.query(
    `SELECT numero, numero_fiscal, statut, totalHT, mois_facturation,
            date_emission_effective, datePaiement
     FROM factures
     WHERE client_id = ? AND mois_facturation IS NOT NULL
     ORDER BY mois_facturation DESC LIMIT 6`,
    [clientId]
  );

  return {
    facture: { id: f.id, numero: f.numero, client_nom: f.client_nom, mois: f.mois_facturation, totalHT: f.totalHT },
    sectionA: {
      label: 'Temps passé ce mois',
      tempsTotalMinutes,
      valeurTotale:    Math.round(valeurTotale * 100) / 100,
      budgetLDM:       Math.round(budgetLDM * 100) / 100,
      depassementPct:  depassementPct !== null ? Math.round(depassementPct * 10) / 10 : null,
      taches: tachesTemps,
    },
    sectionB: { label: 'Tâches hors-LDM', taches: tachesHorsLDM },
    sectionC: { label: 'Historique 6 mois', historique },
  };
}

// ─── Dépassements budget cabinet ─────────────────────────────────────────────

async function getDepassements(seuilPct = 20) {
  const [ldmsActives] = await pool.query(
    `SELECT lm.id AS ldm_id, lm.client_id, c.nom AS client_nom,
            lm.numero AS ldm_numero, lm.modaliteFacturation
     FROM lettres_mission lm
     JOIN clients c ON c.id = lm.client_id
     WHERE lm.statut = 'active' AND lm.client_id IS NOT NULL`
  );

  const now = new Date();
  // Compare against last full month
  const moisDebut = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const moisFin   = new Date(now.getFullYear(), now.getMonth(), 0);

  const results = [];
  for (const ldm of ldmsActives) {
    const periodicite = normaliserPeriodicite(ldm.modaliteFacturation);
    const nbPeriodes  = PERIODICITE_COUNT[periodicite];
    const [missions] = await pool.query('SELECT honoraires_ht FROM ldm_missions WHERE lettre_mission_id = ?', [ldm.ldm_id]);
    const budgetMois = missions.reduce((s, m) => s + Number(m.honoraires_ht) / nbPeriodes, 0);
    if (budgetMois === 0) continue;

    const [taches] = await pool.query(
      `SELECT t.temps_passe_minutes, u.role, u.role_metier
       FROM taches t
       LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
       WHERE t.client_id = ? AND t.date_echeance BETWEEN ? AND ?`,
      [ldm.client_id, fmtDate(moisDebut), fmtDate(moisFin)]
    );

    let valeur = 0;
    for (const t of taches) {
      const k = t.role_metier || t.role || 'collaborateur';
      valeur += (Number(t.temps_passe_minutes || 0) / 60) * (TAUX_ROLE[k] ?? TAUX_ROLE.collaborateur);
    }

    const pct = ((valeur - budgetMois) / budgetMois) * 100;
    if (pct >= seuilPct) {
      results.push({
        client_id: ldm.client_id, client_nom: ldm.client_nom,
        ldm_id: ldm.ldm_id, ldm_numero: ldm.ldm_numero,
        budgetMois:    Math.round(budgetMois * 100) / 100,
        valeurReelle:  Math.round(valeur * 100) / 100,
        depassementPct: Math.round(pct * 10) / 10,
      });
    }
  }

  return results.sort((a, b) => b.depassementPct - a.depassementPct);
}

module.exports = {
  nextNumeroBrouillon, nextNumeroFiscal,
  prochainJourOuvre, normaliserPeriodicite,
  logEvenement, genererBrouillonsLDM,
  marquerVu, emettre, marquerPayee, annuler, modifierBrouillon,
  getAideDecision, getDepassements,
};
