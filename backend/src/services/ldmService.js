'use strict';
/**
 * LDM Service — génération depuis devis + machine à états 6 statuts
 *
 * Workflow :
 *   BROUILLON → A_VALIDER → VALIDEE_INTERNE → ENVOYEE → SIGNEE → ACTIVE
 *                    ↕ rollback               ↕                    ↓
 *               BROUILLON ←─────────────────────          RESILIEE / ECHUE
 *   Depuis brouillon/a_valider/validee_interne/envoyee → ANNULEE (déverrouille devis)
 *
 * Rôles (R10) :
 *   expert       → toutes les transitions
 *   chef_mission → brouillon→a_valider, rollback, envoyee→signee, signee→active, active→echue
 *   collaborateur → brouillon→a_valider uniquement
 */

const pool = require('../config/db');

// ── Lignes-types du tableau de répartition par mission ────────────────────────
const LIGNES_TRONC_COMMUN = [
  { ligne_code: 'TC-01', libelle: 'Remise des pièces justificatives (factures, relevés)',    cabinet: false, client: true,  autres: false, periodicite: 'Mensuel'    },
  { ligne_code: 'TC-02', libelle: 'Conservation des originaux',                               cabinet: false, client: true,  autres: false, periodicite: 'Permanent'  },
  { ligne_code: 'TC-03', libelle: "Réponse aux demandes d'information du cabinet",            cabinet: false, client: true,  autres: false, periodicite: 'Selon besoin' },
];
const LIGNES_PAR_MISSION = {
  tenue_comptable: [
    { ligne_code: 'TEN-01', libelle: 'Saisie des opérations comptables',                     cabinet: true,  client: false, autres: false, periodicite: 'Mensuel'    },
    { ligne_code: 'TEN-02', libelle: 'Rapprochement bancaire',                               cabinet: true,  client: false, autres: false, periodicite: 'Mensuel'    },
    { ligne_code: 'TEN-03', libelle: 'Lettrage des comptes tiers',                           cabinet: true,  client: false, autres: false, periodicite: 'Mensuel'    },
    { ligne_code: 'TEN-04', libelle: 'Suivi des immobilisations',                            cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'TEN-05', libelle: 'Déclarations de TVA',                                  cabinet: true,  client: false, autres: false, periodicite: 'Selon régime' },
    { ligne_code: 'TEN-06', libelle: 'Pointage et validation des soldes',                    cabinet: true,  client: true,  autres: false, periodicite: 'Trimestriel' },
  ],
  revision: [
    { ligne_code: 'REV-01', libelle: 'Travaux de révision des comptes',                      cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'REV-02', libelle: 'Établissement de la liasse fiscale',                   cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'REV-03', libelle: 'Établissement des comptes annuels (bilan, CR, annexe)',cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'REV-04', libelle: 'Présentation et remise des comptes',                   cabinet: true,  client: true,  autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'REV-05', libelle: "Approbation des comptes (AG annuelle)",                cabinet: false, client: true,  autres: false, periodicite: 'Annuel'     },
  ],
  etablissement_comptes: [
    { ligne_code: 'REV-01', libelle: 'Travaux de révision des comptes',                      cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'REV-02', libelle: 'Établissement de la liasse fiscale',                   cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'REV-03', libelle: 'Établissement des comptes annuels (bilan, CR, annexe)',cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'REV-04', libelle: 'Présentation et remise des comptes',                   cabinet: true,  client: true,  autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'REV-05', libelle: "Approbation des comptes (AG annuelle)",                cabinet: false, client: true,  autres: false, periodicite: 'Annuel'     },
  ],
  fiscal: [
    { ligne_code: 'FIS-01', libelle: 'Déclaration de résultat (IS / BIC / BNC)',             cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'FIS-02', libelle: "Calcul et suivi des acomptes d'impôt",                 cabinet: true,  client: false, autres: false, periodicite: 'Trimestriel' },
    { ligne_code: 'FIS-03', libelle: 'Déclaration CVAE / CFE',                               cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'FIS-04', libelle: 'Règlement des échéances fiscales',                     cabinet: false, client: true,  autres: false, periodicite: "Selon échéancier" },
  ],
  social_paie: [
    { ligne_code: 'SOC-01', libelle: 'Établissement des bulletins de paie',                  cabinet: true,  client: false, autres: false, periodicite: 'Mensuel'    },
    { ligne_code: 'SOC-02', libelle: 'Déclaration sociale nominative (DSN)',                  cabinet: true,  client: false, autres: false, periodicite: 'Mensuel'    },
    { ligne_code: 'SOC-03', libelle: "Déclaration préalable à l'embauche (DPAE)",            cabinet: false, client: true,  autres: false, periodicite: "À l'embauche" },
    { ligne_code: 'SOC-04', libelle: 'Solde de tout compte et documents de fin de contrat',  cabinet: true,  client: false, autres: false, periodicite: 'À la rupture' },
    { ligne_code: 'SOC-05', libelle: 'Règlement des cotisations sociales',                   cabinet: false, client: true,  autres: false, periodicite: 'Mensuel'    },
  ],
  juridique: [
    { ligne_code: 'JUR-01', libelle: "Préparation du procès-verbal d'AG annuelle",           cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'JUR-02', libelle: 'Dépôt des comptes au greffe',                          cabinet: true,  client: false, autres: false, periodicite: 'Annuel'     },
    { ligne_code: 'JUR-03', libelle: 'Décisions de gestion courante (dividendes, etc.)',      cabinet: true,  client: true,  autres: false, periodicite: 'Selon besoin' },
    { ligne_code: 'JUR-04', libelle: 'Modifications statutaires',                            cabinet: false, client: true,  autres: false, periodicite: 'Selon besoin' },
  ],
};

