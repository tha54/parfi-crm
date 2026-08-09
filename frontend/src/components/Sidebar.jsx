import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';

const ROLE_LABEL = {
  expert:       'Expert-Comptable',
  chef_mission: 'Chef de Mission',
  collaborateur:'Collaborateur',
};

function Link({ to, icon, label }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <span className="icon">{icon}</span> {label}
    </NavLink>
  );
}

function Section({ label, children }) {
  return (
    <div className="nav-section">
      <div className="nav-section-label">{label}</div>
      {children}
    </div>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [plusOpen, setPlusOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const isExpert       = user?.role === 'expert';
  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  // Close profile menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo" onClick={() => navigate('/ma-journee')} style={{ cursor: 'pointer' }}>
        <img src="/parfi-logo-dark.svg" alt="ParFi Group" />
        <div className="logo-sub">Espace de gestion</div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 8px' }}>
        <GlobalSearch />
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <Section label="Quotidien">
          <Link to="/ma-journee"      icon="☀️" label="Ma journée" />
          <Link to="/taches"          icon="✅" label="Tâches" />
          <Link to="/feuille-temps"   icon="⏱" label="Feuille de temps" />
          <Link to="/clients"         icon="👥" label={isExpertOrChef ? 'Clients' : 'Mes clients'} />
          {isExpertOrChef && <Link to="/clients/a-completer" icon="⚠️" label="Fiches à compléter" />}
          <Link to="/documents"       icon="📁" label="GED" />
        </Section>

        {isExpertOrChef && (
          <>
            <Section label="Commercial">
              <Link to="/prospects-pipeline" icon="📡" label="Prospects & Pipeline" />
              <Link to="/devis"              icon="📄" label="Devis" />
              <Link to="/lettres-mission"    icon="📋" label="Lettres de mission" />
            </Section>

            <Section label="Production">
              <Link to="/travaux"       icon="⚙️"  label="Missions" />
              <Link to="/onboarding"    icon="🚀"  label="Onboardings" />
              <Link to="/planning"      icon="📅"  label="Planning" />
              <Link to="/portefeuille"  icon="🗂️"  label="Mon portefeuille" />
              <Link to="/charge-travail"icon="⚖️"  label="Charge de travail" />
              <Link to="/absences"      icon="🏖️"  label="Absences" />
            </Section>

            <Section label="Facturation">
              <Link to="/factures" icon="🧾" label="Factures" />
              <Link to="/relances" icon="🔔" label="Relances" />
              <Link to="/lettrage" icon="🏦" label="Lettrage bancaire" />
            </Section>

            <Section label="Pilotage">
              <Link to="/rentabilite" icon="📈" label="Rentabilité" />
              <Link to="/rapports"    icon="📊" label="Rapports" />
            </Section>

            {/* Section repliable */}
            <div className="nav-section">
              <button
                className="nav-section-label"
                onClick={() => setPlusOpen(o => !o)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  width: '100%', textAlign: 'left', padding: '6px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}
              >
                <span>Plus</span>
                <span style={{ fontSize: 9, opacity: 0.7 }}>{plusOpen ? '▲' : '▼'}</span>
              </button>
              {plusOpen && (
                <>
                  <Link to="/wiki"   icon="📚" label="Wiki interne" />
                  <Link to="/appels" icon="📞" label="Appels IA" />
                </>
              )}
            </div>
          </>
        )}
      </nav>

      {/* Footer avec profil */}
      <div className="sidebar-footer" style={{ padding: '8px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ marginBottom: 8 }}>
          <NotificationBell />
        </div>

        {/* Profil */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          {/* Menu déroulant */}
          {profileOpen && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0,
              background: 'var(--sidebar-bg, #1a1f2e)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '6px 0',
              marginBottom: 6, zIndex: 100,
              boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
            }}>
              {isExpertOrChef && (
                <NavLink to="/validation-temps" className="nav-link" style={{ fontSize: 13 }}
                  onClick={() => setProfileOpen(false)}>
                  <span className="icon">✅</span> Validation des temps
                </NavLink>
              )}
              {isExpert && (
                <>
                  <NavLink to="/parametres" className="nav-link" style={{ fontSize: 13 }}
                    onClick={() => setProfileOpen(false)}>
                    <span className="icon">⚙️</span> Paramètres
                  </NavLink>
                  <NavLink to="/collaborateurs" className="nav-link" style={{ fontSize: 13 }}
                    onClick={() => setProfileOpen(false)}>
                    <span className="icon">🏢</span> Collaborateurs
                  </NavLink>
                  <NavLink to="/tiime-import" className="nav-link" style={{ fontSize: 13 }}
                    onClick={() => setProfileOpen(false)}>
                    <span className="icon">📥</span> Import Tiime
                  </NavLink>
                  <div style={{ margin: '4px 12px', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
                </>
              )}
              <a href="/portail" target="_blank" rel="noreferrer" className="nav-link"
                style={{ fontSize: 12, opacity: 0.7 }} onClick={() => setProfileOpen(false)}>
                <span className="icon">🌐</span> Portail client
              </a>
              <a href="/intake" target="_blank" rel="noreferrer" className="nav-link"
                style={{ fontSize: 12, opacity: 0.7 }} onClick={() => setProfileOpen(false)}>
                <span className="icon">📝</span> Formulaire prospect
              </a>
            </div>
          )}

          {/* Bouton profil */}
          <button
            onClick={() => setProfileOpen(o => !o)}
            style={{
              width: '100%', background: profileOpen ? 'rgba(255,255,255,0.08)' : 'none',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              padding: '8px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, marginBottom: 6, transition: 'background .15s',
            }}
          >
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.prenom} {user?.nom}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                {ROLE_LABEL[user?.role] || user?.role}
              </div>
            </div>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
              {profileOpen ? '▲' : '▼'}
            </span>
          </button>
        </div>

        {/* Déconnexion */}
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', justifyContent: 'center', color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.12)', fontSize: 12 }}
          onClick={handleLogout}
        >
          🚪 Déconnexion
        </button>
      </div>
    </aside>
  );
}
