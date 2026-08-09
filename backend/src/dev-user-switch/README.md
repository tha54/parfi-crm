# DEV_USER_SWITCH — backend

Module isolé du sélecteur de vues de développement. Outil **temporaire** : il tourne actuellement sur la base unique `parfi` (les 3 comptes `@demo.local` cohabitent avec les vrais comptes du cabinet). Il doit disparaître à la mise en service — dossier entier à exclure de l'artefact de déploiement final.

## Trois ceintures de sécurité

1. **Require conditionnel** dans `backend/src/server.js` : `if (process.env.NODE_ENV !== 'production') require('./dev-user-switch/install')(app)`.
2. **Vérification interne** dans `install.js` : re-check de `NODE_ENV` avant de wire les routes.
3. **Exclusion physique** du dossier lors du déploiement (voir plus bas). Sans le fichier sur disque, aucune activation n'est possible même par variable mal positionnée.

## Exclusion au déploiement

La chaîne sentinelle `DEV_USER_SWITCH` est présente en toutes lettres dans tous les fichiers de ce dossier. Le test de non-régression `frontend/scripts/verify-no-dev-switch-in-prod.mjs` échoue si elle apparaît dans un bundle frontend construit en mode production.

Pour un audit rapide côté backend, exécuter :

    grep -rl DEV_USER_SWITCH /opt/parfi-crm/backend/src/

Cette commande **doit** renvoyer une ligne pointant vers `backend/src/dev-user-switch/` (les fichiers de ce dossier) et une seule ligne pointant vers `backend/src/server.js` (le require conditionnel). Tout autre résultat en production est une régression.

## Routes exposées

- `POST /api/dev-user-switch/as` — corps `{ "user": "theo" | "valerie" | "ec" }`. Retour : `{ token, user }` au même format que `/api/auth/login`.

## Comptes de démo

Les 3 comptes doivent exister en base (colonne `grade` renseignée). Les créer avec :

    node backend/src/migrations/chantier3-07-seed-demo-users.js --db parfi

La migration accepte n'importe quelle base — la protection contre la fuite en prod repose entièrement sur l'exclusion physique du dossier `dev-user-switch/` de l'artefact de déploiement + les garde-fous `NODE_ENV` (voir plus haut).
