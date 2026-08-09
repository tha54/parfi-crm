import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MicroPortalAuthProvider, useMicroPortalAuth } from './context/MicroPortalAuthContext';
import { PortalAuthProvider, usePortalAuth } from './context/PortalAuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Collaborateurs from './pages/Collaborateurs';
import Clients from './pages/Clients';
import ClientsACompleter from './pages/ClientsACompleter';
import Attributions from './pages/Attributions';
import ClientCockpit from './pages/ClientCockpit';
import Taches from './pages/Taches';
import Devis from './pages/Devis';
import Factures from './pages/Factures';
import LettresMission from './pages/LettresMission';
import Prospects from './pages/Prospects';
import Chiffrage from './pages/Chiffrage';
import Pipeline from './pages/Pipeline';
import Missions from './pages/Missions';
import Travaux from './pages/Travaux';
import Relances from './pages/Relances';
import Rentabilite from './pages/Rentabilite';
import ChargeTravail from './pages/ChargeTravail';
import MonEspace from './pages/MonEspace';
import MaJournee from './pages/MaJournee';
import HubCommunication from './pages/HubCommunication';
import Planning from './pages/Planning';
import Parametres from './pages/Parametres';
import MorningBriefing from './pages/MorningBriefing';
import GED from './pages/GED';
import PortalLogin from './pages/PortalLogin';
import PortalDashboard from './pages/PortalDashboard';
import PortalFactures from './pages/PortalFactures';
import PortalDocuments from './pages/PortalDocuments';
import PortalSignLDM from './pages/PortalSignLDM';
import Wiki from './pages/Wiki';
import Automations from './pages/Automations';
import TiimeImport from './pages/TiimeImport';
import ClientIntake from './pages/ClientIntake';
import Absences from './pages/Absences';
import Rapports from './pages/Rapports';
import Cabinet from './pages/Cabinet';
import MonPortefeuille from './pages/MonPortefeuille';
import DevisDetail from './pages/DevisDetail';
import LDMDetail from './pages/LDMDetail';
import Onboarding from './pages/Onboarding';
import Appels from './pages/Appels';
import ProspectsPipeline from './pages/ProspectsPipeline';
import FeuilleDeTTemps from './pages/FeuilleDeTTemps';
import ValidationTemps from './pages/ValidationTemps';
import Lettrage from './pages/Lettrage';
import MicroDashboard from './pages/MicroDashboard';
import MicroDevisList from './pages/MicroDevisList';
import MicroDevisForm from './pages/MicroDevisForm';
import MicroDevisDetail from './pages/MicroDevisDetail';
import MicroSignature from './pages/MicroSignature';
import MicroFacturesList from './pages/MicroFacturesList';
import MicroFactureForm from './pages/MicroFactureForm';
import MicroFactureDetail from './pages/MicroFactureDetail';
import MicroLivreRecettes from './pages/MicroLivreRecettes';
import MicroRelances from './pages/MicroRelances';
import MicroPortalLogin from './pages/MicroPortalLogin';
import MicroPortalDashboard from './pages/MicroPortalDashboard';
import { MicroPortalDevisList, MicroPortalDevisDetail } from './pages/MicroPortalDevis';
import { MicroPortalFacturesList, MicroPortalFactureDetail } from './pages/MicroPortalFactures';
import MicroPortalLivreRecettes from './pages/MicroPortalLivreRecettes';
import MicroPortalDevisForm from './pages/MicroPortalDevisForm';
import MicroPortalFactureForm from './pages/MicroPortalFactureForm';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function ProtectedMicroPortalRoute({ children }) {
  const { portalUser, loading } = useMicroPortalAuth();
  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;
  if (!portalUser) return <Navigate to="/micro-portail/login" replace />;
  return children;
}

