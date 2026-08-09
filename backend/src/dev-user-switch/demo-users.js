'use strict';
/**
 * Liste des 3 comptes DEV_USER_SWITCH. Chaîne sentinelle DEV_USER_SWITCH
 * présente pour être détectée par le test de non-régression sur les builds
 * de production (voir frontend/scripts/verify-no-dev-switch-in-prod.mjs).
 *
 * Seuls les emails de cette liste peuvent être demandés par POST /api/dev-user-switch/as.
 * Aucun autre email ne peut être basculé, même s'il existe en base.
 */

const DEMO_USERS = [
  { key: 'theo',    email: 'theo.marchand@demo.local' },
  { key: 'valerie', email: 'valerie.ancel@demo.local'  },
  { key: 'ec',      email: 'ec.demo@demo.local'        },
];

module.exports = { DEMO_USERS };
