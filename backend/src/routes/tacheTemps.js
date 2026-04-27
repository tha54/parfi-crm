const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function budgetStatus(dureeH, consumedMinutes) {
  if (!dureeH) return null;
  const budgetMinutes = Math.round(dureeH * 60);
  const percent = budgetMinutes > 0 ? Math.round((consumedMinutes / budgetMinutes) * 100) : 0;
  const status = percent >= 100 ? 'exceeded' : percent >= 80 ? 'warning' : 'ok';
  return { budgetMinutes, consumedMinutes, percent, status };
}

async function notifyBudget(pool, tacheId, prevConsumed, newConsumed, budgetH) {
  if (!budgetH || budgetH <= 0) return;
  const budgetMin = Math.round(budgetH * 60);
  const prevPct = (prevConsumed / budgetMin) * 100;
  const newPct  = (newConsumed  / budgetMin) * 100;

  const [[task]] = await pool.query(
    'SELECT utilisateur_id, description FROM taches WHERE id = ?', [tacheId]
  );
  if (!task) return;

  if (prevPct < 100 && newPct >= 100) {
    // Notify collaborateur + all chefs/experts
    const [managers] = await pool.query(
      "SELECT id FROM utilisateurs WHERE role IN ('expert','chef_mission') AND actif = 1"
    );
    const ids = [...new Set([task.utilisateur_id, ...managers.map(m => m.id)])];
    for (const uid of ids) {
      await pool.query(
        `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
         VALUES (?, 'budget_depasse', '🔴 Budget dépassé',
           ?, '/taches', 0)`,
        [uid, `Le budget temps de la tâche "${task.description}" est dépassé à 100 %.`]
      );
    }
  } else if (prevPct < 80 && newPct >= 80) {
    // Notify only the assignee
    await pool.query(
      `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
       VALUES (?, 'budget_alerte', '🟡 Budget temps à 80 %',
         ?, '/taches', 0)`,
      [task.utilisateur_id, `La tâche "${task.description}" a consommé ${Math.round(newPct)} % de son budget temps.`]
    );
  }
}

// ─── GET active timer for current user ───────────────────────────────────────

