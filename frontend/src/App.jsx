import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Collaborateurs from './pages/Collaborateurs';
import Clients from './pages/Clients';
import Attributions from './pages/Attributions';
import Taches from './pages/Taches';
import Devis from './pages/Devis';
import Factures from './pages/Factures';
import LettresMission from './pages/LettresMission';
import Prospects from './pages/Prospects';
import Dimensionnement from './pages/Dimensionnement';
import Pipeline from './pages/Pipeline';
import Missions from './pages/Missions';
import Relances from './pages/Relances';
import Rentabilite from './pages/Rentabilite';
import ChargeTravail from './pages/ChargeTravail';
import MonEspace from './pages/MonEspace';
import HubCommunication from './pages/HubCommunication';
import Planning from './pages/Planning';
import Parametres from './pages/Parametres';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppLayout({ children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/mon-espace" element={<ProtectedRoute><AppLayout><MonEspace /></AppLayout></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><AppLayout><Clients /></AppLayout></ProtectedRoute>} />
      <Route path="/attributions" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Attributions /></AppLayout></ProtectedRoute>} />
      <Route path="/taches" element={<ProtectedRoute><AppLayout><Taches /></AppLayout></ProtectedRoute>} />
      <Route path="/missions" element={<ProtectedRoute><AppLayout><Missions /></AppLayout></ProtectedRoute>} />
      <Route path="/planning" element={<ProtectedRoute><AppLayout><Planning /></AppLayout></ProtectedRoute>} />
      <Route path="/hub-communication" element={<ProtectedRoute><AppLayout><HubCommunication /></AppLayout></ProtectedRoute>} />
      <Route path="/collaborateurs" element={<ProtectedRoute roles={['expert']}><AppLayout><Collaborateurs /></AppLayout></ProtectedRoute>} />
      <Route path="/devis" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Devis /></AppLayout></ProtectedRoute>} />
      <Route path="/factures" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Factures /></AppLayout></ProtectedRoute>} />
      <Route path="/lettres-mission" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><LettresMission /></AppLayout></ProtectedRoute>} />
      <Route path="/prospects" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Prospects /></AppLayout></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Pipeline /></AppLayout></ProtectedRoute>} />
      <Route path="/dimensionnement" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Dimensionnement /></AppLayout></ProtectedRoute>} />
      <Route path="/relances" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Relances /></AppLayout></ProtectedRoute>} />
      <Route path="/rentabilite" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Rentabilite /></AppLayout></ProtectedRoute>} />
      <Route path="/charge-travail" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><ChargeTravail /></AppLayout></ProtectedRoute>} />
      <Route path="/parametres" element={<ProtectedRoute roles={['expert']}><AppLayout><Parametres /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
