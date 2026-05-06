/**
 * Tests unitaires — moteur de chiffrage (utils/dimensionnement.js)
 * Aucune dépendance DB. Tests purs sur la logique de calcul.
 */
const { calculerLignes, TAUX } = require('../utils/dimensionnement');

// ─── Mode temps ──────────────────────────────────────────────────────────────

describe('mode temps — structure de base', () => {
  test('une société IS TVA mensuelle produit des lignes non vides', () => {
    const lignes = calculerLignes({
      type_entite: 'societe',
      regime_fiscal: 'is',
      regime_tva: 'mensuel',
      factures_achat: 30,
      factures_vente: 20,
      lignes_banque: 30,
      immobilisations: 5,
      effectif: 0,
    });
    expect(Array.isArray(lignes)).toBe(true);
    expect(lignes.length).toBeGreaterThan(0);
    lignes.forEach(l => {
      expect(l.temps_minutes).toBeGreaterThan(0);
      expect(l.tarif_ht).toBeGreaterThan(0);
      expect(l.rubrique).toBeTruthy();
      expect(l.section).toBeTruthy();
      expect(l.libelle).toBeTruthy();
      expect(l.intervenant).toBeTruthy();
      expect(l.periodicite).toBeTruthy();
    });
  });

  test('factures_achat=0 → pas de ligne "Journaux d\'achats"', () => {
    const lignes = calculerLignes({
      type_entite: 'ei', regime_fiscal: 'ir', regime_tva: 'franchise',
      factures_achat: 0, factures_vente: 0, lignes_banque: 0,
    });
    expect(lignes.find(l => l.libelle === "Journaux d'achats")).toBeUndefined();
  });

  test('factures_achat>0 → ligne "Journaux d\'achats" présente avec les bons minutes', () => {
    const lignes = calculerLignes({
      type_entite: 'ei', regime_fiscal: 'ir', regime_tva: 'franchise',
      factures_achat: 30,
    });
    const achats = lignes.find(l => l.libelle === "Journaux d'achats");
    expect(achats).toBeDefined();
    // max(30, round(30/30*60)) = max(30, 60) = 60
    expect(achats.temps_minutes).toBe(60);
  });
});

// ─── Conditions sectorielles ─────────────────────────────────────────────────

describe('mode temps — conditions sectorielles', () => {
  test('effectif=0 → aucune ligne section Social', () => {
    const lignes = calculerLignes({
      type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel', effectif: 0,
    });
    expect(lignes.filter(l => l.section === 'Social')).toHaveLength(0);
  });

  test('effectif=3 → bulletins de paie 5×3×12=180 minutes', () => {
    const lignes = calculerLignes({
      type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel', effectif: 3,
    });
    const bulletins = lignes.find(l => l.libelle === 'Bulletins de paie');
    expect(bulletins).toBeDefined();
    expect(bulletins.temps_minutes).toBe(5 * 3 * 12);
  });

  test('type_entite=association → pas de CET', () => {
    const lignes = calculerLignes({
      type_entite: 'association', regime_fiscal: 'is', regime_tva: 'franchise',
    });
    expect(lignes.filter(l => l.rubrique === 'Contribution économique territoriale')).toHaveLength(0);
  });

  test('TVA franchise → pas de déclarations de TVA', () => {
    const lignes = calculerLignes({
      type_entite: 'ei', regime_fiscal: 'ir', regime_tva: 'franchise',
    });
    expect(lignes.filter(l => l.rubrique === 'Déclarations de TVA')).toHaveLength(0);
  });

  test('TVA mensuelle → 12 déclarations TVA incluses', () => {
    const lignes = calculerLignes({
      type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel',
    });
    const decl = lignes.find(l => l.libelle === 'Déclarations TVA');
    expect(decl).toBeDefined();
    // 20 min × 12 déclarations = 240 minutes
    expect(decl.temps_minutes).toBe(240);
  });

  test('isSociete → acomptes IS et juridique AGO présents', () => {
    const lignes = calculerLignes({
      type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel',
    });
    expect(lignes.find(l => l.libelle === 'Acomptes IS x4')).toBeDefined();
    expect(lignes.find(l => l.libelle === 'Rédaction AGO')).toBeDefined();
  });

  test('regime_fiscal=sci → Déclaration 2072 au lieu de liasses fiscales', () => {
    const lignes = calculerLignes({
      type_entite: 'societe', regime_fiscal: 'sci', regime_tva: 'franchise',
    });
    expect(lignes.find(l => l.libelle === 'Déclaration 2072 (SCI)')).toBeDefined();
    expect(lignes.find(l => l.libelle === 'Liasses fiscales')).toBeUndefined();
  });
});

