const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// ── Pipeline sync helper ──────────────────────────────────────────────────────
const STAGE_PROBA = { devis_fait: 30, negociation: 50, devis_envoye: 70, gagne: 100, perdu: 0 };

async function syncPipeline(clientId, stage, montant, devisId, ldmId, userId, poolRef) {
  if (!clientId) return null;
  try {
    const [[existing]] = await poolRef.query(
      `SELECT id FROM opportunites WHERE client_id = ? AND statut NOT IN ('gagne','perdu') ORDER BY updatedAt DESC LIMIT 1`,
      [clientId]
    );
    const proba = STAGE_PROBA[stage] ?? 30;
    if (existing) {
      const sets = [`statut = ?`, `probabilite = ?`, `updatedAt = NOW()`];
      const vals = [stage, proba];
      if (montant != null) { sets.push('montantEstime = ?'); vals.push(montant); }
      if (devisId  != null) { sets.push('devis_id = ?');    vals.push(devisId); }
      if (ldmId    != null) { sets.push('ldm_id = ?');      vals.push(ldmId); }
      vals.push(existing.id);
      await poolRef.query(`UPDATE opportunites SET ${sets.join(', ')} WHERE id = ?`, vals);
      return existing.id;
    } else {
      const [[client]] = await poolRef.query('SELECT nom FROM clients WHERE id = ?', [clientId]);
      const titre = client?.nom || `Client #${clientId}`;
      const [r] = await poolRef.query(
        `INSERT INTO opportunites (client_id, titre, statut, montantEstime, probabilite, devis_id, ldm_id, cree_par)
         VALUES (?,?,?,?,?,?,?,?)`,
        [clientId, titre, stage, montant || null, proba, devisId || null, ldmId || null, userId || null]
      );
      return r.insertId;
    }
  } catch (e) {
    console.error('syncPipeline error:', e.message);
    return null;
  }
}

const { TAUX: TAUX_HORAIRES } = require('../utils/dimensionnement');

