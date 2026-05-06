const TAUX = {
  'Expert-comptable':        84,
  'Chef de groupe':          72,
  'Chef de mission':         58,
  'Collaborateur Senior':    48,
  'Collaborateur':           40,
  'Collaborateur Junior':    32,
  'Collaborateur Social':    28,
  'Collaborateur Juridique': 60,
  'Juriste':                 60,
};

// Catalogue exhaustif de toutes les tâches possibles — sert à initialiser la table de config.
// taux_defaut: taux spécifique initial (null = utiliser le taux du profil intervenant)
const CATALOGUE = [
  // Tenue comptable (saisie à faible valeur ajoutée → taux spécifique 28 €/h par défaut)
  { rubrique: 'Tenue comptable', section: 'Comptabilité', libelle: "Journaux d'achats",     intervenant: 'Collaborateur', taux_defaut: 28 },
  { rubrique: 'Tenue comptable', section: 'Comptabilité', libelle: 'Journaux de ventes',    intervenant: 'Collaborateur', taux_defaut: 28 },
  { rubrique: 'Tenue comptable', section: 'Comptabilité', libelle: 'Journaux de trésorerie', intervenant: 'Collaborateur', taux_defaut: 28 },
  { rubrique: 'Tenue comptable', section: 'Comptabilité', libelle: "Journaux d'OD",         intervenant: 'Collaborateur', taux_defaut: 28 },
  // Révision comptable
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Constitution dossier permanent',             intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Collecte éléments dossier permanent',        intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Collecte pièces contrôle annuel',            intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Constitution dossier de contrôle annuel',    intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Constitution FEC exercice clos',             intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Constitution FEC exercice en cours',         intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Archivage FEC',                              intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Traitement des immobilisations',             intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Fournisseurs factures non parvenues',        intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Clients factures à établir',                 intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'État et organismes sociaux',                 intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Divers à payer et à recevoir',               intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: "Charges et produits constatés d'avance",     intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Grand livre Balance x3',                     intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Bilan Compte de résultat Annexe',            intervenant: 'Collaborateur',     taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Supervision du dossier',                     intervenant: 'Expert-comptable',  taux_defaut: null },
  { rubrique: 'Révision comptable et présentation des comptes', section: 'Comptabilité', libelle: 'Entretien annuel de présentation des comptes', intervenant: 'Expert-comptable', taux_defaut: null },
  // TVA
  { rubrique: 'Déclarations de TVA',                       section: 'Fiscalité', libelle: 'Déclarations TVA',        intervenant: 'Collaborateur', taux_defaut: null },
  { rubrique: 'Déclarations de TVA',                       section: 'Fiscalité', libelle: 'Contrôle TVA bilan',      intervenant: 'Collaborateur', taux_defaut: null },
  // Liasse
  { rubrique: 'Liasse fiscale et impôt sur les sociétés',  section: 'Fiscalité', libelle: 'Liasses fiscales',                intervenant: 'Collaborateur', taux_defaut: null },
  { rubrique: 'Liasse fiscale et impôt sur les sociétés',  section: 'Fiscalité', libelle: 'Acomptes IS x4',                 intervenant: 'Collaborateur', taux_defaut: null },
  { rubrique: 'Liasse fiscale et impôt sur les sociétés',  section: 'Fiscalité', libelle: 'Liquidation IS',                 intervenant: 'Collaborateur', taux_defaut: null },
  { rubrique: 'Liasse fiscale et impôt sur les sociétés',  section: 'Fiscalité', libelle: 'Détermination résultat fiscal',  intervenant: 'Collaborateur', taux_defaut: null },
  // CET
  { rubrique: 'Contribution économique territoriale',      section: 'Fiscalité', libelle: 'Déclaration annuelle CET',       intervenant: 'Collaborateur', taux_defaut: null },
  { rubrique: 'Contribution économique territoriale',      section: 'Fiscalité', libelle: 'Contrôle avis CET',              intervenant: 'Collaborateur', taux_defaut: null },
  { rubrique: 'Contribution économique territoriale',      section: 'Fiscalité', libelle: 'Demandes de dégrèvements CET',   intervenant: 'Collaborateur', taux_defaut: null },
  // Autres obligations fiscales
  { rubrique: 'Autres obligations fiscales',               section: 'Fiscalité', libelle: "Taxe d'apprentissage",           intervenant: 'Collaborateur Social', taux_defaut: null },
  { rubrique: 'Autres obligations fiscales',               section: 'Fiscalité', libelle: 'Formation professionnelle continue', intervenant: 'Collaborateur Social', taux_defaut: null },
  { rubrique: 'Autres obligations fiscales',               section: 'Fiscalité', libelle: 'DAS2',                           intervenant: 'Collaborateur',        taux_defaut: null },
  // Paie / Social
  { rubrique: 'Gestion de la paie', section: 'Social', libelle: 'Bulletins de paie',              intervenant: 'Collaborateur Social', taux_defaut: null },
  { rubrique: 'Gestion de la paie', section: 'Social', libelle: 'DSN mensuelle',                  intervenant: 'Collaborateur Social', taux_defaut: null },
  { rubrique: 'Gestion de la paie', section: 'Social', libelle: 'Tableaux récap nets imposables', intervenant: 'Collaborateur Social', taux_defaut: null },
  { rubrique: 'Gestion de la paie', section: 'Social', libelle: 'Calcul IFC',                     intervenant: 'Collaborateur',        taux_defaut: null },
  { rubrique: 'Gestion de la paie', section: 'Social', libelle: 'Registres légaux sociaux',       intervenant: 'Collaborateur Social', taux_defaut: null },
  // Juridique
  { rubrique: 'Secrétariat juridique annuel', section: 'Juridique', libelle: 'Rédaction AGO',  intervenant: 'Collaborateur Juridique', taux_defaut: null },
  { rubrique: 'Secrétariat juridique annuel', section: 'Juridique', libelle: 'Formalités AGO', intervenant: 'Collaborateur Juridique', taux_defaut: null },
];

