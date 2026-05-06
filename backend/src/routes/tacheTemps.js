'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDateStr(v) {
  if (!v) return null;
  if (v instanceof Date) return fmtD(v);
  return String(v).split('T')[0];
}

async function recalcTemps(tacheId) {
  await pool.query(
    `UPDATE taches SET temps_passe_minutes = (
       SELECT COALESCE(SUM(duree_minutes), 0)
       FROM tache_temps WHERE tache_id = ? AND statut != 'rejetee'
     ) WHERE id = ?`,
    [tacheId, tacheId]
  );
}

// ─── GET /tache/:id — entries + budget (used by TaskTimePanel) ────────────────

router.get('/tache/:id', verifyToken, async (req, res) => {
  try {
    const [[task]] = await pool.query(
      'SELECT budget_minutes FROM taches WHERE id = ?', [req.params.id]
    );
    if (!task) return res.status(404).json({ message: 'Tâche introuvable' });

    const [entries] = await pool.query(
      `SELECT tt.*, u.prenom, u.nom AS user_nom
       FROM tache_temps tt
       JOIN utilisateurs u ON tt.utilisateur_id = u.id
       WHERE tt.tache_id = ?
       ORDER BY tt.date_travail DESC, tt.created_at DESC
       LIMIT 30`,
      [req.params.id]
    );

    const normalized = entries.map(e => ({ ...e, date_travail: toDateStr(e.date_travail) }));
    const consumed = normalized
      .filter(e => e.statut !== 'rejetee')
      .reduce((s, e) => s + (e.duree_minutes || 0), 0);

    let budget = null;
    if (task.budget_minutes > 0) {
      const pct = Math.round((consumed / task.budget_minutes) * 100);
      budget = {
        budgetMinutes: task.budget_minutes,
        consumedMinutes: consumed,
        percent: pct,
        status: pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok',
      };
    }

    res.json({ entries: normalized, budget, activeTimer: null });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── POST /tache/:id — create entry ──────────────────────────────────────────

router.post('/tache/:id', verifyToken, async (req, res) => {
  const { duree_minutes, commentaire, date_travail, source = 'feuille_temps' } = req.body;
  const tacheId = req.params.id;

  if (!duree_minutes || Number(duree_minutes) <= 0)
    return res.status(400).json({ message: 'Durée invalide' });

  const date = date_travail || fmtD(new Date());
  const src = ['chrono', 'feuille_temps', 'correction'].includes(source) ? source : 'feuille_temps';

  try {
    const [result] = await pool.query(
      `INSERT INTO tache_temps (tache_id, utilisateur_id, date_travail, duree_minutes, commentaire, source, statut)
       VALUES (?, ?, ?, ?, ?, ?, 'brouillon')`,
      [tacheId, req.user.id, date, Number(duree_minutes), commentaire?.trim() || null, src]
    );
    await recalcTemps(tacheId);
    res.status(201).json({ id: result.insertId, message: 'Entrée ajoutée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── PUT /:id — update brouillon entry ───────────────────────────────────────

router.put('/:id', verifyToken, async (req, res) => {
  const { duree_minutes, commentaire, date_travail } = req.body;
  try {
    const [[entry]] = await pool.query('SELECT * FROM tache_temps WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ message: 'Entrée introuvable' });
    if (entry.utilisateur_id !== req.user.id)
      return res.status(403).json({ message: 'Non autorisé' });
    if (entry.statut !== 'brouillon')
      return res.status(400).json({ message: 'Impossible de modifier une saisie figée ou validée' });

    const mins = duree_minutes != null ? Number(duree_minutes) : null;
    if (mins != null && mins <= 0)
      return res.status(400).json({ message: 'Durée invalide' });

    await pool.query(
      `UPDATE tache_temps SET
         duree_minutes = COALESCE(?, duree_minutes),
         commentaire = ?,
         date_travail = COALESCE(?, date_travail),
         updated_at = NOW()
       WHERE id = ?`,
      [mins, commentaire?.trim() ?? null, date_travail || null, req.params.id]
    );
    await recalcTemps(entry.tache_id);
    res.json({ message: 'Entrée modifiée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── POST /:id/valider — manager validates ────────────────────────────────────

router.post('/:id/valider', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[entry]] = await pool.query('SELECT * FROM tache_temps WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ message: 'Entrée introuvable' });
    if (!['brouillon', 'figee'].includes(entry.statut))
      return res.status(400).json({ message: 'Cette saisie ne peut pas être validée' });

    await pool.query(
      `UPDATE tache_temps SET statut='validee', validee_par=?, validee_le=NOW(), updated_at=NOW() WHERE id = ?`,
      [req.user.id, req.params.id]
    );
    await recalcTemps(entry.tache_id);
    res.json({ message: 'Saisie validée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── POST /:id/rejeter ────────────────────────────────────────────────────────

router.post('/:id/rejeter', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { motif } = req.body;
  if (!motif?.trim()) return res.status(400).json({ message: 'Motif requis' });
  try {
    const [[entry]] = await pool.query('SELECT * FROM tache_temps WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ message: 'Entrée introuvable' });

    await pool.query(
      `UPDATE tache_temps SET statut='rejetee', validee_par=?, validee_le=NOW(), motif_rejet=?, updated_at=NOW() WHERE id = ?`,
      [req.user.id, motif.trim(), req.params.id]
    );
    await recalcTemps(entry.tache_id);
    res.json({ message: 'Saisie rejetée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── POST /valider-lot — validate multiple entries at once ────────────────────

router.post('/valider-lot', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ message: 'ids requis' });
  try {
    await pool.query(
      `UPDATE tache_temps SET statut='validee', validee_par=?, validee_le=NOW(), updated_at=NOW()
       WHERE id IN (?) AND statut IN ('brouillon','figee')`,
      [req.user.id, ids]
    );
    // Recalc all affected tasks
    const [affected] = await pool.query(
      'SELECT DISTINCT tache_id FROM tache_temps WHERE id IN (?)', [ids]
    );
    for (const r of affected) await recalcTemps(r.tache_id);
    res.json({ message: `${ids.length} saisie(s) validée(s)` });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── GET /feuille — weekly grid ───────────────────────────────────────────────

router.get('/feuille', verifyToken, async (req, res) => {
  const targetUserId = Number(req.query.userId || req.user.id);
  if (targetUserId !== req.user.id && !['expert', 'chef_mission'].includes(req.user.role))
    return res.status(403).json({ message: 'Non autorisé' });

  // Parse semaine param (YYYY-Www) or default to current week
  let monday;
  const semaineParam = req.query.semaine;
  if (semaineParam && /^\d{4}-W\d{2}$/.test(semaineParam)) {
    const [yr, wkStr] = semaineParam.split('-W');
    const year = Number(yr);
    const week = Number(wkStr);
    const jan4 = new Date(year, 0, 4);
    const w1Mon = new Date(jan4);
    w1Mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    monday = new Date(w1Mon);
    monday.setDate(w1Mon.getDate() + (week - 1) * 7);
    monday.setHours(0, 0, 0, 0);
  } else {
    const today = new Date();
    const dow = (today.getDay() + 6) % 7;
    monday = new Date(today);
    monday.setDate(today.getDate() - dow);
    monday.setHours(0, 0, 0, 0);
  }

  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const debut = fmtD(monday);
  const fin   = fmtD(sunday);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return fmtD(d);
  });

  try {
    // Tasks that have entries this week
    const [taches] = await pool.query(
      `SELECT DISTINCT t.id, t.titre, t.statut, t.budget_minutes, t.temps_passe_minutes,
         c.nom AS client_nom, c.id AS client_id
       FROM taches t
       JOIN tache_temps tt ON tt.tache_id = t.id AND tt.utilisateur_id = ? AND tt.date_travail BETWEEN ? AND ?
       LEFT JOIN clients c ON t.client_id = c.id
       ORDER BY c.nom, t.titre`,
      [targetUserId, debut, fin]
    );

    // All non-finished tasks for the user (for "ajouter une tâche" dropdown)
    const [tachesDisponibles] = await pool.query(
      `SELECT t.id, t.titre, c.nom AS client_nom
       FROM taches t
       LEFT JOIN clients c ON t.client_id = c.id
       WHERE t.utilisateur_id = ? AND t.statut != 'termine'
       ORDER BY c.nom, t.titre`,
      [targetUserId]
    );

    // Entries for this week
    const [entries] = await pool.query(
      `SELECT * FROM tache_temps
       WHERE utilisateur_id = ? AND date_travail BETWEEN ? AND ?`,
      [targetUserId, debut, fin]
    );

    const entryNorm = entries.map(e => ({ ...e, date_travail: toDateStr(e.date_travail) }));

    const lignes = taches.map(t => {
      const taskEntries = entryNorm.filter(e => e.tache_id === t.id);
      const entreesByDate = {};
      for (const d of dates) {
        const e = taskEntries.find(e => e.date_travail === d);
        entreesByDate[d] = e ? {
          id: e.id, duree_minutes: e.duree_minutes,
          statut: e.statut, commentaire: e.commentaire, source: e.source,
        } : null;
      }
      return { tache: t, entrees: entreesByDate };
    });

    // Global week statut
    let statut_global = 'brouillon';
    if (entryNorm.length > 0) {
      const counts = entryNorm.reduce((a, e) => { a[e.statut] = (a[e.statut] || 0) + 1; return a; }, {});
      if (!counts.brouillon && !counts.figee && !counts.rejetee && counts.validee) statut_global = 'validee';
      else if (!counts.brouillon && !counts.figee && counts.rejetee)               statut_global = 'rejetee';
      else if (counts.figee || counts.validee)                                      statut_global = 'figee';
    }

    // ISO week label
    const isoWeek = (() => {
      const d = new Date(monday);
      d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
      const w1 = new Date(d.getFullYear(), 0, 4);
      return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
    })();
    const semaine = `${monday.getFullYear()}-W${String(isoWeek).padStart(2, '0')}`;

    // Day totals
    const totaux_par_jour = {};
    for (const d of dates) {
      totaux_par_jour[d] = entryNorm
        .filter(e => e.date_travail === d && e.statut !== 'rejetee')
        .reduce((s, e) => s + (e.duree_minutes || 0), 0);
    }
    const total_semaine = Object.values(totaux_par_jour).reduce((s, v) => s + v, 0);

    res.json({
      semaine, debut, fin, dates, statut_global, lignes,
      totaux_par_jour, total_semaine,
      taches_disponibles: tachesDisponibles,
    });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── GET /a-valider — manager: entries pending validation ─────────────────────

router.get('/a-valider', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [entries] = await pool.query(
      `SELECT tt.*,
         u.prenom, u.nom AS user_nom,
         t.titre AS tache_titre,
         c.nom AS client_nom
       FROM tache_temps tt
       JOIN utilisateurs u ON tt.utilisateur_id = u.id
       JOIN taches t ON tt.tache_id = t.id
       LEFT JOIN clients c ON t.client_id = c.id
       WHERE tt.statut IN ('brouillon','figee')
       ORDER BY tt.utilisateur_id, tt.date_travail DESC`
    );

    const normalized = entries.map(e => ({ ...e, date_travail: toDateStr(e.date_travail) }));

    // Group by collab + ISO week
    const grouped = {};
    for (const e of normalized) {
      const d = new Date(e.date_travail + 'T12:00:00');
      const dow = (d.getDay() + 6) % 7;
      const mon = new Date(d); mon.setDate(d.getDate() - dow);
      const monStr = fmtD(mon);
      const key = `${e.utilisateur_id}_${monStr}`;
      if (!grouped[key]) grouped[key] = {
        collab: { id: e.utilisateur_id, prenom: e.prenom, nom: e.user_nom },
        semaine_debut: monStr,
        entries: [],
        total_minutes: 0,
      };
      grouped[key].entries.push(e);
      grouped[key].total_minutes += (e.duree_minutes || 0);
    }

    res.json(Object.values(grouped).sort((a, b) => a.semaine_debut < b.semaine_debut ? 1 : -1));
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── GET /count-a-valider — badge count ───────────────────────────────────────

router.get('/count-a-valider', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) AS count FROM tache_temps WHERE statut IN ('brouillon','figee')`
    );
    res.json({ count });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const [[entry]] = await pool.query('SELECT * FROM tache_temps WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ message: 'Entrée introuvable' });

    const isOwner   = entry.utilisateur_id === req.user.id;
    const isManager = ['expert', 'chef_mission'].includes(req.user.role);
    if (!isOwner && !isManager)
      return res.status(403).json({ message: 'Non autorisé' });
    if (entry.statut !== 'brouillon' && !isManager)
      return res.status(400).json({ message: 'Impossible de supprimer une saisie figée ou validée' });

    await pool.query('DELETE FROM tache_temps WHERE id = ?', [req.params.id]);
    await recalcTemps(entry.tache_id);
    res.json({ message: 'Entrée supprimée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

module.exports = router;