// ── Calcul local des lignes (avec support tauxOverrides depuis config) ────────
function calculerLignes(params, tauxOverrides = {}) {
  const {
    type_entite, regime_fiscal, regime_tva,
    factures_achat = 0, factures_vente = 0, lignes_banque = 0,
    immobilisations = 0, effectif = 0, operations_diverses = null,
  } = params;

  const isSociete     = type_entite === 'societe';
  const isAssociation = type_entite === 'association';
  const nb_decl_tva   = regime_tva === 'mensuel' ? 12 : regime_tva === 'trimestriel' ? 4 : 0;
  const od = operations_diverses !== null ? Number(operations_diverses) : Math.round((factures_achat + factures_vente) * 0.1);

  const tarif = (min, interv, libelle) => {
    const override = tauxOverrides[libelle];
    const taux = (override != null) ? override : (TAUX_HORAIRES[interv] || 42);
    return Math.round(((min / 60) * taux) * 100) / 100;
  };
  const ligne = (section, libelle, intervenant, periodicite, temps_minutes) => ({
    section, libelle, intervenant, periodicite,
    temps_minutes,
    tarif_ht: tarif(temps_minutes, intervenant, libelle),
    actif: true,
  });

  const lignes = [];

  // ─ TENUE COMPTABLE — réalisé par Collaborateur (taux spécifique possible)
  if (factures_achat > 0) {
    const m = Math.max(30, Math.round((factures_achat / 30) * 60));
    lignes.push(ligne('Tenue comptable', "Journaux d'achats", 'Collaborateur', 'Mensuel', m));
  }
  if (factures_vente > 0) {
    const m = Math.max(30, Math.round((factures_vente / 30) * 60));
    lignes.push(ligne('Tenue comptable', 'Journaux de ventes', 'Collaborateur', 'Mensuel', m));
  }
  if (lignes_banque > 0) {
    const m = Math.max(30, Math.round((lignes_banque / 60) * 60));
    lignes.push(ligne('Tenue comptable', 'Journaux de trésorerie', 'Collaborateur', 'Mensuel', m));
  }
  lignes.push(ligne('Tenue comptable', "Journaux d'OD", 'Collaborateur', 'Mensuel', Math.max(30, Math.round(od / 30 * 60))));

  // ─ DILIGENCES COMPTABLES
  lignes.push(ligne('Diligences comptables', 'Constitution dossier permanent',          'Collaborateur', 'Ponctuel Jan',      30));
  lignes.push(ligne('Diligences comptables', 'Collecte éléments dossier permanent',     'Collaborateur', 'Récurrent clôture', 30));
  lignes.push(ligne('Diligences comptables', 'Collecte pièces contrôle annuel',          'Collaborateur', 'Récurrent clôture', 60));
  lignes.push(ligne('Diligences comptables', 'Constitution dossier de contrôle annuel', 'Collaborateur', 'Récurrent clôture', 300));
  lignes.push(ligne('Diligences comptables', 'Constitution FEC exercice clos',           'Collaborateur', 'Ponctuel Jan',      5));
  lignes.push(ligne('Diligences comptables', 'Constitution FEC exercice en cours',       'Collaborateur', 'Ponctuel Jan',      5));
  lignes.push(ligne('Diligences comptables', 'Archivage FEC',                            'Collaborateur', 'Suite clôture',     5));
  lignes.push(ligne('Diligences comptables', 'Traitement des immobilisations',           'Collaborateur', 'Récurrent clôture', Math.max(5, immobilisations * 2)));
  lignes.push(ligne('Diligences comptables', 'Fournisseurs – factures non parvenues',    'Collaborateur', 'Récurrent clôture', 15));
  lignes.push(ligne('Diligences comptables', 'Clients – factures à établir',             'Collaborateur', 'Récurrent clôture', 15));
  lignes.push(ligne('Diligences comptables', 'État & organismes sociaux',                'Collaborateur', 'Récurrent clôture', 15));
  lignes.push(ligne('Diligences comptables', 'Divers à payer & à recevoir',              'Collaborateur', 'Récurrent clôture', 10));
  lignes.push(ligne('Diligences comptables', "Charges & produits constatés d'avance",   'Collaborateur', 'Récurrent clôture', 10));
  lignes.push(ligne('Diligences comptables', 'Bilan, Compte de résultat, Annexe',        'Collaborateur', 'Récurrent clôture', 240));
  lignes.push(ligne('Diligences comptables', 'Supervision du dossier',                   'Expert-comptable', 'Récurrent clôture', 60));
  lignes.push(ligne('Diligences comptables', 'Entretien annuel présentation comptes',    'Expert-comptable', 'Récurrent clôture', 90));
  lignes.push(ligne('Diligences comptables', 'Grand livre, Balance (×3)',                 'Collaborateur', 'Récurrent clôture', 45));

  // ─ FISCALITÉ
  if (regime_fiscal !== 'micro') {
    lignes.push(ligne('Fiscalité', 'Liasses fiscales', 'Collaborateur', 'Annuel', 120));
  }
  if (isSociete) {
    lignes.push(ligne('Fiscalité', 'Acomptes IS (×4)',             'Collaborateur', 'Trimestriel', 60));
    lignes.push(ligne('Fiscalité', 'Liquidation IS',               'Collaborateur', 'Annuel',      30));
    lignes.push(ligne('Fiscalité', 'Détermination résultat fiscal','Collaborateur', 'Annuel',      30));
  }
  if (!isAssociation) {
    lignes.push(ligne('Fiscalité', 'Déclaration annuelle CET', 'Collaborateur', 'Annuel', 30));
    lignes.push(ligne('Fiscalité', 'Contrôle avis CET',        'Collaborateur', 'Annuel', 30));
    lignes.push(ligne('Fiscalité', 'Demandes dégrèvements CET','Collaborateur', 'Annuel', 30));
  }
  if (nb_decl_tva > 0) {
    const min_tva = 20 * nb_decl_tva;
    const per_tva = regime_tva === 'mensuel' ? 'Mensuel' : 'Trimestriel';
    lignes.push(ligne('Fiscalité', `Déclarations TVA (×${nb_decl_tva})`, 'Collaborateur', per_tva, min_tva));
    lignes.push(ligne('Fiscalité', 'Contrôle TVA bilan',                 'Collaborateur', 'Annuel', 60));
  }
  if (effectif > 0 && !isAssociation) {
    lignes.push(ligne('Fiscalité', "Taxe d'apprentissage",   'Collaborateur Social', 'Annuel', 30));
  }
  if (effectif > 0) {
    lignes.push(ligne('Fiscalité', 'Formation professionnelle', 'Collaborateur Social', 'Annuel', 30));
  }
  lignes.push(ligne('Fiscalité', 'DAS2', 'Collaborateur', 'Annuel', 30));

  // ─ SOCIAL
  if (effectif > 0) {
    lignes.push(ligne('Social', `Bulletins de paie (×${effectif}×12)`, 'Collaborateur Social', 'Mensuel', 5 * effectif * 12));
    lignes.push(ligne('Social', `DSN mensuelle (×${effectif}×12)`,     'Collaborateur Social', 'Mensuel', 10 * effectif * 12));
    lignes.push(ligne('Social', 'Tableaux récap. nets imposables',      'Collaborateur Social', 'Annuel',  10));
    lignes.push(ligne('Social', 'Calcul IFC',                           'Collaborateur',        'Annuel',  30));
    lignes.push(ligne('Social', 'Registres légaux sociaux',             'Collaborateur Social', 'Annuel',  60));
  }

  // ─ JURIDIQUE
  if (isSociete || isAssociation) {
    lignes.push(ligne('Juridique', 'Rédaction AGO',  'Collaborateur Juridique', 'Annuel', 240));
    lignes.push(ligne('Juridique', 'Formalités AGO', 'Collaborateur Juridique', 'Annuel', 60));
  }

  return lignes;
}

