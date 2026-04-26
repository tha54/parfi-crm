const pool = require('../config/db');

async function nextFactureNumero() {
  const year = new Date().getFullYear();
  const [[{ seq }]] = await pool.query(
    `SELECT COUNT(*)+1 AS seq FROM factures WHERE YEAR(createdAt)=?`, [year]
  );
  return `FAC-${year}-${String(seq).padStart(4,'0')}`;
}

// Génère les factures automatiquement depuis une LDM signée
async function genererFacturesDepuisLDM(ldmId) {
  const [[ldm]] = await pool.query('SELECT * FROM lettres_mission WHERE id=?', [ldmId]);
  if (!ldm) return [];

  const montantHT = parseFloat(ldm.montantHonorairesHT || 0);
  const tauxTVA = 20;

  const periodiciteMap = {
    tenue_comptable: 'mensuelle', social_paie: 'mensuelle',
    revision: 'annuelle', etablissement_comptes: 'annuelle',
    fiscal: 'annuelle', conseil: 'trimestrielle',
    juridique: 'unique', autre: 'mensuelle',
  };
  const periodicite = periodiciteMap[ldm.typeMission] || 'mensuelle';
  const moisParPeriode = { mensuelle: 1, trimestrielle: 3, semestrielle: 6, annuelle: 12, unique: 999 };
  const pas = moisParPeriode[periodicite] || 1;
  const nbPeriodes = periodicite === 'unique' ? 1 : Math.ceil(12 / pas);
  const montantPeriode = parseFloat((montantHT / nbPeriodes).toFixed(2));

  const dateDebut = ldm.dateDebut ? new Date(ldm.dateDebut) : new Date();
  let cursor = new Date(dateDebut);
  cursor.setDate(1);

  const factureIds = [];
  for (let i = 0; i < nbPeriodes; i++) {
    const emission = new Date(cursor);
    const echeance = new Date(cursor);
    echeance.setDate(echeance.getDate() + 30);

    const tvaPeriode = parseFloat((montantPeriode * tauxTVA / 100).toFixed(2));
    const ttcPeriode = parseFloat((montantPeriode + tvaPeriode).toFixed(2));
    const numero = await nextFactureNumero();

    const [r] = await pool.query(
      `INSERT INTO factures (numero, contactId, client_id, type, statut,
        dateEmission, dateEcheance, totalHT, tauxTVA, totalTVA, totalTTC,
        estRecurrente, periodeRecurrence, intervenantId, notesInternes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [numero, ldm.contactId, ldm.client_id, 'recurrence', 'brouillon',
       emission, echeance, montantPeriode, tauxTVA, tvaPeriode, ttcPeriode,
       periodicite !== 'unique' ? 1 : 0, periodicite !== 'unique' ? periodicite : null,
       ldm.intervenantId || null,
       `Auto-générée depuis LDM ${ldm.numero}`]
    );
    const factureId = r.insertId;

    await pool.query(
      `INSERT INTO lignes_facture (factureId, ordre, description, quantite, prixUnitaireHT, totalHT)
       VALUES (?,?,?,?,?,?)`,
      [factureId, 1, ldm.objetMission || ldm.typeMission || 'Honoraires', 1, montantPeriode, montantPeriode]
    );

    factureIds.push(factureId);
    cursor.setMonth(cursor.getMonth() + pas);
  }

  // Plan de facturation
  if (factureIds.length > 0) {
    await pool.query(
      `INSERT INTO plan_facturation (lettreMissionId, client_id, frequence, montantHT, tauxTVA, dateDebut, echeances, statut)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE echeances=VALUES(echeances), statut='actif'`,
      [ldmId, ldm.client_id, periodicite, montantHT, tauxTVA,
       dateDebut.toISOString().substring(0,10), JSON.stringify(factureIds), 'actif']
    ).catch(() => {
      // table might not have UNIQUE on lettreMissionId — insert plain
      pool.query(
        `INSERT INTO plan_facturation (lettreMissionId, client_id, frequence, montantHT, tauxTVA, dateDebut, echeances, statut)
         VALUES (?,?,?,?,?,?,?,?)`,
        [ldmId, ldm.client_id, periodicite, montantHT, tauxTVA,
         dateDebut.toISOString().substring(0,10), JSON.stringify(factureIds), 'actif']
      ).catch(() => {});
    });
  }

  return factureIds;
}

module.exports = { genererFacturesDepuisLDM, nextFactureNumero };
