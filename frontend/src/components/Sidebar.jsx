import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const roleLabel = { expert: 'Expert-Comptable', chef_mission: 'Chef de Mission', collaborateur: 'Collaborateur' };

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const isExpert = user?.role === 'expert';
  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-title">📊 Parfi CRM</div>
        <div className="logo-sub">Cabinet Parfi France</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-label">Navigation</div>
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="icon">🏠</span> Tableau de bord
          </NavLink>
          <NavLink to="/clients" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="icon">👥</span> Clients
          </NavLink>
          {isExpertOrChef && (
            <NavLink to="/attributions" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon">🔗</span> Attributions
            </NavLink>
          )}
          <NavLink to="/taches" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="icon">✅</span> Tâches
          </NavLink>
        </div>

        {isExpertOrChef && (
          <div className="nav-section">
            <div className="nav-section-label">Commercial</div>
            <NavLink to="/devis" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon">📄</span> Devis
            </NavLink>
            <NavLink to="/factures" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon">🧾</span> Factures
            </NavLink>
            <NavLink to="/lettres-mission" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon">📋</span> Lettres de mission
            </NavLink>
          </div>
        )}

        {isExpert && (
          <div className="nav-section">
            <div className="nav-section-label">Administration</div>
            <NavLink to="/collaborateurs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon">👤</span> Collaborateurs
            </NavLink>
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <strong>{user?.prenom} {user?.nom}</strong>
          {user?.email}
          <div className="user-role-badge">{roleLabel[user?.role]}</div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ width: '100%', color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.2)' }} onClick={handleLogout}>
          🚪 Déconnexion
        </button>
      </div>
    </aside>
  );
}