// ─── Calcul des tarifs ────────────────────────────────────────────────────────

describe('mode temps — calcul des tarifs', () => {
  test('Expert-comptable — Supervision du dossier : 60 min × 84 €/h = 84 €', () => {
    const lignes = calculerLignes({
      type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel',
    });
    const supervision = lignes.find(l => l.libelle === 'Supervision du dossier');
    expect(supervision).toBeDefined();
    expect(supervision.intervenant).toBe('Expert-comptable');
    expect(supervision.tarif_ht).toBe(Math.round((60 / 60) * TAUX['Expert-comptable']));
  });

  test('tauxOverrides surchargent le taux du profil', () => {
    const overrides = { "Journaux d'achats": 10 };
    const lignes = calculerLignes({
      type_entite: 'ei', regime_fiscal: 'ir', regime_tva: 'franchise',
      factures_achat: 30,
    }, overrides);
    const achats = lignes.find(l => l.libelle === "Journaux d'achats");
    expect(achats).toBeDefined();
    // 60 min × 10 €/h = 10 €
    expect(achats.tarif_ht).toBe(Math.round((60 / 60) * 10));
  });

  test('tarif_ht = 0 n\'est jamais inséré comme ligne', () => {
    const lignes = calculerLignes({
      type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel',
    });
    // Toutes les lignes retournées ont tarif_ht > 0 (condition dans add())
    expect(lignes.every(l => l.tarif_ht > 0)).toBe(true);
  });
});

// ─── Mode forfait ─────────────────────────────────────────────────────────────

const { calculerForfait, calculer } = require('../utils/dimensionnement');

describe('mode forfait', () => {
  test('une ligne forfait produit tarif_ht = montant_saisi et temps_minutes = 0', () => {
    const lignes = calculerForfait([
      { libelle: 'Secrétariat juridique ponctuel', section: 'Juridique', montant_forfait: 1200, periodicite: 'Ponctuel' },
    ]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].tarif_ht).toBe(1200);
    expect(lignes[0].temps_minutes).toBe(0);
    expect(lignes[0].mode_suivi).toBe('forfait');
    expect(lignes[0].libelle).toBe('Secrétariat juridique ponctuel');
  });

  test('une ligne forfait sans section ni volumétrie est valide et apparaît dans les résultats', () => {
    const lignes = calculerForfait([
      { libelle: 'Conseil ponctuel', montant_forfait: 500 },
    ]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].libelle).toBe('Conseil ponctuel');
    expect(lignes[0].section).toBe('Forfait');
    expect(lignes[0].periodicite).toBe('Annuel');
  });

  test('mode_suivi=forfait produit une structure de ligne distincte du mode temps', () => {
    const lignes = calculerForfait([{ libelle: 'Mission ponctuelle', montant_forfait: 800 }]);
    expect(lignes[0].mode_suivi).toBe('forfait');
    expect(lignes[0].temps_minutes).toBe(0);
    // Pas de profil intervenant (null)
    expect(lignes[0].intervenant).toBeNull();
  });

  test('une ligne forfait avec montant_forfait=0 est filtrée (non retournée)', () => {
    const lignes = calculerForfait([{ libelle: 'Vide', montant_forfait: 0 }]);
    expect(lignes).toHaveLength(0);
  });
});

// ─── Mode mixte ───────────────────────────────────────────────────────────────