// Mapping section lignes_devis → type_mission lettres_mission
const SECTION_TO_TYPE = {
  comptabilite:       'tenue_comptable',
  tenue:              'tenue_comptable',
  tenue_comptable:    'tenue_comptable',
  revision:           'revision',
  'établissement':    'etablissement_comptes',
  etablissement:      'etablissement_comptes',
  fiscal:             'fiscal',
  fiscalite:          'fiscal',
  'fiscalité':        'fiscal',
  social:             'social_paie',
  paie:               'social_paie',
  social_paie:        'social_paie',
  juridique:          'juridique',
  conseil:            'conseil',
};

// Anciens INTERVENANT_TO_PROFIL et TAUX_PAR_PROFIL supprimés par le
// chantier F (refonte dimensionnement). Le budget est désormais porté par
// budget_ligne, avec grade = junior|medior|senior|chef_mission|expert_comptable
// et taux dérivé de taux_grade au moment de la création (figé ensuite).
// buildMissionsFromLignes ne calcule plus de profils : les missions sont
// créées vides côté budget, la saisie se fait via l'écran ou via
// production/budget.js#creerLigne.

// Mapping conservé pour compat historique (référencé dans le grep ci-dessous)
// mais ne sert plus à la construction du INSERT ldm_missions.
const INTERVENANT_TO_PROFIL = {
  'Expert-comptable': 'expert',
  'Chef de groupe':   'expert',
  'Chef de mission':  'chef_mission',
  'Collaborateur Senior': 'collaborateur',
  'Collaborateur':    'collaborateur',
  'Collaborateur Junior': 'assistant',
  'Collaborateur Social': 'assistant',
  'Collaborateur Juridique': 'collaborateur',
  'Juriste':          'collaborateur',
};

// ── Matrice des transitions autorisées ───────────────────────────────────────
const TRANSITIONS = {
  soumettre:          { depuis: ['brouillon'],                          vers: 'a_valider',        roles: ['expert','chef_mission','collaborateur'] },
  valider_interne:    { depuis: ['a_valider'],                          vers: 'validee_interne',  roles: ['expert'] },
  envoyer:            { depuis: ['validee_interne'],                    vers: 'envoyee',           roles: ['expert'] },
  signer:             { depuis: ['envoyee'],                            vers: 'signee',            roles: ['expert','chef_mission'] },
  activer:            { depuis: ['signee'],                             vers: 'active',            roles: ['expert','chef_mission'] },
  resilier:           { depuis: ['active'],                             vers: 'resiliee',          roles: ['expert'] },
  echoir:             { depuis: ['active'],                             vers: 'echue',             roles: ['expert','chef_mission'] },
  annuler:            { depuis: ['brouillon','a_valider','validee_interne','envoyee'], vers: 'annulee', roles: ['expert'] },
  rollback:           { depuis: ['a_valider','validee_interne','envoyee'], vers: 'brouillon',     roles: ['expert','chef_mission'] },
};

