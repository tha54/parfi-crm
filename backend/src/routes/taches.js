const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id, utilisateur_id, statut, periode } = req.query;
    const isExpertOrChef = ['expert', 'chef_mission'].includes(req.user.role);

    let where = isExpertOrChef ? [] : ['t.utilisateur_id = ?'];
    const params = isExpertOrChef ? [] : [req.user.id];

    if (client_id) { where.push('t.client_id = ?'); params.push(client_id); }
    if (utilisateur_id && isExpertOrChef) { where.push('t.utilisateur_id = ?'); params.push(utilisateur_id); }
    if (statut) { where.push('t.statut = ?'); params.push(statut); }

    if (periode) {
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const pad = (n) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const tom = new Date(now); tom.setDate(now.getDate() + 1);
      const tomorrowStr = `${tom.getFullYear()}-${pad(tom.getMonth() + 1)}-${pad(tom.getDate())}`;
      const dow = now.getDay();
      const daysFromMon = dow === 0 ? 6 : dow - 1;
      const mon = new Date(now); mon.setDate(now.getDate() - daysFromMon);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const monStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
      const sunStr = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`;

      if (periode === 'retard') {
        where.push("t.date_echeance < ? AND t.statut != 'termine'");
        params.push(todayStr);
      } else if (periode === 'aujourd_hui') {
        where.push('t.date_echeance = ?');
        params.push(todayStr);
      } else if (periode === 'demain') {
        where.push('t.date_echeance = ?');
        params.push(tomorrowStr);
      } else if (periode === 'semaine') {
        where.push('t.date_echeance BETWEEN ? AND ?');
        params.push(monStr, sunStr);
      }
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT t.*,
         c.nom AS client_nom,
         u.prenom, u.nom AS user_nom,
         ap.prenom AS assigne_par_prenom, ap.nom AS assigne_par_nom
       FROM taches t
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
       LEFT JOIN utilisateurs ap ON t.assigne_par = ap.id
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
  const { client_id, utilisateur_id, titre, description, duree, date_echeance, source, priorite, categorie, type_travail } = req.body;
  const isExpertOrChef = ['expert', 'chef_mission'].includes(req.user.role);

  if (!date_echeance || (!titre && !description)) {
    return res.status(400).json({ message: 'Titre et échéance sont requis.' });
  }

  // Collaborators can only create tasks for themselves
  const targetUserId = isExpertOrChef ? (utilisateur_id || req.user.id) : req.user.id;
  if (!isExpertOrChef && utilisateur_id && Number(utilisateur_id) !== req.user.id) {
    return res.status(403).json({ message: 'Vous ne pouvez créer des tâches que pour vous-même.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO taches
         (client_id, utilisateur_id, titre, description, duree, date_echeance, source, priorite, categorie, assigne_par, type_travail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        client_id    || null,
        targetUserId,
        titre        || null,
        description  || '',
        duree        || null,
        date_echeance,
        source       || 'manuelle',
        priorite     || 'normale',
        categorie    || null,
        req.user.id,
        type_travail || 'recurrent',
      ]
    );

    // Notify the assignee when a manager assigns the task to someone else
    if (Number(targetUserId) !== req.user.id) {
      const [[assigner]] = await pool.query('SELECT prenom, nom FROM utilisateurs WHERE id = ?', [req.user.id]);
      const name    = assigner ? `${assigner.prenom} ${assigner.nom}` : 'Votre responsable';
      const label   = titre || description;
      await pool.query(
        `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
         VALUES (?, 'tache_assignee', 'Nouvelle tâche assignée', ?, '/taches', 0)`,
        [targetUserId, `${name} vous a assigné une tâche : ${label}`]
      );
    }

    res.status(201).json({ id: result.insertId });
  } catch {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  const { titre, description, duree, date_echeance, statut, reports, priorite, categorie, utilisateur_id,
          type_travail, temps_passe_minutes, sous_categorie_non_facturable } = req.body;
  const isExpertOrChef = ['expert', 'chef_mission'].includes(req.user.role);
  try {
    const [[prevTask]] = await pool.query(
      `SELECT t.statut, t.date_echeance, t.utilisateur_id, t.assigne_par, t.titre, t.description,
              u.prenom AS assignee_prenom, u.nom AS assignee_nom
       FROM taches t
       LEFT JOIN utilisateurs u ON t.utilisateur_id = u.id
       WHERE t.id = ?`,
      [req.params.id]
    );

    const fields = [];
    const values = [];
    if (titre       !== undefined) { fields.push('titre = ?');        values.push(titre); }
    if (description !== undefined) { fields.push('description = ?');  values.push(description); }
    if (duree       !== undefined) { fields.push('duree = ?');        values.push(duree || null); }
    if (date_echeance !== undefined){ fields.push('date_echeance = ?'); values.push(date_echeance); }
    if (statut      !== undefined) { fields.push('statut = ?');       values.push(statut); }
    if (reports     !== undefined) { fields.push('reports = ?');      values.push(reports); }
    if (priorite    !== undefined) { fields.push('priorite = ?');     values.push(priorite); }
    if (categorie   !== undefined) { fields.push('categorie = ?');    values.push(categorie || null); }
    if (type_travail !== undefined) { fields.push('type_travail = ?'); values.push(type_travail || null); }
    if (temps_passe_minutes !== undefined) { fields.push('temps_passe_minutes = ?'); values.push(parseInt(temps_passe_minutes) || 0); }
    if (sous_categorie_non_facturable !== undefined) { fields.push('sous_categorie_non_facturable = ?'); values.push(sous_categorie_non_facturable || null); }

    // Only managers can reassign
    if (utilisateur_id !== undefined && isExpertOrChef) {
      fields.push('utilisateur_id = ?');
      values.push(utilisateur_id);
    }

    if (fields.length === 0) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE taches SET ${fields.join(', ')} WHERE id = ?`, values);

    // Notify new assignee on reassignment
    if (utilisateur_id !== undefined && isExpertOrChef && prevTask &&
        Number(utilisateur_id) !== prevTask.utilisateur_id) {
      const [[assigner]] = await pool.query('SELECT prenom, nom FROM utilisateurs WHERE id = ?', [req.user.id]);
      const name  = assigner ? `${assigner.prenom} ${assigner.nom}` : 'Votre responsable';
      const label = titre || prevTask.titre || prevTask.description;
      await pool.query(
        `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
         VALUES (?, 'tache_assignee', 'Tâche réassignée', ?, '/taches', 0)`,
        [utilisateur_id, `${name} vous a assigné une tâche : ${label}`]
      );
    }

    if (prevTask) {
      const assigneeId = prevTask.utilisateur_id;
      const today = new Date(); today.setHours(0, 0, 0, 0);

      // Notify assignee when task becomes overdue
      const isRetardStatut = statut === 'retard' && prevTask.statut !== 'retard';
      const newEcheance = date_echeance ? new Date(date_echeance) : null;
      const isEcheancePassee = newEcheance && newEcheance < today && prevTask.statut !== 'retard';
      if (assigneeId && (isRetardStatut || isEcheancePassee)) {
        await pool.query(
          `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
           VALUES (?, 'tache_retard', 'Tâche en retard', 'Une de vos tâches est en retard.', '/taches', 0)`,
          [assigneeId]
        );
      }

      // Notify the assigner (superior) when task is marked as done
      const wasNotDone = prevTask.statut !== 'termine';
      const isNowDone  = statut === 'termine';
      const assignerId = prevTask.assigne_par;
      if (wasNotDone && isNowDone && assignerId && Number(assignerId) !== assigneeId) {
        const assigneeName = prevTask.assignee_prenom
          ? `${prevTask.assignee_prenom} ${prevTask.assignee_nom}`
          : 'Un collaborateur';
        const desc = description || prevTask.description;
        await pool.query(
          `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
           VALUES (?, 'tache_terminee', 'Tâche terminée', ?, '/taches', 0)`,
          [assignerId, `${assigneeName} a terminé : ${desc}`]
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
