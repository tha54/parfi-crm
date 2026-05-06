'use strict';
const express = require('express');
const router = express.Router();
const pool   = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const MIN_PAR_JOUR = 420; // 7 h × 60

// ─── Helpers dates ───────────────────────────────────────────────────────────

function fmtD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toStr(v) {
  return v instanceof Date ? fmtD(v) : String(v);
}

function countWorkingDays(debut, fin, feriesSet) {
  let count = 0;
  const d = new Date(debut + 'T12:00:00');
  const f = new Date(fin   + 'T12:00:00');
  while (d <= f) {
    const dow = d.getDay();
    if (dow > 0 && dow < 6 && !feriesSet.has(fmtD(d))) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// ─── Périodes ────────────────────────────────────────────────────────────────

function buildPeriodes(granularity) {
  const today = new Date();
  const periodes = [];

  if (granularity === 'semaine') {
    const dow = today.getDay() || 7;
    const mon = new Date(today);
    mon.setDate(today.getDate() - dow + 1);
    mon.setHours(0, 0, 0, 0);
    for (let i = 0; i < 12; i++) {
      const debut = new Date(mon); debut.setDate(mon.getDate() + i * 7);
      const fin   = new Date(debut); fin.setDate(debut.getDate() + 6);
      // ISO week number
      const tmp = new Date(debut);
      const ys  = new Date(tmp.getFullYear(), 0, 1);
      const wk  = Math.ceil(((tmp - ys) / 86400000 + ys.getDay() + 1) / 7);
      periodes.push({
        key:      fmtD(debut),
        label:    `S${wk}`,
        sublabel: debut.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        debut:    fmtD(debut),
        fin:      fmtD(fin),
      });
    }
  } else if (granularity === 'mois') {
    for (let i = 0; i < 12; i++) {
      const d   = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      periodes.push({
        key:      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label:    d.toLocaleDateString('fr-FR', { month: 'short' }),
        sublabel: String(d.getFullYear()),
        debut:    fmtD(d),
        fin:      fmtD(fin),
      });
    }
  } else {
    for (let i = 0; i < 2; i++) {
      const y = today.getFullYear() + i;
      periodes.push({ key: String(y), label: String(y), sublabel: '', debut: `${y}-01-01`, fin: `${y}-12-31` });
    }
  }
  return periodes;
}

function dateInPeriode(dateStr, p) {
  return dateStr >= p.debut && dateStr <= p.fin;
}

// ─── Route principale ─────────────────────────────────────────────────────────

router.get('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const granularity = ['semaine', 'mois', 'annee'].includes(req.query.granularity)
      ? req.query.granularity : 'mois';
    const periodes  = buildPeriodes(granularity);
    const dateMin   = periodes[0].debut;
    const dateMax   = periodes[periodes.length - 1].fin;

    const [collabs] = await pool.query(
      `SELECT id, prenom, nom, role, role_metier
       FROM utilisateurs
       WHERE actif = 1 AND role != 'client'
       ORDER BY FIELD(COALESCE(role_metier,''),
         'expert_comptable','chef_de_groupe','chef_de_mission',
         'collaborateur','collaborateur_social','collaborateur_juridique'), nom`
    );

    const [taches] = await pool.query(
      `SELECT utilisateur_id, date_echeance, budget_minutes
       FROM taches
       WHERE statut != 'termine'
         AND budget_minutes > 0
         AND budget_minutes IS NOT NULL
         AND utilisateur_id IS NOT NULL
         AND date_echeance BETWEEN ? AND ?`,
      [dateMin, dateMax]
    );

    const [feriesRows] = await pool.query(
      `SELECT date FROM jours_feries WHERE date BETWEEN ? AND ?`,
      [dateMin, dateMax]
    );
    const feriesSet = new Set(feriesRows.map(r => toStr(r.date)));

    const [absences] = await pool.query(
      `SELECT utilisateur_id, date_debut, date_fin
       FROM absences
       WHERE statut = 'validee' AND date_fin >= ? AND date_debut <= ?`,
      [dateMin, dateMax]
    );

    // Normaliser les dates
    const tachesN = taches.map(t => ({ ...t, date_echeance: toStr(t.date_echeance) }));
    const absN    = absences.map(a => ({ ...a, date_debut: toStr(a.date_debut), date_fin: toStr(a.date_fin) }));

    // Capacité par période (commune à tous les collabs — absences déduites ensuite)
    const capBaseParPeriode = periodes.map(p => ({
      key:     p.key,
      minutes: countWorkingDays(p.debut, p.fin, feriesSet) * MIN_PAR_JOUR,
      debut:   p.debut,
      fin:     p.fin,
    }));

    const collaborateurs = collabs.map(collab => {
      const absCollab = absN.filter(a => a.utilisateur_id === collab.id);

      const periodesData = periodes.map((p, idx) => {
        const tachesPeriode = tachesN.filter(t =>
          t.utilisateur_id === collab.id && dateInPeriode(t.date_echeance, p)
        );
        const budget_minutes = tachesPeriode.reduce((s, t) => s + Number(t.budget_minutes), 0);
        const nb_taches      = tachesPeriode.length;

        // Capacité = base - absences overlapping
        let capacite_minutes = capBaseParPeriode[idx].minutes;
        for (const abs of absCollab) {
          const od = abs.date_debut > p.debut ? abs.date_debut : p.debut;
          const of_ = abs.date_fin  < p.fin   ? abs.date_fin  : p.fin;
          if (od <= of_) capacite_minutes -= countWorkingDays(od, of_, feriesSet) * MIN_PAR_JOUR;
        }
        capacite_minutes = Math.max(0, capacite_minutes);

        const taux_charge = capacite_minutes > 0
          ? Math.round((budget_minutes / capacite_minutes) * 1000) / 10
          : budget_minutes > 0 ? 999 : 0;

        return { key: p.key, budget_minutes, capacite_minutes, nb_taches, taux_charge };
      });

      return {
        id: collab.id, prenom: collab.prenom, nom: collab.nom,
        role: collab.role, role_metier: collab.role_metier,
        periodes: periodesData,
        total_budget_minutes: periodesData.reduce((s, p) => s + p.budget_minutes, 0),
        max_taux: Math.max(...periodesData.map(p => p.taux_charge || 0)),
      };
    });

    res.json({
      granularity,
      periodes: periodes.map(p => ({ key: p.key, label: p.label, sublabel: p.sublabel, debut: p.debut, fin: p.fin })),
      collaborateurs,
    });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── Détail d'une cellule ────────────────────────────────────────────────────

router.get('/detail', verifyToken, async (req, res) => {
  const { userId, debut, fin } = req.query;
  if (!userId || !debut || !fin)
    return res.status(400).json({ message: 'userId, debut, fin requis' });
  try {
    const [taches] = await pool.query(
      `SELECT
         t.id, t.titre, t.description, t.date_echeance,
         t.budget_minutes, t.statut, t.priorite,
         t.origine, t.type_travail, t.periodicite,
         c.nom  AS client_nom,
         lmm.libelle AS mission_libelle,
         lm.numero   AS ldm_numero
       FROM taches t
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN ldm_missions lmm ON t.dimensionnement_ligne_id = lmm.id
       LEFT JOIN lettres_mission lm ON lmm.lettre_mission_id = lm.id
       WHERE t.utilisateur_id = ?
         AND t.statut != 'termine'
         AND t.budget_minutes > 0
         AND t.budget_minutes IS NOT NULL
         AND t.date_echeance BETWEEN ? AND ?
       ORDER BY t.date_echeance, t.priorite DESC`,
      [userId, debut, fin]
    );
    res.json(taches);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

module.exports = router;
