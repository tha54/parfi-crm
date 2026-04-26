const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const INTERNAL_SECRET = 'parfi2024';

// GET / — list all automations
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM automations ORDER BY createdAt DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST / — create automation
router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { nom, declencheur, conditions_json, actions_json } = req.body;
  if (!nom || !declencheur) {
    return res.status(400).json({ message: 'nom et declencheur requis' });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO automations (nom, declencheur, conditions_json, actions_json, actif)
       VALUES (?, ?, ?, ?, 1)`,
      [
        nom,
        declencheur,
        conditions_json
          ? (typeof conditions_json === 'string' ? conditions_json : JSON.stringify(conditions_json))
          : null,
        actions_json
          ? (typeof actions_json === 'string' ? actions_json : JSON.stringify(actions_json))
          : null,
      ]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /:id — update automation
router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { actif, nom, conditions_json, actions_json } = req.body;
  try {
    const fields = [];
    const values = [];

    if (actif !== undefined) { fields.push('actif = ?'); values.push(actif ? 1 : 0); }
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nom); }
    if (conditions_json !== undefined) {
      fields.push('conditions_json = ?');
      values.push(typeof conditions_json === 'string' ? conditions_json : JSON.stringify(conditions_json));
    }
    if (actions_json !== undefined) {
      fields.push('actions_json = ?');
      values.push(typeof actions_json === 'string' ? actions_json : JSON.stringify(actions_json));
    }

    if (!fields.length) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id);
    await pool.query(`UPDATE automations SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Automation mise à jour' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /:id — delete automation
router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM automations WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Automation supprimée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /execute/:declencheur — internal, execute automations for a trigger
router.post('/execute/:declencheur', async (req, res) => {
  if (req.headers['x-internal'] !== INTERNAL_SECRET) {
    return res.status(403).json({ message: 'Accès refusé' });
  }

  const { declencheur } = req.params;
  const { client_id, entity_id } = req.body;

  try {
    const [automations] = await pool.query(
      `SELECT * FROM automations WHERE declencheur = ? AND actif = 1`,
      [declencheur]
    );

    const executed = [];
    const errors = [];

    for (const automation of automations) {
      try {
        let actions = automation.actions_json;
        if (typeof actions === 'string') {
          try { actions = JSON.parse(actions); } catch { actions = []; }
        }
        if (!Array.isArray(actions)) actions = [];

        for (const action of actions) {
          if (action.type === 'create_task') {
            // Find an expert to assign the task
            const [[expert]] = await pool.query(
              `SELECT id FROM utilisateurs WHERE role = 'expert' LIMIT 1`
            );
            const assignee_id = action.utilisateur_id || (expert ? expert.id : null);

            const echeance = new Date();
            echeance.setDate(echeance.getDate() + 7);
            const dateEcheance = echeance.toISOString().split('T')[0];

            await pool.query(
              `INSERT INTO taches (client_id, utilisateur_id, description, duree, date_echeance, priorite, statut, source)
               VALUES (?, ?, ?, 1, ?, ?, 'a_faire', 'automation')`,
              [
                client_id || null,
                assignee_id,
                action.description || `Tâche automatique : ${automation.nom}`,
                dateEcheance,
                action.priorite || 'normale',
              ]
            );
          }
        }

        // Update exec_count and derniere_exec
        await pool.query(
          `UPDATE automations SET exec_count = COALESCE(exec_count, 0) + 1, derniere_exec = NOW() WHERE id = ?`,
          [automation.id]
        );

        executed.push(automation.id);
      } catch (e) {
        errors.push({ id: automation.id, error: e.message });
      }
    }

    res.json({ executed, errors, total: automations.length });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