router.get('/active', verifyToken, async (req, res) => {
  try {
    const [[entry]] = await pool.query(
      `SELECT te.*, t.description AS tache_description
       FROM tache_temps te
       JOIN taches t ON te.tache_id = t.id
       WHERE te.utilisateur_id = ? AND te.fin IS NULL`,
      [req.user.id]
    );
    res.json(entry || null);
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── GET entries + budget for a task ─────────────────────────────────────────

router.get('/tache/:id', verifyToken, async (req, res) => {
  try {
    const tacheId = req.params.id;
    const [[task]] = await pool.query(
      'SELECT duree, utilisateur_id FROM taches WHERE id = ?', [tacheId]
    );
    if (!task) return res.status(404).json({ message: 'Tâche introuvable' });

    const [entries] = await pool.query(
      `SELECT te.*, u.prenom, u.nom AS user_nom
       FROM tache_temps te
       JOIN utilisateurs u ON te.utilisateur_id = u.id
       WHERE te.tache_id = ?
       ORDER BY te.debut DESC`,
      [tacheId]
    );

    const consumed = entries
      .filter(e => e.duree_minutes !== null)
      .reduce((sum, e) => sum + e.duree_minutes, 0);

    const activeTimer = entries.find(
      e => e.utilisateur_id === req.user.id && e.fin === null
    ) || null;

    res.json({
      entries,
      budget: budgetStatus(task.duree, consumed),
      activeTimer,
    });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── POST manual time entry ───────────────────────────────────────────────────

router.post('/tache/:id', verifyToken, async (req, res) => {
  const { duree_minutes, commentaire, date } = req.body;
  if (!duree_minutes || Number(duree_minutes) <= 0) {
    return res.status(400).json({ message: 'Durée invalide' });
  }
  const tacheId = req.params.id;
  try {
    const [[task]] = await pool.query(
      'SELECT duree FROM taches WHERE id = ?', [tacheId]
    );
    if (!task) return res.status(404).json({ message: 'Tâche introuvable' });

    const [[{ consumed }]] = await pool.query(
      `SELECT COALESCE(SUM(duree_minutes), 0) AS consumed
       FROM tache_temps WHERE tache_id = ? AND duree_minutes IS NOT NULL`,
      [tacheId]
    );

    const budgetMin = task.duree ? Math.round(task.duree * 60) : 0;
    const pct = budgetMin > 0 ? (consumed / budgetMin) * 100 : 0;
    if (budgetMin > 0 && pct >= 100 && !commentaire?.trim()) {
      return res.status(400).json({
        message: 'Un commentaire est obligatoire lorsque le budget est dépassé.',
      });
    }

    const debut = date ? new Date(date) : new Date();
    const fin   = new Date(debut.getTime() + Number(duree_minutes) * 60000);

    await pool.query(
      `INSERT INTO tache_temps (tache_id, utilisateur_id, debut, fin, duree_minutes, commentaire, type)
       VALUES (?, ?, ?, ?, ?, ?, 'manuel')`,
      [tacheId, req.user.id, debut, fin, duree_minutes, commentaire?.trim() || null]
    );

    await notifyBudget(pool, tacheId, consumed, consumed + Number(duree_minutes), task.duree);
    res.status(201).json({ message: 'Entrée ajoutée' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── POST start timer ─────────────────────────────────────────────────────────

router.post('/tache/:id/start', verifyToken, async (req, res) => {
  const tacheId = req.params.id;
  try {
    const [[active]] = await pool.query(
      'SELECT id FROM tache_temps WHERE utilisateur_id = ? AND fin IS NULL',
      [req.user.id]
    );
    if (active) {
      return res.status(400).json({
        message: 'Un chronomètre est déjà en cours. Arrêtez-le d\'abord.',
      });
    }
    const [result] = await pool.query(
      `INSERT INTO tache_temps (tache_id, utilisateur_id, debut, type)
       VALUES (?, ?, NOW(), 'chrono')`,
      [tacheId, req.user.id]
    );
    res.status(201).json({ id: result.insertId });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── PUT stop timer ───────────────────────────────────────────────────────────

router.put('/:entryId/stop', verifyToken, async (req, res) => {
  const { commentaire } = req.body;
  try {
    const [[entry]] = await pool.query(
      'SELECT * FROM tache_temps WHERE id = ? AND utilisateur_id = ? AND fin IS NULL',
      [req.params.entryId, req.user.id]
    );
    if (!entry) return res.status(404).json({ message: 'Chronomètre introuvable' });

    const now = new Date();
    const dureeMinutes = Math.max(1, Math.round((now - new Date(entry.debut)) / 60000));

    const [[task]] = await pool.query('SELECT duree FROM taches WHERE id = ?', [entry.tache_id]);
    const [[{ consumed }]] = await pool.query(
      `SELECT COALESCE(SUM(duree_minutes), 0) AS consumed
       FROM tache_temps WHERE tache_id = ? AND duree_minutes IS NOT NULL`,
      [entry.tache_id]
    );
    const budgetMin = task?.duree ? Math.round(task.duree * 60) : 0;
    const pct = budgetMin > 0 ? (consumed / budgetMin) * 100 : 0;
    if (budgetMin > 0 && pct >= 100 && !commentaire?.trim()) {
      return res.status(400).json({
        message: 'Un commentaire est obligatoire lorsque le budget est dépassé.',
      });
    }

    await pool.query(
      'UPDATE tache_temps SET fin = ?, duree_minutes = ?, commentaire = ? WHERE id = ?',
      [now, dureeMinutes, commentaire?.trim() || null, entry.id]
    );

    await notifyBudget(pool, entry.tache_id, consumed, consumed + dureeMinutes, task?.duree);
    res.json({ message: 'Chronomètre arrêté', dureeMinutes });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── DELETE entry ─────────────────────────────────────────────────────────────

router.delete('/:entryId', verifyToken, async (req, res) => {
  try {
    const [[entry]] = await pool.query(
      'SELECT utilisateur_id FROM tache_temps WHERE id = ?', [req.params.entryId]
    );
    if (!entry) return res.status(404).json({ message: 'Entrée introuvable' });

    const isOwner   = entry.utilisateur_id === req.user.id;
    const isManager = ['expert', 'chef_mission'].includes(req.user.role);
    if (!isOwner && !isManager) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    await pool.query('DELETE FROM tache_temps WHERE id = ?', [req.params.entryId]);
    res.json({ message: 'Entrée supprimée' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
