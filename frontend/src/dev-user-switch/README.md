# DEV_USER_SWITCH — frontend

Bandeau du sélecteur de vues de développement. **Ce dossier ne doit apparaître dans aucun bundle de production.**

## Élimination au build

Vite substitue à la compilation les constantes déclarées dans `vite.config.js → define`. On y a ajouté :

    define: { __DEV_USER_SWITCH__: JSON.stringify(mode !== 'production') }

Dans `frontend/src/main.jsx`, l'entrée est conditionnée :

    if (__DEV_USER_SWITCH__) {
      import('./dev-user-switch').then(m => m.mount());
    }

En `mode === 'production'`, la condition devient `if (false) { … }` : Rollup marque la branche comme morte et supprime le chunk `dev-user-switch-*.js` entier. Aucun import dynamique n'est émis, aucun appel réseau vers `/api/dev-user-switch/as` ne peut être déclenché.

## Test de non-régression

`frontend/scripts/verify-no-dev-switch-in-prod.mjs` :
- lance `vite build --mode production` ;
- lit récursivement `frontend/dist/` ;
- échoue si la chaîne `DEV_USER_SWITCH` apparaît quelque part.

Cette chaîne est présente en toutes lettres dans tous les fichiers de ce dossier (nom, commentaires, constante `__DEV_USER_SWITCH__`, route backend `/api/dev-user-switch/as`). Toute régression qui laisserait le code dans le bundle déclenche l'échec.

Le test s'exécute via `npm run verify-no-dev-switch`.