// ── Prochain numéro LDM-AAAA-NNNN ────────────────────────────────────────────
async function nextNumeroLDM() {
  const year = new Date().getFullYear();
  const [[row]] = await pool.query(
    `SELECT numero FROM lettres_mission WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
    [`LDM-${year}-%`]
  );
  const seq = row ? parseInt(row.numero.split('-')[2], 10) + 1 : 1;
  return `LDM-${year}-${String(seq).padStart(4, '0')}`;
}

// ── Snapshot client ────────────────────────────────────────────────────────────
async function buildSnapshotClient(clientId, prospectId) {
  if (clientId) {
    const [[c]] = await pool.query(
      `SELECT id, nom, siren, adresse, code_postal, ville, forme_juridique,
              email_dirigeant, telephone_dirigeant, portal_email, capital
       FROM clients WHERE id = ?`, [clientId]
    );
    if (c) return {
      type: 'client', id: c.id, nom: c.nom, siren: c.siren || '',
      adresse: c.adresse || '', codePostal: c.code_postal || '', ville: c.ville || '',
      formeJuridique: c.forme_juridique || '', capital: c.capital || null,
      email: c.email_dirigeant || c.portal_email || '',
      telephone: c.telephone_dirigeant || '',
    };
  }
  if (prospectId) {
    const [[p]] = await pool.query(
      `SELECT id, nom, siren, adresse, code_postal, ville, forme_juridique,
              contact_email, email, telephone, contact_prenom, contact_nom
       FROM prospects WHERE id = ?`, [prospectId]
    );
    if (p) return {
      type: 'prospect', id: p.id, nom: p.nom, siren: p.siren || '',
      adresse: p.adresse || '', codePostal: p.code_postal || '', ville: p.ville || '',
      formeJuridique: p.forme_juridique || '', capital: null,
      email: p.contact_email || p.email || '',
      telephone: p.telephone || '',
      contactPrenom: p.contact_prenom || '', contactNom: p.contact_nom || '',
    };
  }
  return null;
}

// ── Snapshot cabinet depuis parametres_cabinet ────────────────────────────────
async function buildSnapshotCabinet() {
  const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
  const c = cab || {};
  return {
    nom:              c.nomCabinet || 'ParFi France',
    siren:            c.siren || '[SIREN à compléter]',
    formeJuridique:   c.formeJuridique || 'SAS',
    adresse:          c.adresse || '5 Place Langrand',
    codePostal:       c.codePostal || '54400',
    ville:            c.ville || 'Longwy',
    telephone:        c.telephone || '',
    email:            c.email || 'thierry.alcaraz@parfi-france.fr',
    siteWeb:          c.siteWeb || 'www.parfi-france.fr',
    numeroOrdre:      c.numeroOrdre || c.numero_inscription_oec || '[N° OEC à compléter]',
    conseilRegionalOEC: c.conseil_regional_oec || 'Grand Est',
    tribunalCompetent:  c.tribunal_competent || 'Tribunal de commerce de Briey',
    rcProfessionnelle:  c.rc_professionnelle || null,
    sousTraitantsRGPD:  c.sous_traitants_rgpd || [],
    outilsProduction:   c.outils_production || [],
  };
}

// ── Construire tableau de répartition selon missions détectées ────────────────
function buildTableauRepartition(typeMissions) {
  const seen = new Set();
  const lignes = [...LIGNES_TRONC_COMMUN];
  for (const type of typeMissions) {
    const missLignes = LIGNES_PAR_MISSION[type] || [];
    for (const l of missLignes) {
      if (!seen.has(l.ligne_code)) {
        seen.add(l.ligne_code);
        lignes.push(l);
      }
    }
  }
  return lignes;
}

// ── Construire ldm_missions depuis lignes_devis ────────────────────────────────
function buildMissionsFromLignes(lignesDevis, datePriseEffet) {
  // Grouper par section → type_mission
  const grouped = {};
  for (const l of lignesDevis) {
    if (!l.actif && l.actif !== undefined) continue;
    const section = (l.section || l.rubrique || '').toLowerCase().trim();
    const type = SECTION_TO_TYPE[section] || 'tenue_comptable';
    if (!grouped[type]) grouped[type] = { lignes: [], libelles: new Set() };
    grouped[type].lignes.push(l);
    if (l.libelle || l.description) grouped[type].libelles.add(l.libelle || l.description);
  }

  const missions = [];
  let ordre = 0;
  for (const [type, { lignes, libelles }] of Object.entries(grouped)) {
    // Somme honoraires depuis les lignes du devis. Les profils JSON ne sont
    // plus renseignés (colonnes supprimées, chantier F) — le vrai budget par
    // grade viendra via budget_ligne.
    let honorairesHT = 0;
    for (const l of lignes) {
      honorairesHT += parseFloat(l.tarif_ht || l.totalHT || 0);
    }
    missions.push({
      type_mission: type,
      libelle: Array.from(libelles).slice(0, 3).join(', ') || type.replace(/_/g, ' '),
      honoraires_ht: Math.round(honorairesHT * 100) / 100,
      date_debut: datePriseEffet || new Date().toISOString().split('T')[0],
      date_fin: null,
      ordre: ordre++,
    });
  }
  return missions;
}

// ── Audit ─────────────────────────────────────────────────────────────────────
async function logEvenement(ldmId, type, acteurId, acteurNom, statutAvant, statutApres, commentaire, metadata) {
  await pool.query(
    `INSERT INTO ldm_evenements
       (ldm_id, type, acteur_id, acteur_nom, statut_avant, statut_apres, commentaire, metadata)
     VALUES (?,?,?,?,?,?,?,?)`,
    [ldmId, type, acteurId || null, acteurNom || null,
     statutAvant || null, statutApres || null, commentaire || null,
     metadata ? JSON.stringify(metadata) : null]
  ).catch(e => console.error('[ldm_evenements]', e.message));
}

// ── Retrouver l'opportunité liée à une LDM ───────────────────────────────────
async function findOpportuniteForLdm(devisId, clientId, prospectId) {
  if (devisId) {
    const [[d]] = await pool.query('SELECT opportunite_id FROM devis WHERE id = ?', [devisId]);
    if (d?.opportunite_id) {
      const [[opp]] = await pool.query(
        `SELECT id FROM opportunites WHERE id = ? AND statut NOT IN ('gagne','perdu') LIMIT 1`,
        [d.opportunite_id]
      );
      if (opp) return opp.id;
    }
  }
  if (clientId) {
    const [[opp]] = await pool.query(
      `SELECT id FROM opportunites WHERE client_id = ? AND statut NOT IN ('gagne','perdu') ORDER BY updatedAt DESC LIMIT 1`,
      [clientId]
    );
    if (opp) return opp.id;
  }
  if (prospectId) {
    const [[opp]] = await pool.query(
      `SELECT id FROM opportunites WHERE prospect_id = ? AND statut NOT IN ('gagne','perdu') ORDER BY updatedAt DESC LIMIT 1`,
      [prospectId]
    );
    if (opp) return opp.id;
  }
  return null;
}

// ── GÉNÉRATION DEPUIS DEVIS (idempotente) ─────────────────────────────────────
async function genererDepuisDevis(devisId, acteurId, acteurNom) {
  const [[devis]] = await pool.query(
    `SELECT d.*, COALESCE(c.nom, p.nom) AS display_nom
     FROM devis d
     LEFT JOIN clients c ON d.client_id = c.id
     LEFT JOIN prospects p ON d.prospect_id = p.id
     WHERE d.id = ?`, [devisId]
  );
  if (!devis) throw Object.assign(new Error('Devis introuvable'), { status: 404 });
  if (devis.statut !== 'accepte') {
    throw Object.assign(
      new Error(`Le devis doit être en statut "accepté" (actuel : ${devis.statut})`),
      { status: 400 }
    );
  }

  // Idempotence
  const [[existing]] = await pool.query(
    `SELECT id, numero, statut FROM lettres_mission WHERE devis_id = ? LIMIT 1`, [devisId]
  );
  if (existing) return { ldm: existing, created: false };

  // La conversion prospect → client est reportée à la SIGNATURE de la LDM
  // (voir promouvoirProspectSiBesoin appelé dans le hook 'signer' de
  // transitionner). Règle métier : un prospect ne devient client qu'à la
  // signature d'une lettre de mission — pas à la simple acceptation d'un
  // devis, qui n'engage pas encore contractuellement. Chemin unique.
  // La LDM en brouillon est donc créée avec (client_id=null, prospect_id=X)
  // ; les deux colonnes seront réalignées à la signature.

  // Snapshots
  const snapshotClient  = await buildSnapshotClient(devis.client_id, devis.prospect_id);
  const snapshotCabinet = await buildSnapshotCabinet();

  // Numéro + montants
  const numero  = await nextNumeroLDM();
  const montant = parseFloat(devis.total_ht_net || devis.totalHT || 0);

  // Lignes devis pour missions + tableau repartition
  const [lignesDevis] = await pool.query(
    'SELECT * FROM lignes_devis WHERE devisId = ? AND actif = 1', [devisId]
  ).catch(() => [[]]);

  // Type mission dominant (pour champ typeMission existant)
  const sections = lignesDevis.map(r => (r.section || '').toLowerCase());
  let typeMission = 'tenue_comptable';
  if (sections.includes('social') || sections.includes('paie'))    typeMission = 'social_paie';
  else if (sections.includes('fiscal') || sections.includes('fiscalité')) typeMission = 'fiscal';
  else if (sections.includes('juridique')) typeMission = 'juridique';

  // Types missions détectés pour tableau de répartition
  const typesDetectes = [...new Set(
    lignesDevis.map(l => SECTION_TO_TYPE[(l.section || '').toLowerCase().trim()] || 'tenue_comptable')
  )];

  // Tableau de répartition par défaut
  const tableauRepartitionJson = buildTableauRepartition(typesDetectes);

  // Missions détaillées depuis lignes
  const dateDebut = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
    .toISOString().split('T')[0];
  const missionsData = buildMissionsFromLignes(lignesDevis, dateDebut);

  // Clauses applicables
  const categoriesApplicables = ['tronc_commun', 'annexe', ...typesDetectes.map(t => {
    const MAP = { tenue_comptable: 'mission_tenue', revision: 'mission_revision',
                  etablissement_comptes: 'mission_revision', fiscal: 'mission_fiscal',
                  social_paie: 'mission_social', juridique: 'mission_juridique',
                  conseil: 'mission_conseil' };
    return MAP[t] || 'tronc_commun';
  })];
  const [clauses] = await pool.query(
    `SELECT code, categorie, titre, contenu, version
     FROM bibliotheque_clauses
     WHERE actif = 1 AND categorie IN (${categoriesApplicables.map(() => '?').join(',')})
     ORDER BY id`,
    categoriesApplicables
  ).catch(() => [[]]);

  // Transaction atomique
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ins] = await conn.query(
      `INSERT INTO lettres_mission
         (numero, client_id, prospect_id, contactId, devis_id, statut,
          typeMission, objetMission, montantHonorairesHT, montant_annuel_ht,
          dateDebut, notesInternes,
          snapshot_client, snapshot_cabinet,
          recueil_besoin_json, tableau_repartition_json)
       VALUES (?,?,?,1,?,'brouillon',?,?,?,?,?,?,?,?,?,?)`,
      [
        numero,
        devis.client_id || null,
        devis.prospect_id || null,
        devisId,
        typeMission,
        devis.titre || devis.display_nom || null,
        montant, montant,
        dateDebut,
        devis.notesInternes || null,
        JSON.stringify(snapshotClient),
        JSON.stringify(snapshotCabinet),
        JSON.stringify({ activite: '', effectif: '', enjeux: '', contraintes: '' }),
        JSON.stringify(tableauRepartitionJson),
      ]
    );
    const ldmId = ins.insertId;

    // Missions détaillées — les colonnes nombre_heures_par_profil et
    // taux_par_profil ont été supprimées par le chantier F. Le budget d'une
    // mission est désormais porté par budget_ligne (une ligne = un code_temps
    // + un grade + une quantité + une périodicité), et honoraires_ht est un
    // cache dénormalisé calculé par production/budget.js. À ce stade de la
    // création, aucune budget_ligne n'existe encore — honoraires_ht reste à
    // 0 et sera renseigné à la saisie du budget côté écran (hors périmètre
    // du chantier F).
    for (const m of missionsData) {
      await conn.query(
        `INSERT INTO ldm_missions
           (lettre_mission_id, type_mission, libelle,
            honoraires_ht, date_debut, date_fin, ordre)
         VALUES (?,?,?,?,?,?,?)`,
        [ldmId, m.type_mission, m.libelle,
         m.honoraires_ht, m.date_debut, m.date_fin, m.ordre]
      );
    }

    // Snapshot clauses
    for (const cl of clauses) {
      await conn.query(
        `INSERT INTO ldm_clauses_snapshot
           (ldm_id, clause_code, clause_titre, clause_contenu, clause_version, categorie)
         VALUES (?,?,?,?,?,?)`,
        [ldmId, cl.code, cl.titre, cl.contenu, cl.version, cl.categorie]
      );
    }

    // Verrouiller le devis
    await conn.query(
      `UPDATE devis SET verrouille = 1, ldm_generee_id = ? WHERE id = ?`,
      [ldmId, devisId]
    );

    // Chapitres + totaux (aligné sur ce que faisait /convertir-ldm — la
    // divergence historique entre /accepter et /convertir-ldm est effacée).
    await conn.query('DELETE FROM lettres_mission_chapitres WHERE ldm_id = ?', [ldmId]);
    const [chapRows] = await conn.query('SELECT * FROM devis_chapitres WHERE devis_id = ?', [devisId]);
    for (const r of chapRows) {
      await conn.query(
        `INSERT INTO lettres_mission_chapitres (ldm_id, chapitre, total_theorique_ht, montant_accepte_ht, remise_ht)
         VALUES (?, ?, ?, ?, ?)`,
        [ldmId, r.chapitre, r.total_theorique_ht, r.montant_accepte_ht, r.remise_ht]
      );
    }
    await conn.query(
      `UPDATE lettres_mission SET total_theorique_ht=?, remise_commerciale_ht=?, total_accepte_ht=? WHERE id=?`,
      [devis.total_theorique_ht, devis.remise_commerciale_ht, devis.total_accepte_ht, ldmId]
    );

    // Événement CREATION
    await conn.query(
      `INSERT INTO ldm_evenements
         (ldm_id, type, acteur_id, acteur_nom, statut_avant, statut_apres, commentaire)
       VALUES (?, 'creation', ?, ?, NULL, 'brouillon', ?)`,
      [ldmId, acteurId || null, acteurNom || null,
       `Générée depuis devis ${devis.numero || devisId}`]
    );

    await conn.commit();
    const [[ldm]] = await conn.query('SELECT * FROM lettres_mission WHERE id = ?', [ldmId]);

    conn.release();

    // Avancer le pipeline vers "LDM en cours"
    try {
      const oppId = await findOpportuniteForLdm(devisId, devis.client_id, devis.prospect_id);
      if (oppId) {
        await pool.query(
          `UPDATE opportunites SET statut = 'ldm_en_cours', ldm_id = ?, updatedAt = NOW() WHERE id = ?`,
          [ldmId, oppId]
        );
      }
    } catch (e) { console.error('[pipeline] genererDepuisDevis:', e.message); }

    return { ldm, created: true };
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
}

// ── MACHINE À ÉTATS ───────────────────────────────────────────────────────────
async function transitionner(ldmId, action, acteurRole, acteurId, acteurNom, opts = {}) {
  const t = TRANSITIONS[action];
  if (!t) throw Object.assign(new Error(`Action inconnue : ${action}`), { status: 400 });

  if (!t.roles.includes(acteurRole)) {
    throw Object.assign(
      new Error(`Rôle "${acteurRole}" non autorisé pour l'action "${action}"`),
      { status: 403 }
    );
  }

  const [[ldm]] = await pool.query('SELECT * FROM lettres_mission WHERE id = ?', [ldmId]);
  if (!ldm) throw Object.assign(new Error('LDM introuvable'), { status: 404 });

  if (!t.depuis.includes(ldm.statut)) {
    throw Object.assign(
      new Error(`Transition "${action}" impossible depuis le statut "${ldm.statut}"`),
      { status: 400 }
    );
  }

  // ── Validations métier ────────────────────────────────────────────────────
  if (action === 'soumettre') {
    // R3 : activité + enjeux obligatoires
    let recueil = null;
    try {
      recueil = ldm.recueil_besoin_json
        ? (typeof ldm.recueil_besoin_json === 'string'
            ? JSON.parse(ldm.recueil_besoin_json)
            : ldm.recueil_besoin_json)
        : null;
    } catch { recueil = null; }
    const activiteOk = recueil?.activite && String(recueil.activite).trim().length > 0;
    const enjeuxOk   = recueil?.enjeux   && String(recueil.enjeux).trim().length > 0;
    if (!activiteOk || !enjeuxOk) {
      throw Object.assign(
        new Error('Le recueil du besoin est incomplet — "Activité" et "Enjeux" sont obligatoires avant soumission'),
        { status: 400, missingFields: { activite: !activiteOk, enjeux: !enjeuxOk } }
      );
    }
  }

  if (action === 'envoyer') {
    let snap = null;
    try { snap = ldm.snapshot_client ? JSON.parse(ldm.snapshot_client) : null; } catch { snap = null; }
    if (!snap?.email && !opts.emailOverride) {
      throw Object.assign(
        new Error('Email client manquant'),
        { status: 400, extra: { missingEmail: true, nomContact: snap?.nom || '' } }
      );
    }
  }

  if (action === 'signer') {
    if (!opts.documentSigneUrl && !opts.skipUrlCheck) {
      throw Object.assign(new Error('URL du document signé obligatoire'), { status: 400 });
    }
  }

  if (action === 'resilier') {
    if (!opts.motif || String(opts.motif).trim().length < 10) {
      throw Object.assign(new Error('Motif de résiliation obligatoire (≥ 10 caractères)'), { status: 400 });
    }
    if (!opts.dateResiliation) {
      throw Object.assign(new Error('Date de résiliation obligatoire'), { status: 400 });
    }
  }

  // ── Mise à jour ───────────────────────────────────────────────────────────
  const fields = ['statut = ?', 'updatedAt = NOW()'];
  const values = [t.vers];

  if (action === 'envoyer')  { fields.push('dateEnvoi = NOW()'); }
  if (action === 'signer')   {
    fields.push('dateSignatureClient = NOW()');
    if (opts.documentSigneUrl) { fields.push('document_signe_url = ?'); values.push(opts.documentSigneUrl); }
  }
  if (action === 'activer')  { fields.push('date_activation = CURDATE()'); }
  if (action === 'resilier') {
    fields.push('date_resiliation = ?', 'motif_resiliation = ?');
    values.push(opts.dateResiliation, opts.motif);
  }

  values.push(ldmId);
  await pool.query(`UPDATE lettres_mission SET ${fields.join(', ')} WHERE id = ?`, values);

  // ── Événement ─────────────────────────────────────────────────────────────
  const typeEvenement = {
    soumettre:       'soumission',
    valider_interne: 'validation_interne',
    envoyer:         'envoi_client',
    signer:          'signature',
    activer:         'activation',
    resilier:        'resiliation',
    echoir:          'echeance',
    annuler:         'annulation',
    rollback:        'rollback',
  }[action] || 'modification';

  await logEvenement(
    ldmId, typeEvenement, acteurId, acteurNom,
    ldm.statut, t.vers,
    opts.commentaire || null,
    opts.metadata || null
  );

  // ── Post-traitements ──────────────────────────────────────────────────────
  if (action === 'signer') {
    // Règle métier : la signature LDM est la SEULE voie de promotion
    // prospect → client. Elle déclenche aussi la création du dossier de
    // production et la génération des premières périodes. Chaque étape est
    // isolée dans son try/catch : une erreur sur les post-triggers ne doit
    // pas invalider la signature elle-même (déjà enregistrée en base).
    let promotedClientId = null;
    try {
      promotedClientId = await promouvoirProspectSiBesoin(ldmId);
    } catch (e) { console.error('[promotion] promouvoirProspect:', e.message); }

    let dossierId = null;
    if (promotedClientId) {
      try {
        dossierId = await creerDossierProductionSiBesoin(promotedClientId);
      } catch (e) { console.error('[promotion] creerDossier:', e.message); }
    }

    if (dossierId) {
      try {
        await rattacherMissionsAuDossier(ldmId, dossierId);
      } catch (e) { console.error('[promotion] rattacherMissions:', e.message); }
      try {
        const r = await genererPeriodesPourLdm(ldmId);
        console.log(`[promotion] LDM ${ldmId} signée → dossier ${dossierId}, ${r.totalPeriodes} période(s), ${r.totalTaches} tâche(s)`);
      } catch (e) { console.error('[promotion] genererPeriodes:', e.message); }

      // RG-50 — création automatique de l'onboarding et instanciation des
      // étapes E01..E27. Idempotent : UNIQUE (dossier_id) sur onboarding
      // empêche tout doublon. reprise_confrere reste à 0 tant que la
      // colonne opportunites.suivi_par_confrere n'est pas ajoutée (chantier
      // ultérieur RG-48). L'utilisateur pourra la basculer à la main en
      // attendant.
      try {
        const { creerOnboardingSiBesoin, instancierEtapesOnboarding } =
          require('../production/onboarding');
        const [[dossierRow]] = await pool.query(
          `SELECT id, profils FROM dossier WHERE id = ?`, [dossierId]
        );
        const onbId = await creerOnboardingSiBesoin(dossierId, {
          dateSignature: new Date().toISOString().slice(0, 10),
          creePar: acteurId || null,
        });
        const nbEtapes = await instancierEtapesOnboarding(onbId, dossierRow);
        console.log(`[promotion] onboarding ${onbId} — ${nbEtapes} étape(s) instanciée(s)`);

        // Chantier G — rattachement rétroactif des mandats du client à cet
        // onboarding. La chaîne signature peut avoir créé un mandat SEPA
        // AVANT que l'onboarding n'existe (ordonnancement des étapes de
        // transitionner). On rattache ici tous les mandats du client qui
        // n'ont pas encore d'onboarding_id.
        const [rmandats] = await pool.query(
          `UPDATE mandats m
             JOIN lettres_mission lm ON lm.id = m.ldm_id
              SET m.onboarding_id = ?
            WHERE lm.client_id = ?
              AND m.onboarding_id IS NULL`,
          [onbId, promotedClientId]
        );
        if (rmandats.affectedRows > 0) {
          console.log(`[promotion] onboarding ${onbId} — ${rmandats.affectedRows} mandat(s) rattaché(s)`);
        }
      } catch (e) { console.error('[promotion] onboarding:', e.message); }
    }

    // Activation automatique (comportement conservé)
    await transitionner(ldmId, 'activer', acteurRole, acteurId, acteurNom, {
      commentaire: 'Activation automatique après signature',
    });
  }
  if (action === 'activer') {
    // Pousser le pipeline vers "LDM signée"
    try {
      const oppId = await findOpportuniteForLdm(ldm.devis_id, ldm.client_id, ldm.prospect_id);
      if (oppId) {
        await pool.query(
          `UPDATE opportunites SET statut = 'ldm_signee', updatedAt = NOW() WHERE id = ?`,
          [oppId]
        );
      }
    } catch (e) { console.error('[pipeline] activer:', e.message); }

    // Génération automatique des brouillons de facturation
    try {
      const factureService = require('./factureService');
      await factureService.genererBrouillonsLDM(ldmId, acteurId);
    } catch (e) { console.error('[facturation] genererBrouillonsLDM:', e.message); }
  }
  if (action === 'annuler' || action === 'rollback') {
    // Déverrouiller le devis si annulation
    if (action === 'annuler' && ldm.devis_id) {
      await pool.query(
        'UPDATE devis SET verrouille = 0, ldm_generee_id = NULL WHERE id = ?',
        [ldm.devis_id]
      );
    }
  }

  const [[updated]] = await pool.query('SELECT * FROM lettres_mission WHERE id = ?', [ldmId]);
  return updated;
}

