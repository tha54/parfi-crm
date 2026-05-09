'use strict';

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const toDateStr = d => d.toISOString().split('T')[0];

/**
 * Calcule la date d'échéance de la liasse fiscale.
 * closureMonth: 1–12 (mois de clôture)
 * fyEndYear: année de fin d'exercice
 */
function liasseDeadline(closureMonth, closureDay, fyEndYear, isIS) {
  if (closureMonth === 12 && closureDay === 31) {
    // Clôture 31/12 : dépôt mai de l'année suivante
    return new Date(fyEndYear + 1, 4, isIS ? 15 : 31);
  }
  // Autres clôtures : dernier jour du 3e mois suivant la clôture
  // Pour IS : 15 du mois suivant ce délai (extension)
  const lastDay3M = new Date(fyEndYear, closureMonth + 3, 0); // day 0 = dernier jour du mois précédent
  if (isIS) {
    lastDay3M.setDate(1);
    lastDay3M.setMonth(lastDay3M.getMonth() + 1);
    lastDay3M.setDate(15);
  }
  return lastDay3M;
}

/**
 * Calcule la date de la prochaine occurrence d'une tâche périodique.
 */
function nextOccurrence(dateStr, periodicite) {
  if (!dateStr || !periodicite) return null;
  const d = new Date(dateStr);
  const p = periodicite.toLowerCase();
  if (p.includes('mensuel'))      d.setMonth(d.getMonth() + 1);
  else if (p.includes('trimestr'))d.setMonth(d.getMonth() + 3);
  else if (p.includes('semestr')) d.setMonth(d.getMonth() + 6);
  else if (p.includes('annuel'))  d.setFullYear(d.getFullYear() + 1);
  else return null;
  return toDateStr(d);
}

/**
 * Génère les tâches fiscales pour un client et une année donnée.
 * @param {Object} client - ligne clients avec tous les champs de régime
 * @param {number} annee  - exercice à générer
 * @returns {Array} liste de tâches (sans utilisateur_id, à remplir par l'appelant)
 */
function echeancesClient(client, annee) {
  const tasks = [];
  const { id: client_id, regime_tva, periodicite_tva, regime_fiscal, date_cloture, regime, type } = client;
  const isIS = regime_fiscal === 'IS';

  // ─── Dérival de la périodicité TVA ───────────────────────────────
  let ptva = periodicite_tva;
  if (!ptva) {
    if (regime_tva === 'reel_normal')     ptva = 'mensuelle';
    else if (regime_tva === 'reel_simplifie') ptva = 'trimestrielle';
    else if (regime === 'mensuel')        ptva = 'mensuelle';
    else if (regime === 'trimestriel')    ptva = 'trimestrielle';
  }
  const tvaSoumis = regime_tva !== 'franchise' && regime_tva !== 'hors_champ';

  // ─── TVA mensuelle ────────────────────────────────────────────────
  if (ptva === 'mensuelle' && tvaSoumis) {
    for (let m = 0; m < 12; m++) {
      tasks.push({
        client_id,
        titre: `TVA ${MONTHS_FR[m]} ${annee}`,
        date_echeance: toDateStr(new Date(annee, m + 1, 19)), // 19 du mois suivant, JS gère Dec→Jan
        categorie: 'Fiscal',
        type_travail: 'Déclaration TVA',
        periodicite: 'mensuelle',
        priorite: 'normale',
        origine: 'fiscale',
        source: 'fiscale',
      });
    }
  }

  // ─── TVA trimestrielle ────────────────────────────────────────────
  else if (ptva === 'trimestrielle' && tvaSoumis) {
    [
      { titre: `TVA T1 ${annee} (Jan–Mar)`,  due: new Date(annee,   3, 19) }, // 19 avr
      { titre: `TVA T2 ${annee} (Avr–Jun)`,  due: new Date(annee,   6, 19) }, // 19 jul
      { titre: `TVA T3 ${annee} (Jul–Sep)`,  due: new Date(annee,   9, 19) }, // 19 oct
      { titre: `TVA T4 ${annee} (Oct–Déc)`,  due: new Date(annee+1, 0, 19) }, // 19 jan N+1
    ].forEach(({ titre, due }) => tasks.push({
      client_id, titre,
      date_echeance: toDateStr(due),
      categorie: 'Fiscal', type_travail: 'Déclaration TVA',
      periodicite: 'trimestrielle', priorite: 'normale',
      origine: 'fiscale', source: 'fiscale',
    }));
  }

  // ─── Acomptes IS ─────────────────────────────────────────────────
  if (isIS) {
    [
      { titre: `Acompte IS 1 · ${annee}`, due: new Date(annee, 2, 15)  }, // 15 mar
      { titre: `Acompte IS 2 · ${annee}`, due: new Date(annee, 5, 15)  }, // 15 jun
      { titre: `Acompte IS 3 · ${annee}`, due: new Date(annee, 8, 15)  }, // 15 sep
      { titre: `Acompte IS 4 · ${annee}`, due: new Date(annee, 11, 15) }, // 15 déc
    ].forEach(({ titre, due }) => tasks.push({
      client_id, titre,
      date_echeance: toDateStr(due),
      categorie: 'Fiscal', type_travail: 'Acompte IS',
      periodicite: 'trimestrielle', priorite: 'normale',
      origine: 'fiscale', source: 'fiscale',
    }));
  }

  // ─── Liasse fiscale ──────────────────────────────────────────────
  if (date_cloture) {
    const cDate = new Date(date_cloture);
    const cm = cDate.getMonth() + 1;
    const cd = cDate.getDate();
    // Pour clôture 31/12 : exercice N-1, liasse due en N
    // Pour autres dates : exercice N, liasse due plus tard en N
    const fyEndYear = (cm === 12 && cd === 31) ? annee - 1 : annee;
    const deadline  = liasseDeadline(cm, cd, fyEndYear, isIS);
    tasks.push({
      client_id,
      titre: `Liasse fiscale ${fyEndYear}`,
      date_echeance: toDateStr(deadline),
      categorie: 'Fiscal',
      type_travail: 'Liasse fiscale',
      periodicite: 'annuelle',
      priorite: 'haute',
      origine: 'fiscale',
      source: 'fiscale',
    });
  }

  // ─── CFE ─────────────────────────────────────────────────────────
  if (type !== 'Association' && regime_fiscal && !['micro_bnc','IR_BNC'].includes(regime_fiscal)) {
    tasks.push({
      client_id,
      titre: `CFE ${annee}`,
      date_echeance: toDateStr(new Date(annee, 11, 15)), // 15 déc
      categorie: 'Fiscal',
      type_travail: 'CFE',
      periodicite: 'annuelle',
      priorite: 'normale',
      origine: 'fiscale',
      source: 'fiscale',
    });
  }

  return tasks;
}

module.exports = { echeancesClient, nextOccurrence };