describe('mode mixte', () => {
  test('un chiffrage mixte produit les bons totaux séparés temps/forfait et un total général', () => {
    const result = calculer({
      params: { type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel' },
      rubriques_forfait: [{ libelle: 'Secrétariat social forfait', montant_forfait: 2400 }],
    });
    expect(result.total_forfait).toBe(2400);
    expect(result.total_temps).toBeGreaterThan(0);
    expect(result.total_ht).toBe(result.total_temps + result.total_forfait);
    expect(result.lignes_temps.length).toBeGreaterThan(0);
    expect(result.lignes_forfait).toHaveLength(1);
  });

  test("les lignes forfait n'affectent pas le budget temps des lignes temps", () => {
    const params = { type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel' };
    const temps_seul = calculerLignes(params);
    const mixte = calculer({
      params,
      rubriques_forfait: [{ libelle: 'Conseil', montant_forfait: 1000 }],
    });
    expect(mixte.lignes_temps.length).toBe(temps_seul.length);
    mixte.lignes_temps.forEach((l, i) => {
      expect(l.temps_minutes).toBe(temps_seul[i].temps_minutes);
      expect(l.tarif_ht).toBe(temps_seul[i].tarif_ht);
    });
  });

  test('le total général = somme temps + somme forfait', () => {
    const result = calculer({
      params: { type_entite: 'ei', regime_fiscal: 'ir', regime_tva: 'franchise' },
      rubriques_forfait: [
        { libelle: 'Mission A', montant_forfait: 600 },
        { libelle: 'Mission B', montant_forfait: 400 },
      ],
    });
    expect(result.total_forfait).toBe(1000);
    expect(result.total_ht).toBe(result.total_temps + 1000);
  });

  test('un payload vide retourne des totaux à zéro et des tableaux vides', () => {
    const result = calculer({});
    expect(result.total_forfait).toBe(0);
    expect(result.lignes_forfait).toHaveLength(0);
    expect(result.lignes).toBeDefined();
  });
});

describe('remise commerciale par chapitre', () => {
  // Helper qui simule le calcul côté backend : agrège les lignes par chapitre
  // et applique les montants acceptés pour dériver la remise.
  function computeChapitres(lignes, chapitresRemise) {
    const totals = {};
    for (const l of lignes) {
      if (l.chapitre) totals[l.chapitre] = (totals[l.chapitre] || 0) + l.tarif_ht;
    }
    return Object.entries(totals).map(([chapitre, th]) => {
      const acc = chapitresRemise?.[chapitre]?.montant_accepte ?? th;
      return { chapitre, total_theorique_ht: th, montant_accepte_ht: acc, remise_ht: th - acc };
    });
  }

  // Enrichit les lignes moteur avec un chapitre déduit de la section
  function sectionToChapitre(section) {
    const s = (section || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (s === 'comptabilite' || s === 'fiscalite') return 'comptable_fiscal';
    if (s === 'social') return 'social';
    if (s === 'juridique') return 'juridique';
    return null;
  }

  test('remise comptable_fiscal : montant accepté < théorique crée une remise positive', () => {
    const result = calculer({ params: { type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel' } });
    const lignesAvecChapitre = result.lignes.map(l => ({ ...l, chapitre: sectionToChapitre(l.section) }));

    const chapitresRemise = { comptable_fiscal: { montant_accepte: 0 } };
    const chapitres = computeChapitres(lignesAvecChapitre, chapitresRemise);
    const cf = chapitres.find(c => c.chapitre === 'comptable_fiscal');

    expect(cf).toBeDefined();
    expect(cf.remise_ht).toBeGreaterThan(0);
    expect(cf.montant_accepte_ht).toBe(0);
    expect(cf.remise_ht).toBe(cf.total_theorique_ht);
  });

  test('sans chapitres_remise, aucune remise (montant accepté = théorique)', () => {
    const result = calculer({ params: { type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel' } });
    const lignesAvecChapitre = result.lignes.map(l => ({ ...l, chapitre: sectionToChapitre(l.section) }));
    const chapitres = computeChapitres(lignesAvecChapitre, null);

    chapitres.forEach(c => {
      expect(c.remise_ht).toBe(0);
      expect(c.montant_accepte_ht).toBe(c.total_theorique_ht);
    });
  });

  test('remise partielle sur un seul chapitre laisse les autres intacts', () => {
    const result = calculer({ params: { type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel', effectif: 2 } });
    const lignesAvecChapitre = result.lignes.map(l => ({ ...l, chapitre: sectionToChapitre(l.section) }));
    const totalCF = lignesAvecChapitre.filter(l => l.chapitre === 'comptable_fiscal').reduce((s, l) => s + l.tarif_ht, 0);
    const montantAccepte = Math.round(totalCF * 0.8 * 100) / 100;

    const chapitresRemise = { comptable_fiscal: { montant_accepte: montantAccepte } };
    const chapitres = computeChapitres(lignesAvecChapitre, chapitresRemise);

    const cf = chapitres.find(c => c.chapitre === 'comptable_fiscal');
    const social = chapitres.find(c => c.chapitre === 'social');

    expect(cf.remise_ht).toBeCloseTo(totalCF * 0.2, 1);
    if (social) expect(social.remise_ht).toBe(0);
  });
});