// ── MISE À JOUR RECUEIL DU BESOIN ─────────────────────────────────────────────
async function mettreAJourRecueilBesoin(ldmId, acteurRole, acteurId, acteurNom, data) {
  const [[ldm]] = await pool.query(
    'SELECT id, statut, recueil_besoin_json FROM lettres_mission WHERE id = ?', [ldmId]
  );
  if (!ldm) throw Object.assign(new Error('LDM introuvable'), { status: 404 });

  const statutsEditables = ['brouillon', 'a_valider'];
  if (!statutsEditables.includes(ldm.statut)) {
    throw Object.assign(
      new Error(`Recueil du besoin non modifiable en statut "${ldm.statut}"`),
      { status: 400 }
    );
  }

  let current = { activite: '', effectif: '', enjeux: '', contraintes: '' };
  try {
    const raw = ldm.recueil_besoin_json;
    current = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : current;
  } catch { /* keep default */ }

  const merged = {
    activite:    data.activite    !== undefined ? data.activite    : current.activite,
    effectif:    data.effectif    !== undefined ? data.effectif    : current.effectif,
    enjeux:      data.enjeux      !== undefined ? data.enjeux      : current.enjeux,
    contraintes: data.contraintes !== undefined ? data.contraintes : current.contraintes,
  };

  await pool.query(
    'UPDATE lettres_mission SET recueil_besoin_json = ?, updatedAt = NOW() WHERE id = ?',
    [JSON.stringify(merged), ldmId]
  );

  await logEvenement(ldmId, 'modification', acteurId, acteurNom, ldm.statut, ldm.statut,
    'Recueil du besoin mis à jour', null);

  return merged;
}