async function loadTauxOverrides() {
  try {
    const [rows] = await pool.query(
      'SELECT libelle, taux_specifique FROM taches_dimensionnement_config WHERE actif = 1'
    );
    const map = {};
    rows.forEach(r => { map[r.libelle] = r.taux_specifique; });
    return map;
  } catch {
    return {};
  }
}

// ── GET /api/dimensionnement — liste ─────────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id, prospect_id } = req.query;
    let where = [];
    const params = [];
    if (client_id)   { where.push('d.client_id = ?');   params.push(client_id); }
    if (prospect_id) { where.push('d.prospect_id = ?'); params.push(prospect_id); }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await pool.query(
      `SELECT d.*,
         c.nom AS client_nom, c.siren AS client_siren,
         p.nom AS prospect_nom,
         u.prenom AS createur_prenom, u.nom AS createur_nom
       FROM dimensionnement d
       LEFT JOIN clients c      ON d.client_id   = c.id
       LEFT JOIN prospects p    ON d.prospect_id = p.id
       LEFT JOIN utilisateurs u ON d.created_by  = u.id
       ${wc}
       ORDER BY d.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/dimensionnement/:id — détail avec lignes ────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[dim]] = await pool.query(
      `SELECT d.*,
         c.nom AS client_nom, c.siren AS client_siren,
         p.nom AS prospect_nom
       FROM dimensionnement d
       LEFT JOIN clients c   ON d.client_id   = c.id
       LEFT JOIN prospects p ON d.prospect_id = p.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!dim) return res.status(404).json({ message: 'Dimensionnement non trouvé' });

    const [lignes] = await pool.query(
      'SELECT * FROM dimensionnement_lignes WHERE dimensionnement_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json({ ...dim, lignes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/dimensionnement — créer ────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      client_id, prospect_id, nom_client_libre, siren,
      type_entite, regime_fiscal, regime_tva, nb_etablissements,
      factures_achat, factures_vente, lignes_banque, immobilisations, effectif,
      operations_diverses,
      remise_pct, lignes: lignesInput
    } = req.body;

    // Calculer les lignes si non fournies
    const tauxOv = lignesInput ? {} : await loadTauxOverrides();
    const lignesCalc = lignesInput || calculerLignes({
      type_entite: type_entite || 'societe',
      regime_fiscal: regime_fiscal || 'reel_normal',
      regime_tva: regime_tva || 'mensuel',
      factures_achat: Number(factures_achat) || 0,
      factures_vente: Number(factures_vente) || 0,
      lignes_banque: Number(lignes_banque) || 0,
      immobilisations: Number(immobilisations) || 0,
      effectif: Number(effectif) || 0,
      operations_diverses: operations_diverses != null ? Number(operations_diverses) : null,
    }, tauxOv);

    const lignesActives = lignesCalc.filter(l => l.actif !== false);
    const total_ht = lignesActives.reduce((s, l) => s + Number(l.tarif_ht), 0);
    const remise   = Number(remise_pct) || 0;
    const total_ht_net = Math.round(total_ht * (1 - remise / 100) * 100) / 100;
    const total_ttc    = Math.round(total_ht_net * 1.20 * 100) / 100;

    const [r] = await pool.query(
      `INSERT INTO dimensionnement
         (client_id, prospect_id, nom_client_libre, siren,
          type_entite, regime_fiscal, regime_tva, nb_etablissements,
          factures_achat, factures_vente, lignes_banque, operations_diverses, immobilisations, effectif,
          total_ht, remise_pct, total_ht_net, total_ttc, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        client_id || null, prospect_id || null, nom_client_libre || null, siren || null,
        type_entite || 'societe', regime_fiscal || 'reel_normal', regime_tva || 'mensuel',
        Number(nb_etablissements) || 1,
        Number(factures_achat) || 0, Number(factures_vente) || 0,
        Number(lignes_banque) || 0,
        operations_diverses != null ? Number(operations_diverses) : Math.round((Number(factures_achat) + Number(factures_vente)) * 0.1),
        Number(immobilisations) || 0, Number(effectif) || 0,
        total_ht, remise, total_ht_net, total_ttc, req.user.id
      ]
    );
    const dimId = r.insertId;

    // Insérer les lignes
    if (lignesCalc.length > 0) {
      const vals = lignesCalc.map(l => [
        dimId, l.section || '', l.libelle, l.intervenant, l.periodicite || '',
        l.temps_minutes, l.tarif_ht, l.actif !== false ? 1 : 0
      ]);
      await pool.query(
        `INSERT INTO dimensionnement_lignes
           (dimensionnement_id, section, libelle, intervenant, periodicite, temps_minutes, tarif_ht, actif)
         VALUES ?`,
        [vals]
      );
    }

    res.status(201).json({ id: dimId, total_ht, total_ht_net, total_ttc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/dimensionnement/:id — modifier ───────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const {
      client_id, prospect_id, nom_client_libre, siren,
      type_entite, regime_fiscal, regime_tva, nb_etablissements,
      factures_achat, factures_vente, lignes_banque, operations_diverses, immobilisations, effectif,
      remise_pct, lignes: lignesInput, statut
    } = req.body;

    const [[dim]] = await pool.query('SELECT * FROM dimensionnement WHERE id = ?', [req.params.id]);
    if (!dim) return res.status(404).json({ message: 'Non trouvé' });

    const fields = [];
    const vals   = [];

    const set = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    set('client_id',           client_id   !== undefined ? (client_id   || null) : undefined);
    set('prospect_id',         prospect_id !== undefined ? (prospect_id || null) : undefined);
    set('nom_client_libre',    nom_client_libre);
    set('siren',               siren);
    set('type_entite',         type_entite);
    set('regime_fiscal',       regime_fiscal);
    set('regime_tva',          regime_tva);
    set('nb_etablissements',   nb_etablissements !== undefined ? Number(nb_etablissements) : undefined);
    set('factures_achat',      factures_achat   !== undefined ? Number(factures_achat)   : undefined);
    set('factures_vente',      factures_vente   !== undefined ? Number(factures_vente)   : undefined);
    set('lignes_banque',       lignes_banque    !== undefined ? Number(lignes_banque)    : undefined);
    set('operations_diverses', operations_diverses !== undefined ? Number(operations_diverses) : undefined);
    set('immobilisations',     immobilisations  !== undefined ? Number(immobilisations)  : undefined);
    set('effectif',            effectif         !== undefined ? Number(effectif)         : undefined);
    set('remise_pct',          remise_pct       !== undefined ? Number(remise_pct)       : undefined);
    set('statut',              statut);

    // Recalcul des totaux si lignes fournies
    if (lignesInput) {
      const actives = lignesInput.filter(l => l.actif !== false);
      const total_ht     = actives.reduce((s, l) => s + Number(l.tarif_ht), 0);
      const remise       = remise_pct !== undefined ? Number(remise_pct) : Number(dim.remise_pct);
      const total_ht_net = Math.round(total_ht * (1 - remise / 100) * 100) / 100;
      const total_ttc    = Math.round(total_ht_net * 1.20 * 100) / 100;
      set('total_ht',     total_ht);
      set('total_ht_net', total_ht_net);
      set('total_ttc',    total_ttc);

      // Supprimer et réinsérer les lignes
      await pool.query('DELETE FROM dimensionnement_lignes WHERE dimensionnement_id = ?', [req.params.id]);
      if (lignesInput.length > 0) {
        const rows = lignesInput.map(l => [
          req.params.id, l.section || '', l.libelle, l.intervenant, l.periodicite || '',
          l.temps_minutes, l.tarif_ht, l.actif !== false ? 1 : 0
        ]);
        await pool.query(
          `INSERT INTO dimensionnement_lignes
             (dimensionnement_id, section, libelle, intervenant, periodicite, temps_minutes, tarif_ht, actif)
           VALUES ?`,
          [rows]
        );
      }
    }

    if (fields.length > 0) {
      vals.push(req.params.id);
      await pool.query(`UPDATE dimensionnement SET ${fields.join(', ')} WHERE id = ?`, vals);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/dimensionnement/:id/send-devis ───────────────────────────────────
router.put('/:id/send-devis', verifyToken, async (req, res) => {
  try {
    await pool.query(
      "UPDATE dimensionnement SET statut = 'devis_envoye' WHERE id = ?",
      [req.params.id]
    );
    res.json({ ok: true, statut: 'devis_envoye' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/dimensionnement/:id/accept-devis ─────────────────────────────────
router.put('/:id/accept-devis', verifyToken, async (req, res) => {
  try {
    await pool.query(
      "UPDATE dimensionnement SET statut = 'accepte' WHERE id = ?",
      [req.params.id]
    );
    res.json({ ok: true, statut: 'accepte' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/dimensionnement/:id/sign-ldm — signe + injecte les tâches ────────
router.put('/:id/sign-ldm', verifyToken, async (req, res) => {
  try {
    const [[dim]] = await pool.query(
      'SELECT * FROM dimensionnement WHERE id = ?',
      [req.params.id]
    );
    if (!dim) return res.status(404).json({ message: 'Non trouvé' });

    // 1. Changer le statut
    await pool.query(
      "UPDATE dimensionnement SET statut = 'ldm_signee' WHERE id = ?",
      [req.params.id]
    );

    // 2. Récupérer les lignes actives
    const [lignes] = await pool.query(
      'SELECT * FROM dimensionnement_lignes WHERE dimensionnement_id = ? AND actif = 1',
      [req.params.id]
    );

    // 3. Mapper les intervenants vers les utilisateurs
    const intervenantToRole = {
      'Expert-comptable':        'expert',
      'Collaborateur':           'collaborateur',
      'Collaborateur Social':    'collaborateur',
      'Collaborateur Juridique': 'collaborateur',
    };

    // Mapping spécifique Juridique → Alison, Social → Gaëlle/Natalie
    const intervenantSpecial = {
      'Collaborateur Juridique': null, // sera résolu par nom
      'Collaborateur Social':    null,
    };

    // Récupérer un collaborateur par défaut
    const [[defaultCollab]] = await pool.query(
      "SELECT id FROM utilisateurs WHERE role = 'collaborateur' AND actif = 1 LIMIT 1"
    ).catch(() => [[null]]);
    const [[expert]] = await pool.query(
      "SELECT id FROM utilisateurs WHERE role = 'expert' AND actif = 1 LIMIT 1"
    ).catch(() => [[null]]);

    // Collaborateurs sociaux (Gaëlle, Natalie)
    const [socials] = await pool.query(
      "SELECT id FROM utilisateurs WHERE actif = 1 AND (prenom IN ('Gaëlle','Natalie') OR role = 'collaborateur') LIMIT 2"
    ).catch(() => [[]]);
    const socialId = socials[0]?.id || defaultCollab?.id || 1;

    // Collaborateur juridique (Alison)
    const [[juridique]] = await pool.query(
      "SELECT id FROM utilisateurs WHERE actif = 1 AND prenom = 'Alison' LIMIT 1"
    ).catch(() => [[null]]);
    const juridiqueId = juridique?.id || defaultCollab?.id || 1;

    const clientId    = dim.client_id;
    const echeanceStr = new Date().toISOString().slice(0, 10);
    let tachesCreees  = 0;

    for (const l of lignes) {
      let userId;
      if (l.intervenant === 'Expert-comptable')      userId = expert?.id || 1;
      else if (l.intervenant === 'Collaborateur Social')   userId = socialId;
      else if (l.intervenant === 'Collaborateur Juridique') userId = juridiqueId;
      else                                           userId = defaultCollab?.id || 1;

      await pool.query(
        `INSERT INTO taches
           (client_id, utilisateur_id, titre, description, date_echeance, source, origine,
            priorite, budget_minutes, periodicite, dimensionnement_ligne_id, assigne_par)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          clientId || null,
          userId,
          l.libelle,
          `[${l.section}] ${l.libelle} — ${l.periodicite || ''}`,
          echeanceStr,
          'manuelle',
          'ldm',
          'normale',
          l.temps_minutes,
          l.periodicite || null,
          l.id,
          req.user.id,
        ]
      ).catch(() => {});
      tachesCreees++;
    }

    // 4. Si prospect, convertir en client
    if (dim.prospect_id && !dim.client_id) {
      await pool.query(
        "UPDATE prospects SET statut = 'client_converti' WHERE id = ?",
        [dim.prospect_id]
      ).catch(() => {});
    }

    res.json({ ok: true, statut: 'ldm_signee', tachesCreees });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/dimensionnement/:id/to-devis ───────────────────────────────────
