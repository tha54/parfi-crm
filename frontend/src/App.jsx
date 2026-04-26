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
      <Route path="/dashboard" element={
        <ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>
      } />
      <Route path="/clients" element={
        <ProtectedRoute><AppLayout><Clients /></AppLayout></ProtectedRoute>
      } />
      <Route path="/attributions" element={
        <ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Attributions /></AppLayout></ProtectedRoute>
      } />
      <Route path="/taches" element={
        <ProtectedRoute><AppLayout><Taches /></AppLayout></ProtectedRoute>
      } />
      <Route path="/collaborateurs" element={
        <ProtectedRoute roles={['expert']}><AppLayout><Collaborateurs /></AppLayout></ProtectedRoute>
      } />
      <Route path="/devis" element={
        <ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Devis /></AppLayout></ProtectedRoute>
      } />
      <Route path="/factures" element={
        <ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Factures /></AppLayout></ProtectedRoute>
      } />
      <Route path="/lettres-mission" element={
        <ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><LettresMission /></AppLayout></ProtectedRoute>
      } />
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
