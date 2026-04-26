import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

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

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-label">Navigation</div>
          <Link to="/briefing" icon="☀️" label="Briefing du jour" />
          <Link to="/dashboard" icon="🏠" label="Tableau de bord" />
          <Link to="/mon-espace" icon="👤" label="Mon Espace" />
          <Link to="/clients" icon="👥" label="Clients" />
          <Link to="/travaux" icon="🎯" label="Travaux" />
          <Link to="/planning" icon="📆" label="Planning" />
          <Link to="/hub-communication" icon="💬" label="Hub Communication" />
          <Link to="/documents" icon="📁" label="Documents (GED)" />
          {isExpertOrChef && <Link to="/portefeuille" icon="🔗" label="Portefeuille" />}
        </div>

        {isExpertOrChef && (
          <div className="nav-section">
            <div className="nav-section-label">Commercial</div>
            <Link to="/prospects" icon="📡" label="Prospects" />
            <Link to="/pipeline" icon="📊" label="Pipeline" />
            <Link to="/devis" icon="📄" label="Devis" />
            <Link to="/lettres-mission" icon="📋" label="Lettres de mission" />
            <Link to="/dimensionnement" icon="📐" label="Dimensionnement" />
          </div>
        )}

        {isExpertOrChef && (
          <div className="nav-section">
            <div className="nav-section-label">Facturation</div>
            <Link to="/factures" icon="🧾" label="Factures" />
            <Link to="/relances" icon="🔔" label="Relances" />
          </div>
        )}

        {isExpertOrChef && (
          <div className="nav-section">
            <div className="nav-section-label">Performance</div>
            <Link to="/rentabilite" icon="📈" label="Rentabilité" />
            <Link to="/charge-travail" icon="⚖️" label="Charge de travail" />
          </div>
        )}

        <div className="nav-section">
          <div className="nav-section-label">Administration</div>
          {isExpert && <Link to="/collaborateurs" icon="🏢" label="Collaborateurs" />}
          {isExpert && <Link to="/parametres" icon="⚙️" label="Paramètres" />}
          {isExpertOrChef && <Link to="/wiki" icon="📚" label="Wiki interne" />}
          {isExpertOrChef && <Link to="/automations" icon="⚡" label="Automations" />}
          {isExpert && <Link to="/tiime-import" icon="📥" label="Import Tiime" />}
          <a href="/portail" target="_blank" rel="noreferrer" className="nav-link" style={{ fontSize: 12, opacity: 0.75 }}>
            <span className="icon">🌐</span> Portail client
          </a>
          <a href="/intake" target="_blank" rel="noreferrer" className="nav-link" style={{ fontSize: 12, opacity: 0.75 }}>
            <span className="icon">📝</span> Formulaire prospect
          </a>
        </div>
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
