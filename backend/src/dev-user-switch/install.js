'use strict';
/**
 * DEV_USER_SWITCH — installateur. Appelé conditionnellement depuis server.js.
 *
 *     if (process.env.NODE_ENV !== 'production') {
 *       try { require('./dev-user-switch/install')(app); } catch (_) {}
 *     }
 *
 * Deux ceintures :
 *   1. Le require ci-dessus n'est même pas atteint en production.
 *   2. Ce fichier vérifie NODE_ENV à nouveau et refuse de wire les routes,
 *      pour couvrir les cas où le require serait fait par erreur.
 *
 * Une troisième protection tient à l'exclusion physique du dossier
 * backend/src/dev-user-switch/ de l'artefact de déploiement (voir README.md
 * du dossier). Sans le fichier sur disque, aucune activation n'est possible,
 * même par variable d'environnement mal positionnée.
 */

module.exports = function install(app) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[DEV_USER_SWITCH] refus : NODE_ENV=production');
    return;
  }
  const routes = require('./routes');
  app.use('/api/dev-user-switch', routes);
  console.log('[DEV_USER_SWITCH] activé — POST /api/dev-user-switch/as (NODE_ENV=' + (process.env.NODE_ENV || 'unset') + ')');
};