router.post('/:id/to-devis', verifyToken, async (req, res) => {
  try {
    const [[dim]] = await pool.query(
      `SELECT d.*, c.nom AS client_nom
       FROM dimensionnement d
       LEFT JOIN clients c ON d.client_id = c.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!dim) return res.status(404).json({ message: 'Dimensionnement non trouvé' });

    // If devis already linked, return it
    if (dim.devis_id) {
      const [[existing]] = await pool.query('SELECT id, numero FROM devis WHERE id = ?', [dim.devis_id]).catch(() => [[null]]);
      return res.json({ id: dim.devis_id, numero: existing?.numero, alreadyExists: true });
    }

    // Generate DEV-YYYY-NNN numero
    const year = new Date().getFullYear();
    const [devRows] = await pool.query(
      `SELECT numero FROM devis WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
      [`DEV-${year}-%`]
    );
    const seq = devRows.length ? parseInt(devRows[0].numero.split('-').pop(), 10) + 1 : 1;
    const numero = `DEV-${year}-${String(seq).padStart(3, '0')}`;

    // Get dimensionnement lignes
    const [lignes] = await pool.query(
      'SELECT * FROM dimensionnement_lignes WHERE dimensionnement_id = ?',
      [req.params.id]
    );

    const activeLignes = lignes.filter(l => l.actif);
    const total_ht     = activeLignes.reduce((s, l) => s + Number(l.tarif_ht), 0);
    const remise       = Number(dim.remise_pct) || 0;
    const total_ht_net = dim.total_ht_net || Math.round(total_ht * (1 - remise / 100) * 100) / 100;
    const total_ttc    = dim.total_ttc    || Math.round(total_ht_net * 1.20 * 100) / 100;
    const tva          = Math.round(total_ht_net * 0.20 * 100) / 100;

    // Insert devis
    const [devisResult] = await pool.query(
      `INSERT INTO devis
         (numero, client_id, contactId, titre,
          type_entite, regime_fiscal, regime_tva, nb_etablissements,
          factures_achat, factures_vente, lignes_banque, operations_diverses, immobilisations, effectif,
          totalHT, tauxTVA, totalTVA, totalTTC, total_ht_net, remise_pct,
          statut, cree_par)
       VALUES (?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,20,?,?,?,?,?,?)`,
      [
        numero,
        dim.client_id || null,
        `Mission ${dim.client_nom || dim.nom_client_libre || 'client'}`,
        dim.type_entite, dim.regime_fiscal, dim.regime_tva,
        dim.nb_etablissements || 1,
        dim.factures_achat || 0, dim.factures_vente || 0,
        dim.lignes_banque || 0,
        dim.operations_diverses != null ? dim.operations_diverses : Math.round(((dim.factures_achat || 0) + (dim.factures_vente || 0)) * 0.1),
        dim.immobilisations || 0, dim.effectif || 0,
        total_ht, tva, total_ttc, total_ht_net, remise,
        'brouillon', req.user.id,
      ]
    );
    const devisId = devisResult.insertId;

    // Copy dimensionnement_lignes → lignes_devis
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      await pool.query(
        `INSERT INTO lignes_devis
           (devisId, ordre, description, quantite, prixUnitaireHT, remisePct, totalHT,
            rubrique, section, intervenant, periodicite, temps_minutes, tarif_ht, actif)
         VALUES (?,?,?,1,?,0,?,?,?,?,?,?,?,?)`,
        [
          devisId, i, l.libelle, l.tarif_ht, l.tarif_ht,
          l.libelle, l.section, l.intervenant, l.periodicite,
          l.temps_minutes, l.tarif_ht, l.actif ? 1 : 0,
        ]
      ).catch(() => {});
    }

    // Update dimensionnement
    await pool.query(
      `UPDATE dimensionnement SET devis_id = ?, statut = 'devis_envoye' WHERE id = ?`,
      [devisId, req.params.id]
    );

    // Sync pipeline
    if (dim.client_id) {
      const opportuniteId = await syncPipeline(dim.client_id, 'devis_fait', total_ht_net, devisId, null, req.user.id, pool);
      if (opportuniteId) {
        await pool.query('UPDATE devis SET opportunite_id = ? WHERE id = ?', [opportuniteId, devisId]).catch(() => {});
      }
    }

    res.json({ id: devisId, numero });
  } catch (err) {
    console.error('to-devis error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/dimensionnement/:id/to-ldm ─────────────────────────────────────
router.post('/:id/to-ldm', verifyToken, async (req, res) => {
  try {
    const [[dim]] = await pool.query(
      `SELECT d.*, c.nom AS client_nom
       FROM dimensionnement d
       LEFT JOIN clients c ON d.client_id = c.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!dim) return res.status(404).json({ message: 'Dimensionnement non trouvé' });

    // If LDM already linked, return it
    if (dim.ldm_id) {
      const [[existing]] = await pool.query('SELECT id, numero FROM lettres_mission WHERE id = ?', [dim.ldm_id]).catch(() => [[null]]);
      return res.json({ id: dim.ldm_id, numero: existing?.numero, alreadyExists: true });
    }

    // Generate LM-YYYY-NNN numero
    const year = new Date().getFullYear();
    const [ldmRows] = await pool.query(
      `SELECT numero FROM lettres_mission WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`,
      [`LM-${year}-%`]
    );
    const seq = ldmRows.length ? parseInt(ldmRows[0].numero.split('-').pop(), 10) + 1 : 1;
    const numero = `LM-${year}-${String(seq).padStart(3, '0')}`;

    const montant = Number(dim.total_ht_net || dim.total_ht || 0);
    const clientNom = dim.client_nom || dim.nom_client_libre || 'client';

    const [ldmResult] = await pool.query(
      `INSERT INTO lettres_mission
         (numero, client_id, contactId, dimensionnement_id, statut,
          typeMission, objetMission, montantHonorairesHT, montant_annuel_ht)
       VALUES (?,?,1,?,'brouillon','autre',?,?,?)`,
      [
        numero,
        dim.client_id || null,
        dim.id,
        `Mission comptable — ${clientNom}`,
        montant,
        montant,
      ]
    );
    const ldmId = ldmResult.insertId;

    // Update dimensionnement
    await pool.query(
      `UPDATE dimensionnement SET ldm_id = ? WHERE id = ?`,
      [ldmId, req.params.id]
    );

    // Sync pipeline
    if (dim.client_id) {
      await syncPipeline(dim.client_id, 'devis_envoye', montant, null, ldmId, req.user.id, pool);
    }

    res.json({ id: ldmId, numero });
  } catch (err) {
    console.error('to-ldm error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/dimensionnement/:id ───────────────────────────────────────────
router.delete('/:id', verifyToken, requireRole(['expert', 'chef_mission']), async (req, res) => {
  try {
    await pool.query('DELETE FROM dimensionnement_lignes WHERE dimensionnement_id = ?', [req.params.id]);
    await pool.query('DELETE FROM dimensionnement WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/dimensionnement/recalcul — recalcul sans persistance ────────────
router.post('/recalcul', verifyToken, async (req, res) => {
  try {
    const tauxOv = await loadTauxOverrides();
    const lignes = calculerLignes(req.body, tauxOv);
    const total_ht  = lignes.reduce((s, l) => s + l.tarif_ht, 0);
    res.json({ lignes, total_ht });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