// ── MISE À JOUR TABLEAU DE RÉPARTITION ───────────────────────────────────────
async function mettreAJourTableauRepartition(ldmId, acteurRole, acteurId, acteurNom, lignes) {
  const [[ldm]] = await pool.query(
    'SELECT id, statut FROM lettres_mission WHERE id = ?', [ldmId]
  );
  if (!ldm) throw Object.assign(new Error('LDM introuvable'), { status: 404 });

  const statutsEditables = ['brouillon', 'a_valider'];
  if (!statutsEditables.includes(ldm.statut)) {
    throw Object.assign(
      new Error(`Tableau de répartition non modifiable en statut "${ldm.statut}"`),
      { status: 400 }
    );
  }

  await pool.query(
    'UPDATE lettres_mission SET tableau_repartition_json = ?, updatedAt = NOW() WHERE id = ?',
    [JSON.stringify(lignes), ldmId]
  );

  await logEvenement(ldmId, 'modification', acteurId, acteurNom, ldm.statut, ldm.statut,
    'Tableau de répartition mis à jour', null);

  return lignes;
}

// ── SIGNATURE : promotion prospect → client et création dossier de prod ─────
// Ces fonctions sont appelées par le hook 'signer' de transitionner (voir
// plus haut). Elles matérialisent la règle métier : « un prospect ne devient
// client qu'à la signature d'une LDM ». Chemin unique.

