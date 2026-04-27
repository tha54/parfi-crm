import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';

const roleLabel = { expert: 'Expert-Comptable', chef_mission: 'Chef de Mission', collaborateur: 'Collaborateur' };

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };
  const isExpert = user?.role === 'expert';
  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  const Link = ({ to, icon, label }) => (
    <NavLink to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <span className="icon">{icon}</span> {label}
    </NavLink>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/parfi-logo-dark.svg" alt="ParFi Group" />
        <div className="logo-sub">Espace de gestion</div>
      </div>

      {/* Global Search — Ctrl+K */}
      <div style={{ padding: '0 12px 8px' }}>
        <GlobalSearch />
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-label">Navigation</div>
          <Link to="/mon-espace" icon="🏠" label="Mon Espace" />
          <Link to="/taches"     icon="✅" label="Mes tâches" />
          <Link to="/clients"    icon="👥" label="Clients" />
          <Link to="/documents"  icon="📁" label="Ma GED" />
        </div>

        {isExpertOrChef && (
          <>
            <div className="nav-section">
              <div className="nav-section-label">Commercial</div>
              <Link to="/prospects"       icon="📡" label="Prospects" />
              <Link to="/pipeline"        icon="📊" label="Pipeline" />
              <Link to="/devis"           icon="📄" label="Devis" />
              <Link to="/lettres-mission" icon="📋" label="Lettres de mission" />
              <Link to="/dimensionnement" icon="📐" label="Dimensionnement" />
            </div>

            <div className="nav-section">
              <div className="nav-section-label">Travaux</div>
              <Link to="/travaux"  icon="⚙️" label="Travaux" />
              <Link to="/planning" icon="📅" label="Planning" />
              <Link to="/taches"   icon="✅" label="Toutes les tâches" />
            </div>

            <div className="nav-section">
              <div className="nav-section-label">Portefeuille</div>
              <Link to="/portefeuille"   icon="🗂️" label="Cabinet" />
              <Link to="/charge-travail" icon="⚖️" label="Charge de travail" />
              <Link to="/absences"       icon="🏖️" label="Absences" />
            </div>

            <div className="nav-section">
              <div className="nav-section-label">Facturation</div>
              <Link to="/factures" icon="🧾" label="Factures" />
              <Link to="/relances" icon="🔔" label="Relances" />
            </div>

            <div className="nav-section">
              <div className="nav-section-label">Performance</div>
              <Link to="/rentabilite" icon="📈" label="Rentabilité" />
              <Link to="/rapports"    icon="📊" label="Rapports" />
              <Link to="/briefing"    icon="☀️" label="Morning Briefing" />
            </div>

            <div className="nav-section">
              <div className="nav-section-label">Cabinet</div>
              <Link to="/wiki"        icon="📚" label="Wiki interne" />
              <Link to="/automations" icon="⚡" label="Automations" />
              {isExpert && <Link to="/collaborateurs" icon="🏢" label="Collaborateurs" />}
              {isExpert && <Link to="/parametres"     icon="⚙️" label="Paramètres" />}
              {isExpert && <Link to="/tiime-import"   icon="📥" label="Import Tiime" />}
              <a href="/portail" target="_blank" rel="noreferrer" className="nav-link" style={{ fontSize: 12, opacity: 0.75 }}>
                <span className="icon">🌐</span> Portail client
              </a>
              <a href="/intake" target="_blank" rel="noreferrer" className="nav-link" style={{ fontSize: 12, opacity: 0.75 }}>
                <span className="icon">📝</span> Formulaire prospect
              </a>
            </div>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <strong>{user?.prenom} {user?.nom}</strong>
          {user?.email}
          <div className="user-role-badge">{roleLabel[user?.role]}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <NotificationBell />
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', justifyContent: 'center', color: 'rgba(255,255,255,0.65)', borderColor: 'rgba(255,255,255,0.15)' }}
          onClick={handleLogout}
        >
          🚪 Déconnexion
        </button>
      </div>
    </aside>
  );
}
