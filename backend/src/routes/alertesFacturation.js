'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodStart(modalite) {
  const d = new Date();
  switch (modalite) {
    case 'trimestrielle': return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    case 'semestrielle':  return new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1);
    case 'annuelle':      return new Date(d.getFullYear(), 0, 1);
    default:              return new Date(d.getFullYear(), d.getMonth(), 1); // mensuelle
  }
}

function getDaysLimit(modalite) {
  switch (modalite) {
    case 'trimestrielle': return 95;
    case 'semestrielle':  return 185;
    case 'annuelle':      return 370;
    default:              return 35; // mensuelle — légère marge sur 31j
  }
}

function getPeriodsPerYear(modalite) {
  switch (modalite) {
    case 'trimestrielle': return 4;
    case 'semestrielle':  return 2;
    case 'annuelle':      return 1;
    default:              return 12;
  }
}

function fmtMoney(val) {
  return val.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
}

function fmtMinutes(min) {
  const h = Math.floor(min / 60); const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// ─── GET / — alertes facturation ────────────────────────────────────────────

router.get('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    // 1a. Clients avec LDM active et budget > 0
    const [ldmRows] = await pool.query(`
      SELECT c.id AS client_id, c.nom AS client_nom,
        COALESCE(
          (SELECT lm2.modaliteFacturation
           FROM lettres_mission lm2
           WHERE lm2.client_id = c.id
             AND lm2.statut IN ('signee','active')
             AND (lm2.date_resiliation IS NULL OR lm2.date_resiliation > CURDATE())
             AND COALESCE(lm2.montant_annuel_ht, lm2.montantHonorairesHT, 0) > 0
           ORDER BY COALESCE(lm2.montant_annuel_ht, lm2.montantHonorairesHT) DESC
           LIMIT 1),
          'mensuelle'
        ) AS modalite,
        (SELECT MAX(COALESCE(lm2.montant_annuel_ht, lm2.montantHonorairesHT, 0))
         FROM lettres_mission lm2
         WHERE lm2.client_id = c.id
           AND lm2.statut IN ('signee','active')
           AND (lm2.date_resiliation IS NULL OR lm2.date_resiliation > CURDATE())
        ) AS budget_annuel
      FROM clients c
      WHERE c.actif = 1
        AND EXISTS (
          SELECT 1 FROM lettres_mission lm
          WHERE lm.client_id = c.id
            AND lm.statut IN ('signee','active')
            AND (lm.date_resiliation IS NULL OR lm.date_resiliation > CURDATE())
            AND COALESCE(lm.montant_annuel_ht, lm.montantHonorairesHT, 0) > 0
        )
      ORDER BY c.nom
    `);

    // 1b. Clients SANS LDM active mais avec budget manuel saisi
    const [manualRows] = await pool.query(`
      SELECT c.id AS client_id, c.nom AS client_nom,
        COALESCE(c.periodicite_facturation, 'mensuelle') AS modalite,
        c.budget_honoraires AS budget_annuel
      FROM clients c
      WHERE c.actif = 1
        AND c.budget_honoraires > 0
        AND (c.date_fin_mission IS NULL OR c.date_fin_mission >= CURDATE())
        AND NOT EXISTS (
          SELECT 1 FROM lettres_mission lm
          WHERE lm.client_id = c.id
            AND lm.statut IN ('signee','active')
            AND (lm.date_resiliation IS NULL OR lm.date_resiliation > CURDATE())
            AND COALESCE(lm.montant_annuel_ht, lm.montantHonorairesHT, 0) > 0
        )
      ORDER BY c.nom
    `);

    const allRows = [...ldmRows, ...manualRows];
    if (allRows.length === 0) return res.json([]);

    const clientIds = allRows.map(r => r.client_id);

    // 2. Factures non annulées / non brouillon pour ces clients
    const [factures] = await pool.query(`
      SELECT client_id, totalHT, dateEmission
      FROM factures
      WHERE client_id IN (?)
        AND statut NOT IN ('brouillon','annulee')
        AND dateEmission IS NOT NULL
      ORDER BY dateEmission DESC
    `, [clientIds]);

    // 3. Temps saisi vs budget tâches, année courante
    const [tempRows] = await pool.query(`
      SELECT t.client_id,
        SUM(tt.duree_minutes)  AS saisi_min,
        SUM(t.budget_minutes)  AS budget_min
      FROM taches t
      JOIN tache_temps tt ON tt.tache_id = t.id AND tt.statut != 'rejetee'
      WHERE t.client_id IN (?)
        AND YEAR(tt.date_travail) = YEAR(CURDATE())
      GROUP BY t.client_id
    `, [clientIds]);

    // 4. Attributions (responsable en priorité) pour nommer le collaborateur
    const [attribs] = await pool.query(`
      SELECT a.client_id, a.role_sur_dossier, u.prenom, u.nom AS u_nom
      FROM attributions a
      JOIN utilisateurs u ON u.id = a.utilisateur_id
      WHERE a.client_id IN (?)
      ORDER BY a.client_id,
        CASE a.role_sur_dossier WHEN 'responsable' THEN 0 ELSE 1 END,
        u.nom
    `, [clientIds]);

    // ── Index
    const facturesByClient = {};
    for (const f of factures) {
      if (!facturesByClient[f.client_id]) facturesByClient[f.client_id] = [];
      facturesByClient[f.client_id].push({
        ht: parseFloat(f.totalHT),
        date: new Date(f.dateEmission),
      });
    }
    const tempsByClient = {};
    for (const t of tempRows) {
      tempsByClient[t.client_id] = {
        saisi: parseInt(t.saisi_min || 0),
        budget: parseInt(t.budget_min || 0),
      };
    }
    const attribsByClient = {};
    for (const a of attribs) {
      if (!attribsByClient[a.client_id]) attribsByClient[a.client_id] = [];
      attribsByClient[a.client_id].push(a);
    }

    // ── Calcul des alertes
    const now = new Date();
    const nowYear = now.getFullYear();
    const alertes = [];

    for (const row of allRows) {
      const { client_id, client_nom, modalite, budget_annuel } = row;
      const budget = parseFloat(budget_annuel);
      if (!budget || budget <= 0) continue;

      // Collaborateur affiché : premier responsable, sinon premier assistant
      const attribs_c = attribsByClient[client_id] || [];
      const resp = attribs_c.find(a => a.role_sur_dossier === 'responsable');
      const asst = attribs_c.find(a => a.role_sur_dossier === 'assistant');
      const collab = resp || asst;
      const collabNom = collab ? `${collab.prenom} ${collab.u_nom}` : '—';

      const clientFactures = facturesByClient[client_id] || [];
      const lastDate = clientFactures.length > 0 ? clientFactures[0].date : null;
      const daysLimit = getDaysLimit(modalite);
      const daysSince = lastDate ? Math.ceil((now - lastDate) / 86400000) : null;

      // ── Alerte 1 : non facturé
      const isNonFacture = !lastDate || daysSince > daysLimit;
      if (isNonFacture) {
        alertes.push({
          type: 'non_facture',
          client_id, client_nom, modalite, budget, collaborateur: collabNom,
          ecart: !lastDate ? 'Jamais facturé' : `${daysSince}j sans facturation`,
        });
      }

      // ── Alerte 2 : sous-facturation (seulement si a facturé récemment)
      if (!isNonFacture) {
        const periodStart  = getPeriodStart(modalite);
        const periodsPerYear = getPeriodsPerYear(modalite);
        const expectedPeriod = budget / periodsPerYear;
        const facturePeriode = clientFactures
          .filter(f => f.date >= periodStart)
          .reduce((s, f) => s + f.ht, 0);
        if (facturePeriode < expectedPeriod) {
          const ecartVal = expectedPeriod - facturePeriode;
          alertes.push({
            type: 'sous_facturation',
            client_id, client_nom, modalite, budget, collaborateur: collabNom,
            ecart: `${fmtMoney(ecartVal)} manquants`,
          });
        }
      }

      // ── Alerte 3 : dépassement (montant facturé vs budget annuel)
      const totalAnnee = clientFactures
        .filter(f => f.date.getFullYear() === nowYear)
        .reduce((s, f) => s + f.ht, 0);
      if (totalAnnee > budget) {
        alertes.push({
          type: 'depassement',
          client_id, client_nom, modalite, budget, collaborateur: collabNom,
          ecart: `+${fmtMoney(totalAnnee - budget)} vs budget`,
        });
      }

      // ── Alerte 3b : dépassement temps
      const { saisi = 0, budget: budgetMin = 0 } = tempsByClient[client_id] || {};
      if (budgetMin > 0 && saisi > budgetMin) {
        alertes.push({
          type: 'depassement_temps',
          client_id, client_nom, modalite, budget, collaborateur: collabNom,
          ecart: `+${fmtMinutes(saisi - budgetMin)} vs budget tâches`,
        });
      }
    }

    res.json(alertes);
  } catch (e) {
    console.error('[alertes-facturation]', e.message);
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

module.exports = router;