async function promouvoirProspectSiBesoin(ldmId, connexion = null) {
  const conn = connexion || pool;
  const [[ldm]] = await conn.query('SELECT * FROM lettres_mission WHERE id = ?', [ldmId]);
  if (!ldm) return null;
  if (ldm.client_id) return ldm.client_id; // déjà rattaché à un client
  if (!ldm.prospect_id) return null;       // LDM sans prospect ni client (edge case)

  const [[prospect]] = await conn.query('SELECT * FROM prospects WHERE id = ?', [ldm.prospect_id]);
  if (!prospect) return null;

  let clientId = prospect.client_id;
  if (!clientId) {
    const TYPE_MAP = { sci: 'SCI', association: 'Association', entreprise: 'BIC', particulier: 'BNC' };
    const clientType = TYPE_MAP[prospect.segment] || TYPE_MAP[prospect.type_prospect] || 'Autre';
    const [ins] = await conn.query(
      `INSERT INTO clients (nom, siren, type, regime, adresse, code_postal, ville, forme_juridique)
       VALUES (?, ?, ?, 'mensuel', ?, ?, ?, ?)`,
      [prospect.nom, prospect.siren || null, clientType,
       prospect.adresse || null, prospect.code_postal || null,
       prospect.ville || null, prospect.forme_juridique || null]
    );
    clientId = ins.insertId;
    await conn.query(
      `UPDATE prospects SET statut = 'converti', client_id = ? WHERE id = ?`,
      [clientId, prospect.id]
    );
  }

  // Réaligner la LDM et son devis source sur le client réel.
  await conn.query('UPDATE lettres_mission SET client_id = ? WHERE id = ?', [clientId, ldmId]);
  if (ldm.devis_id) {
    await conn.query('UPDATE devis SET client_id = ? WHERE id = ?', [clientId, ldm.devis_id]);
  }
  return clientId;
}

