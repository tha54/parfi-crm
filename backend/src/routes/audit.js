const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

/**
 * Helper function to insert an audit log entry.
 * Can be imported and used by other routes.
 */
async function logAudit(pool, {
  entity_type, entity_id,
  utilisateur_id = null, utilisateur_nom = null,
  action,
  champs_modifies = null, ancienne_valeur = null, nouvelle_valeur = null
}) {
  await pool.query(
    `INSERT INTO audit_log
       (entity_type, entity_id, utilisateur_id, utilisateur_nom, action,
        champs_modifies, ancienne_valeur, nouvelle_valeur)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entity_type,
      entity_id || null,
      utilisateur_id || null,
      utilisateur_nom || null,
      action,
      champs_modifies
        ? (typeof champs_modifies === 'string' ? champs_modifies : JSON.stringify(champs_modifies))
        : null,
      ancienne_valeur
        ? (typeof ancienne_valeur === 'string' ? ancienne_valeur : JSON.stringify(ancienne_valeur))
        : null,
      nouvelle_valeur
        ? (typeof nouvelle_valeur === 'string' ? nouvelle_valeur : JSON.stringify(nouvelle_valeur))
        : null,
    ]
  );
}

// GET / — audit log with optional filters
router.get('/', verifyToken, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);

    const where = [];
    const params = [];
    if (entity_type) { where.push('entity_type = ?'); params.push(entity_type); }
    if (entity_id) { where.push('entity_id = ?'); params.push(entity_id); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    params.push(limit);

    const [rows] = await pool.query(
      `SELECT * FROM audit_log ${whereClause} ORDER BY createdAt DESC LIMIT ?`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST / — create audit entry (internal use from other routes)
router.post('/', async (req, res) => {
  // Allow both authenticated and unauthenticated (system) requests
  let utilisateur_id = null;
  let utilisateur_nom = req.body.utilisateur_nom || null;

  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
      utilisateur_id = decoded.id;
      if (!utilisateur_nom) {
        utilisateur_nom = `${decoded.prenom || ''} ${decoded.nom || ''}`.trim() || null;
      }
    } catch {
      // No valid token — fall back to body.utilisateur_nom for system actions
    }
  }

  const { entity_type, entity_id, action, champs_modifies, ancienne_valeur, nouvelle_valeur } = req.body;
  if (!entity_type || !action) {
    return res.status(400).json({ message: 'entity_type et action requis' });
  }

  try {
    await logAudit(pool, {
      entity_type, entity_id, utilisateur_id, utilisateur_nom,
      action, champs_modifies, ancienne_valeur, nouvelle_valeur
    });
    res.status(201).json({ message: 'Entrée audit créée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
module.exports.logAudit = logAudit;
