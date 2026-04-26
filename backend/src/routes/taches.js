const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, async (req, res) => {
  try {
    let rows;
    const { client_id, utilisateur_id, statut } = req.query;
    const isExpertOrChef = ['expert', 'chef_mission'].includes(req.user.role);

    let where = isExpertOrChef ? [] : ['t.utilisateur_id = ?'];
    const params = isExpertOrChef ? [] : [req.user.id];

    if (client_id) { where.push('t.client_id = ?'); params.push(client_id); }
    if (utilisateur_id && isExpertOrChef) { where.push('t.utilisateur_id = ?'); params.push(utilisateur_id); }
    if (statut) { where.push('t.statut = ?'); params.push(statut); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    [rows] = await pool.query(
      `SELECT t.*, c.nom AS client_nom, u.prenom, u.nom AS user_nom
       FROM taches t
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
       ${whereClause}
       ORDER BY t.date_echeance ASC`,
      params
    );
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  const { client_id, utilisateur_id, description, duree, date_echeance, source } = req.body;
  if (!utilisateur_id || !description || !duree || !date_echeance) {
    return res.status(400).json({ message: 'Champs requis manquants' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO taches (client_id, utilisateur_id, description, duree, date_echeance, source) VALUES (?, ?, ?, ?, ?, ?)',
      [client_id || null, utilisateur_id, description, duree, date_echeance, source || 'manuelle']
    );
    res.status(201).json({ id: result.insertId });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  const { description, duree, date_echeance, statut, reports } = req.body;
  try {
    // Fetch current task to detect status change and overdue date
    const [[prevTask]] = await pool.query(
      `SELECT statut, date_echeance, utilisateur_id FROM taches WHERE id = ?`,
      [req.params.id]
    );

    const fields = [];
    const values = [];
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (duree !== undefined) { fields.push('duree = ?'); values.push(duree); }
    if (date_echeance !== undefined) { fields.push('date_echeance = ?'); values.push(date_echeance); }
    if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }
    if (reports !== undefined) { fields.push('reports = ?'); values.push(reports); }
    if (fields.length === 0) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE taches SET ${fields.join(', ')} WHERE id = ?`, values);

    // Notify assigned user when task becomes 'retard', or when date_echeance is set past today
    if (prevTask) {
      const assigneeId = prevTask.utilisateur_id;
      const newStatut = statut !== undefined ? statut : prevTask.statut;
      const newEcheance = date_echeance !== undefined ? new Date(date_echeance) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const isRetardStatut = statut === 'retard' && prevTask.statut !== 'retard';
      const isEcheancePassee = newEcheance && newEcheance < today && prevTask.statut !== 'retard';

      if (assigneeId && (isRetardStatut || isEcheancePassee)) {
        await pool.query(
          `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
           VALUES (?, 'tache_retard', 'Tâche en retard', 'Une de vos tâches est en retard.', '/taches', 0)`,
          [assigneeId]
        );
      }
    }

    res.json({ message: 'Tâche mise à jour' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.delete('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    await pool.query('DELETE FROM taches WHERE id = ?', [req.params.id]);
    res.json({ message: 'Tâche supprimée' });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── Dependances ──────────────────────────────────────────────────────────────

router.get('/:id/dependances', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.* FROM tache_dependances td
       JOIN taches t ON t.id = td.depend_de
       WHERE td.tache_id = ?`,
      [req.params.id]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/:id/dependances', verifyToken, async (req, res) => {
  const { depend_de_ids } = req.body;
  const tacheId = req.params.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM tache_dependances WHERE tache_id = ?', [tacheId]);
    if (Array.isArray(depend_de_ids) && depend_de_ids.length > 0) {
      const values = depend_de_ids.map((depId) => [tacheId, depId]);
      await conn.query('INSERT INTO tache_dependances (tache_id, depend_de) VALUES ?', [values]);
    }
    await conn.commit();
    res.json({ message: 'Dépendances mises à jour' });
  } catch {
    await conn.rollback();
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    conn.release();
  }
});

module.exports = router;