// tauxOverrides: { [libelle]: number|null } — null ou absent = taux du profil intervenant
function tarif(intervenant, libelle, minutes, tauxOverrides = {}) {
  const override = tauxOverrides[libelle];
  const taux = (override != null) ? override : (TAUX[intervenant] || 42);
  return Math.round((minutes / 60) * taux);
}

function calculerLignes(params, tauxOverrides = {}) {
  const {
    type_entite, regime_fiscal, regime_tva, nb_etablissements = 1,
    factures_achat = 0, factures_vente = 0, lignes_banque = 0,
    immobilisations = 0, effectif = 0, operations_diverses = null,
  } = params;

  const lignes = [];
  const add = (rubrique, section, libelle, intervenant, minutes, periodicite, condition = true) => {
    if (!condition || minutes <= 0) return;
    lignes.push({
      rubrique, section, libelle, intervenant, periodicite,
      temps_minutes: minutes,
      tarif_ht: tarif(intervenant, libelle, minutes, tauxOverrides),
      mode_suivi: 'temps',
    });
  };

  const od = operations_diverses !== null ? Number(operations_diverses) : Math.round((factures_achat + factures_vente) * 0.1);
  const nbDecl = regime_tva === 'mensuel' ? 12 : regime_tva === 'trimestriel' ? 4 : 0;
  const hasTva = regime_tva !== 'franchise' && regime_tva !== 'neant';
  const isSociete = type_entite === 'societe';
  const isAssociation = type_entite === 'association';
  const isSCI = regime_fiscal === 'sci';
  const notAssociation = !isAssociation;

  // TENUE COMPTABLE — réalisé par Collaborateur (peut être valorisé à taux spécifique)
  const R1 = 'Tenue comptable'; const S1 = 'Comptabilité';
  add(R1, S1, "Journaux d'achats",     'Collaborateur', Math.max(30, Math.round(factures_achat / 30 * 60)),  'Mensuel',     factures_achat > 0);
  add(R1, S1, 'Journaux de ventes',    'Collaborateur', Math.max(30, Math.round(factures_vente / 30 * 60)),  'Mensuel',     factures_vente > 0);
  add(R1, S1, 'Journaux de trésorerie','Collaborateur', Math.max(30, Math.round(lignes_banque  / 60 * 60)),  'Mensuel',     lignes_banque > 0);
  add(R1, S1, "Journaux d'OD",         'Collaborateur', Math.max(30, Math.round(od             / 30 * 60)),  'Mensuel');

  // RÉVISION COMPTABLE
  const R2 = 'Révision comptable et présentation des comptes'; const S2 = 'Comptabilité';
  add(R2, S2, 'Constitution dossier permanent',             'Collaborateur',    30,  'Ponctuel');
  add(R2, S2, 'Collecte éléments dossier permanent',        'Collaborateur',    30,  'Clôture');
  add(R2, S2, 'Collecte pièces contrôle annuel',            'Collaborateur',    60,  'Clôture');
  add(R2, S2, 'Constitution dossier de contrôle annuel',    'Collaborateur',    300, 'Clôture');
  add(R2, S2, 'Constitution FEC exercice clos',             'Collaborateur',    5,   'Ponctuel');
  add(R2, S2, 'Constitution FEC exercice en cours',         'Collaborateur',    5,   'Ponctuel');
  add(R2, S2, 'Archivage FEC',                              'Collaborateur',    5,   'Clôture');
  add(R2, S2, 'Traitement des immobilisations',             'Collaborateur',    Math.max(5, immobilisations * 2), 'Clôture');
  add(R2, S2, 'Fournisseurs factures non parvenues',        'Collaborateur',    15,  'Clôture');
  add(R2, S2, 'Clients factures à établir',                 'Collaborateur',    15,  'Clôture');
  add(R2, S2, 'État et organismes sociaux',                 'Collaborateur',    15,  'Clôture');
  add(R2, S2, 'Divers à payer et à recevoir',               'Collaborateur',    10,  'Clôture');
  add(R2, S2, "Charges et produits constatés d'avance",     'Collaborateur',    10,  'Clôture');
  add(R2, S2, 'Grand livre Balance x3',                     'Collaborateur',    45,  'Clôture');
  add(R2, S2, 'Bilan Compte de résultat Annexe',            'Collaborateur',    240, 'Clôture');
  add(R2, S2, 'Supervision du dossier',                     'Expert-comptable', 60,  'Clôture');
  add(R2, S2, 'Entretien annuel de présentation des comptes','Expert-comptable', 90, 'Clôture');

  // TVA
  const R3 = 'Déclarations de TVA'; const S3 = 'Fiscalité';
  add(R3, S3, 'Déclarations TVA',  'Collaborateur', 20 * nbDecl, regime_tva === 'mensuel' ? 'Mensuel' : 'Trimestriel', hasTva && nbDecl > 0);
  add(R3, S3, 'Contrôle TVA bilan','Collaborateur', 60, 'Clôture', hasTva);

  // LIASSE FISCALE / DÉCLARATIONS IR
  const R4 = 'Liasse fiscale et impôt sur les sociétés'; const S4 = 'Fiscalité';
  add(R4, S4, 'Liasses fiscales',               'Collaborateur', 120, 'Clôture',      regime_fiscal !== 'micro' && !isSCI);
  add(R4, S4, 'Déclaration 2072 (SCI)',         'Collaborateur', 90,  'Clôture',      isSCI);
  add(R4, S4, 'Acomptes IS x4',                 'Collaborateur', 60,  'Trimestriel',  isSociete && !isSCI);
  add(R4, S4, 'Liquidation IS',                 'Collaborateur', 30,  'Clôture',      isSociete && !isSCI);
  add(R4, S4, 'Détermination résultat fiscal',  'Collaborateur', 30,  'Clôture',      isSociete && !isSCI);

  // CET
  const R5 = 'Contribution économique territoriale'; const S5 = 'Fiscalité';
  add(R5, S5, 'Déclaration annuelle CET',     'Collaborateur', 30, 'Annuel', notAssociation);
  add(R5, S5, 'Contrôle avis CET',            'Collaborateur', 30, 'Annuel', notAssociation);
  add(R5, S5, 'Demandes de dégrèvements CET', 'Collaborateur', 30, 'Annuel', notAssociation);

  // AUTRES OBLIGATIONS FISCALES
  const R6 = 'Autres obligations fiscales'; const S6 = 'Fiscalité';
  add(R6, S6, "Taxe d'apprentissage",            'Collaborateur Social', 30, 'Annuel', effectif > 0 && notAssociation);
  add(R6, S6, 'Formation professionnelle continue', 'Collaborateur Social', 30, 'Annuel', effectif > 0);
  add(R6, S6, 'DAS2',                            'Collaborateur',        30, 'Clôture');

  // SOCIAL
  const R7 = 'Gestion de la paie'; const S7 = 'Social';
  add(R7, S7, 'Bulletins de paie',              'Collaborateur Social', 5  * effectif * 12, 'Mensuel', effectif > 0);
  add(R7, S7, 'DSN mensuelle',                  'Collaborateur Social', 10 * effectif * 12, 'Mensuel', effectif > 0);
  add(R7, S7, 'Tableaux récap nets imposables', 'Collaborateur Social', 10,  'Annuel', effectif > 0);
  add(R7, S7, 'Calcul IFC',                     'Collaborateur',        30,  'Clôture', effectif > 0);
  add(R7, S7, 'Registres légaux sociaux',       'Collaborateur Social', 60,  'Annuel', effectif > 0);

  // JURIDIQUE
  const R8 = 'Secrétariat juridique annuel'; const S8 = 'Juridique';
  add(R8, S8, 'Rédaction AGO',  'Collaborateur Juridique', 240, 'Annuel', isSociete || isAssociation);
  add(R8, S8, 'Formalités AGO', 'Collaborateur Juridique', 60,  'Annuel', isSociete || isAssociation);

  return lignes;
}

