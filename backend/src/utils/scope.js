/**
 * Role-based scope utility.
 *
 * Hierarchy:
 *   expert           → null (no filter, sees everyone)
 *   chef_de_groupe   → self + direct reports + their teams (chef_id chain, 2 levels)
 *   chef_de_mission  → self + direct reports (chef_id = self)
 *   collaborateur    → self only
 *
 * chef_id is set on utilisateurs to point to the user's direct manager.
 *
 * Returns:
 *   null          — no filter (expert sees all)
 *   number[]      — list of utilisateur IDs this user may access
 */
async function getVisibleUserIds(pool, user) {
  if (user.role === 'expert') return null;

  if (user.role_metier === 'chef_de_groupe') {
    const [rows] = await pool.query(
      `SELECT id FROM utilisateurs
       WHERE actif = 1
         AND (id = ?
           OR chef_id = ?
           OR chef_id IN (SELECT id FROM utilisateurs WHERE chef_id = ? AND actif = 1))`,
      [user.id, user.id, user.id]
    );
    return rows.map((r) => r.id);
  }

  if (user.role_metier === 'chef_de_mission') {
    const [rows] = await pool.query(
      `SELECT id FROM utilisateurs WHERE actif = 1 AND (id = ? OR chef_id = ?)`,
      [user.id, user.id]
    );
    return rows.map((r) => r.id);
  }

  return [user.id];
}

/**
 * Returns true if the user can manage (assign tasks to) other users.
 */
function canManageOthers(user) {
  return (
    user.role === 'expert' ||
    user.role_metier === 'chef_de_groupe' ||
    user.role_metier === 'chef_de_mission'
  );
}

/**
 * Builds a parameterized IN clause for a column.
 * Returns { clause: string, params: number[] }
 * If ids is null (expert), returns empty clause.
 */
function inClause(ids, column) {
  if (ids === null) return { clause: '', params: [] };
  if (ids.length === 0) return { clause: 'AND 1=0', params: [] };
  return {
    clause: `AND ${column} IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  };
}

module.exports = { getVisibleUserIds, canManageOthers, inClause };