function ProtectedPortalRoute({ children }) {
  const { portalUser, loading } = usePortalAuth();
  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;
  if (!portalUser) return <Navigate to="/portail" replace />;
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
      <Route path="/login" element={user ? <Navigate to="/ma-journee" replace /> : <Login />} />

      {/* Portail client (routes séparées, sans sidebar) */}
      <Route path="/portail" element={<PortalLogin />} />
      <Route path="/portail/dashboard" element={<ProtectedPortalRoute><PortalDashboard /></ProtectedPortalRoute>} />
      <Route path="/portail/factures"  element={<ProtectedPortalRoute><PortalFactures /></ProtectedPortalRoute>} />
      <Route path="/portail/documents" element={<ProtectedPortalRoute><PortalDocuments /></ProtectedPortalRoute>} />
      <Route path="/portail/signer/ldm/:id" element={<ProtectedPortalRoute><PortalSignLDM /></ProtectedPortalRoute>} />

      {/* CRM principal */}
      <Route path="/dashboard" element={<Navigate to="/ma-journee" replace />} />
      <Route path="/briefing"  element={<Navigate to="/ma-journee" replace />} />
      <Route path="/ma-journee" element={<ProtectedRoute><AppLayout><MaJournee /></AppLayout></ProtectedRoute>} />
      <Route path="/mon-espace" element={<Navigate to="/ma-journee" replace />} />
      <Route path="/clients" element={<ProtectedRoute><AppLayout><Clients /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/a-completer" element={<ProtectedRoute><AppLayout><ClientsACompleter /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id" element={<ProtectedRoute><AppLayout><ClientCockpit /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id/micro" element={<ProtectedRoute><AppLayout><MicroDashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id/micro/devis" element={<ProtectedRoute><AppLayout><MicroDevisList /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id/micro/devis/nouveau" element={<ProtectedRoute><AppLayout><MicroDevisForm /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id/micro/devis/:devisId" element={<ProtectedRoute><AppLayout><MicroDevisDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id/micro/factures" element={<ProtectedRoute><AppLayout><MicroFacturesList /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id/micro/factures/nouvelle" element={<ProtectedRoute><AppLayout><MicroFactureForm /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id/micro/factures/:factureId" element={<ProtectedRoute><AppLayout><MicroFactureDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id/micro/livre-recettes" element={<ProtectedRoute><AppLayout><MicroLivreRecettes /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id/micro/relances" element={<ProtectedRoute><AppLayout><MicroRelances /></AppLayout></ProtectedRoute>} />
      <Route path="/signature/:token" element={<MicroSignature />} />

      {/* Portail micro-entrepreneur (auth propre, sans sidebar CRM) */}
      <Route path="/micro-portail/login" element={<MicroPortalLogin />} />
      <Route path="/micro-portail/dashboard" element={<ProtectedMicroPortalRoute><MicroPortalDashboard /></ProtectedMicroPortalRoute>} />
      <Route path="/micro-portail/devis" element={<ProtectedMicroPortalRoute><MicroPortalDevisList /></ProtectedMicroPortalRoute>} />
      <Route path="/micro-portail/devis/nouveau" element={<ProtectedMicroPortalRoute><MicroPortalDevisForm /></ProtectedMicroPortalRoute>} />
      <Route path="/micro-portail/devis/:id" element={<ProtectedMicroPortalRoute><MicroPortalDevisDetail /></ProtectedMicroPortalRoute>} />
      <Route path="/micro-portail/factures" element={<ProtectedMicroPortalRoute><MicroPortalFacturesList /></ProtectedMicroPortalRoute>} />
      <Route path="/micro-portail/factures/nouvelle" element={<ProtectedMicroPortalRoute><MicroPortalFactureForm /></ProtectedMicroPortalRoute>} />
      <Route path="/micro-portail/factures/:id" element={<ProtectedMicroPortalRoute><MicroPortalFactureDetail /></ProtectedMicroPortalRoute>} />
      <Route path="/micro-portail/livre-recettes" element={<ProtectedMicroPortalRoute><MicroPortalLivreRecettes /></ProtectedMicroPortalRoute>} />
      <Route path="/micro-portail" element={<Navigate to="/micro-portail/login" replace />} />
      <Route path="/attributions" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Attributions /></AppLayout></ProtectedRoute>} />
      <Route path="/portefeuille" element={<ProtectedRoute><AppLayout><MonPortefeuille /></AppLayout></ProtectedRoute>} />
      <Route path="/taches" element={<ProtectedRoute><AppLayout><Taches /></AppLayout></ProtectedRoute>} />
      <Route path="/feuille-temps" element={<ProtectedRoute><AppLayout><FeuilleDeTTemps /></AppLayout></ProtectedRoute>} />
      <Route path="/validation-temps" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><ValidationTemps /></AppLayout></ProtectedRoute>} />
      <Route path="/missions" element={<ProtectedRoute><AppLayout><Missions /></AppLayout></ProtectedRoute>} />
      <Route path="/travaux" element={<ProtectedRoute><AppLayout><Travaux /></AppLayout></ProtectedRoute>} />
      <Route path="/planning" element={<ProtectedRoute><AppLayout><Planning /></AppLayout></ProtectedRoute>} />
      <Route path="/hub-communication" element={<ProtectedRoute><AppLayout><HubCommunication /></AppLayout></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><AppLayout><GED /></AppLayout></ProtectedRoute>} />
      <Route path="/collaborateurs" element={<ProtectedRoute roles={['expert']}><AppLayout><Collaborateurs /></AppLayout></ProtectedRoute>} />
      <Route path="/devis" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Devis /></AppLayout></ProtectedRoute>} />
      <Route path="/devis/:id" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><DevisDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/factures" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Factures /></AppLayout></ProtectedRoute>} />
      <Route path="/lettrage" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Lettrage /></AppLayout></ProtectedRoute>} />
      <Route path="/lettres-mission" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><LettresMission /></AppLayout></ProtectedRoute>} />
      <Route path="/lettres-mission/:id" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><LDMDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/onboarding/:dossierId" element={<ProtectedRoute><AppLayout><Onboarding /></AppLayout></ProtectedRoute>} />
      <Route path="/prospects-pipeline" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><ProspectsPipeline /></AppLayout></ProtectedRoute>} />
      <Route path="/prospects" element={<Navigate to="/prospects-pipeline?tab=prospects" replace />} />
      <Route path="/pipeline"  element={<Navigate to="/prospects-pipeline?tab=pipeline"  replace />} />
      <Route path="/chiffrage" element={<Navigate to="/devis" replace />} />
      <Route path="/dimensionnement" element={<Navigate to="/devis" replace />} />
      <Route path="/relances" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Relances /></AppLayout></ProtectedRoute>} />
      <Route path="/rentabilite" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Rentabilite /></AppLayout></ProtectedRoute>} />
      <Route path="/charge-travail" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><ChargeTravail /></AppLayout></ProtectedRoute>} />
      <Route path="/parametres" element={<ProtectedRoute roles={['expert']}><AppLayout><Parametres /></AppLayout></ProtectedRoute>} />
      <Route path="/wiki" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Wiki /></AppLayout></ProtectedRoute>} />
      <Route path="/automations" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Automations /></AppLayout></ProtectedRoute>} />
      <Route path="/tiime-import" element={<ProtectedRoute roles={['expert']}><AppLayout><TiimeImport /></AppLayout></ProtectedRoute>} />
      <Route path="/absences" element={<ProtectedRoute><AppLayout><Absences /></AppLayout></ProtectedRoute>} />
      <Route path="/rapports" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Rapports /></AppLayout></ProtectedRoute>} />
      <Route path="/appels" element={<ProtectedRoute roles={['expert', 'chef_mission']}><AppLayout><Appels /></AppLayout></ProtectedRoute>} />
      <Route path="/contrats" element={<Navigate to="/lettres-mission?tab=contrats" replace />} />
      <Route path="/intake" element={<ClientIntake />} />
      <Route path="*" element={<Navigate to="/ma-journee" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MicroPortalAuthProvider>
          <PortalAuthProvider>
            <AppRoutes />
          </PortalAuthProvider>
        </MicroPortalAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
