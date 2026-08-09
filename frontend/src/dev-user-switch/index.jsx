// DEV_USER_SWITCH — point d'entrée. Importé conditionnellement depuis main.jsx.
// Toute la logique du sélecteur est dans ce dossier ; rien n'est référencé
// depuis les modules d'authentification ou de routage normaux.
import React from 'react';
import ReactDOM from 'react-dom/client';
import DevSwitchBanner from './DevSwitchBanner.jsx';

export function mount() {
  // Crée un conteneur dédié au bandeau, hors de l'arbre <App/>.
  const host = document.createElement('div');
  host.id = 'dev-user-switch-root';
  document.body.prepend(host);
  ReactDOM.createRoot(host).render(<DevSwitchBanner />);

  // Décale le contenu de l'app pour ne pas se faire recouvrir par le bandeau.
  document.body.style.paddingTop = '34px';
}
