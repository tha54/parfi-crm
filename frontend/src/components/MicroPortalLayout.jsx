import { NavLink, useNavigate } from 'react-router-dom';
import { useMicroPortalAuth } from '../context/MicroPortalAuthContext';

const NAV_LINKS = [
  { to: '/micro-portail/dashboard', label: 'Tableau de bord', icon: '📊' },
  { to: '/micro-portail/devis', label: 'Devis', icon: '📄' },
  { to: '/micro-portail/factures', label: 'Factures', icon: '🧾' },
  { to: '/micro-portail/livre-recettes', label: 'Livre des recettes', icon: '📖' },
];

export default function MicroPortalLayout({ children }) {
  const { portalUser, logout } = useMicroPortalAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/micro-portail/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <nav style={{
        background: '#0F1F4B', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '0 24px', height: 56, flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 36 }}>
          <span style={{ fontSize: 20 }}>🧾</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1 }}>Espace Micro-Entrepreneur</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1, marginTop: 2 }}>Parfi France</div>
          </div>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          {NAV_LINKS.map(({ to, label, icon }) => (
            <NavLink key={to} to={to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6, textDecoration: 'none',
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                transition: 'all 0.15s',
              })}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        {/* User + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{portalUser?.nom}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{portalUser?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '6px 14px', background: 'rgba(255,255,255,0.1)',
              color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Déconnexion
          </button>
        </div>
      </nav>

      {/* Content */}
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {children}
      </main>
    </div>
  );
}