async function creerDossierProductionSiBesoin(clientId, connexion = null) {
  const conn = connexion || pool;
  const [[existing]] = await conn.query('SELECT id FROM dossier WHERE client_id = ?', [clientId]);
  if (existing) return existing.id;

  const [[client]] = await conn.query('SELECT * FROM clients WHERE id = ?', [clientId]);
  if (!client) return null;

  // Cohérent avec les valeurs d'amorçage de chantier3-04 :
  //   classe='B', profils=['T'], scores null, cotation_faite=0,
  //   materialite = max(500, ca_annuel * 1%), régime TVA dérivé.
  const caReference = client.ca_mensuel_signe ? Math.round(Number(client.ca_mensuel_signe) * 12) : null;
  const materialite = Math.max(500, caReference ? Math.round(caReference * 0.01) : 0) || 500;

  let jourCloture = null, moisCloture = null;
  if (client.date_cloture) {
    const d = new Date(client.date_cloture);
    if (!isNaN(d.getTime())) { jourCloture = d.getUTCDate(); moisCloture = d.getUTCMonth() + 1; }
  }

  let regimeTva = null;
  if (client.regime_tva === 'franchise' || client.regime_tva === 'hors_champ') regimeTva = 'franchise';
  else if (client.regime_tva === 'reel_simplifie') regimeTva = 'reel_simplifie';
  else if (client.regime_tva === 'reel_normal') {
    regimeTva = client.periodicite_tva === 'mensuelle' ? 'reel_normal_mensuel' : 'reel_normal_trimestriel';
  }

  const [ins] = await conn.query(
    `INSERT INTO dossier
       (client_id, raison_sociale, siren, forme_juridique,
        jour_cloture, mois_cloture, regime_tva,
        classe, profils, score_risque, score_complexite, cotation_faite,
        materialite, ca_reference, statut)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'B', ?, NULL, NULL, 0, ?, ?, 'actif')`,
    [clientId, client.raison_sociale || client.nom,
     client.siren && client.siren.length === 9 ? client.siren : null,
     client.forme_juridique,
     jourCloture, moisCloture, regimeTva,
     JSON.stringify(['T']), materialite, caReference]
  );
  return ins.insertId;
}

