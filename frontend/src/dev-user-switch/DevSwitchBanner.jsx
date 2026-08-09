// DEV_USER_SWITCH — bandeau du sélecteur de vues.
// Ce fichier est éliminé du bundle en mode production (voir index.js).
import React, { useEffect, useState } from 'react';
import { DEMO_USERS } from './demo-users';

const STYLE_BAR = {
  position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
  background: '#111827', color: '#fff',
  padding: '6px 12px',
  display: 'flex', alignItems: 'center', gap: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 13, boxShadow: '0 2px 4px rgba(0,0,0,.2)',
};
const STYLE_TAG = {
  background: '#ef4444', color: '#fff',
  padding: '2px 8px', borderRadius: 4,
  fontWeight: 700, letterSpacing: '.05em',
};
const STYLE_LABEL = { opacity: .75 };
const STYLE_CURRENT = { fontWeight: 600 };
const styleButton = (couleur, actif) => ({
  background: actif ? couleur : 'transparent',
  color: '#fff',
  border: `1px solid ${couleur}`,
  padding: '4px 10px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: actif ? 700 : 500,
  transition: 'background .15s',
});

export default function DevSwitchBanner() {
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('parfi_user') || 'null');
      if (u) setCurrent(u.email);
    } catch (_) {}
  }, []);

  async function switchTo(userKey) {
    setError(null);
    try {
      const res = await fetch('/api/dev-user-switch/as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userKey }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        setError(msg.message || `HTTP ${res.status}`);
        return;
      }
      const { token, user } = await res.json();
      localStorage.setItem('parfi_token', token);
      localStorage.setItem('parfi_user', JSON.stringify(user));
      window.location.href = '/';
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={STYLE_BAR}>
      <span style={STYLE_TAG}>DEV</span>
      <span style={STYLE_LABEL}>Voir en tant que :</span>
      {DEMO_USERS.map(u => {
        const emailAttendu = u.key === 'theo'    ? 'theo.marchand@demo.local'
                           : u.key === 'valerie' ? 'valerie.ancel@demo.local'
                                                 : 'ec.demo@demo.local';
        const actif = current === emailAttendu;
        return (
          <button
            key={u.key}
            onClick={() => switchTo(u.key)}
            style={styleButton(u.couleur, actif)}
            title={u.role}
          >
            {u.label}
          </button>
        );
      })}
      {current && (
        <span style={{ ...STYLE_LABEL, marginLeft: 'auto' }}>
          courant : <span style={STYLE_CURRENT}>{current}</span>
        </span>
      )}
      {error && <span style={{ color: '#fca5a5', marginLeft: 8 }}>⚠ {error}</span>}
    </div>
  );
}
