// DEV_USER_SWITCH — liste des 3 comptes exposés dans le bandeau.
// Chaîne sentinelle DEV_USER_SWITCH présente pour le test de non-régression
// frontend/scripts/verify-no-dev-switch-in-prod.mjs.
export const DEMO_USERS = [
  { key: 'theo',    label: 'Théo Marchand',    role: 'Collaborateur (senior)',   couleur: '#2563eb' },
  { key: 'valerie', label: 'Valérie Ancel',    role: 'Chef de mission',          couleur: '#059669' },
  { key: 'ec',      label: 'Expert-comptable', role: 'Expert (accès complet)',   couleur: '#7c3aed' },
];