async function rattacherMissionsAuDossier(ldmId, dossierId, connexion = null) {
  const conn = connexion || pool;
  await conn.query(
    `UPDATE ldm_missions SET dossier_id = ?
      WHERE lettre_mission_id = ? AND dossier_id IS NULL`,
    [dossierId, ldmId]
  );
}

async function genererPeriodesPourLdm(ldmId) {
  // Import différé pour éviter tout cycle avec le module production.
  const { genererPeriodes } = require('../production/generer-periodes');
  const [missions] = await pool.query(
    `SELECT id FROM ldm_missions
      WHERE lettre_mission_id = ?
        AND genere_production = 1
        AND statut_production = 'active'`,
    [ldmId]
  );
  let totalPeriodes = 0, totalTaches = 0;
  for (const m of missions) {
    const r = await genererPeriodes(pool, { missionId: m.id });
    totalPeriodes += r.periodesCreees;
    totalTaches   += r.tachesCreees;
  }
  return { totalPeriodes, totalTaches };
}

module.exports = {
  genererDepuisDevis,
  transitionner,
  mettreAJourRecueilBesoin,
  mettreAJourTableauRepartition,
  logEvenement,
  nextNumeroLDM,
  buildTableauRepartition,
  promouvoirProspectSiBesoin,
  creerDossierProductionSiBesoin,
  rattacherMissionsAuDossier,
  genererPeriodesPourLdm,
  LIGNES_PAR_MISSION,
  LIGNES_TRONC_COMMUN,
};