/**
 * Calcule les lignes en mode forfait (montant saisi, pas de budget temps).
 * @param {Array} rubriques_forfait - [{ libelle, section?, rubrique?, montant_forfait, periodicite? }]
 */
function calculerForfait(rubriques_forfait = []) {
  return rubriques_forfait
    .map(r => ({
      rubrique: r.rubrique || r.libelle,
      section:  r.section  || 'Forfait',
      libelle:  r.libelle,
      intervenant: null,
      periodicite: r.periodicite || 'Annuel',
      temps_minutes: 0,
      tarif_ht: Math.round(parseFloat(r.montant_forfait) || 0),
      mode_suivi: 'forfait',
    }))
    .filter(l => l.tarif_ht > 0);
}

/**
 * Calcul mixte : combine mode temps et mode forfait.
 * @param {object} payload - { params, tauxOverrides?, rubriques_forfait? }
 * @returns {{ lignes, lignes_temps, lignes_forfait, total_temps, total_forfait, total_ht }}
 */
function calculer({ params = {}, tauxOverrides = {}, rubriques_forfait = [] } = {}) {
  const lignes_temps   = calculerLignes(params, tauxOverrides);
  const lignes_forfait = calculerForfait(rubriques_forfait);
  const lignes         = [...lignes_temps, ...lignes_forfait];

  const total_temps   = lignes_temps.reduce((s, l) => s + l.tarif_ht, 0);
  const total_forfait = lignes_forfait.reduce((s, l) => s + l.tarif_ht, 0);
  const total_ht      = total_temps + total_forfait;

  return { lignes, lignes_temps, lignes_forfait, total_temps, total_forfait, total_ht };
}

module.exports = { calculerLignes, calculerForfait, calculer, TAUX, CATALOGUE };
