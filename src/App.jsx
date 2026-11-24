import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AppProvider } from './state/AppContext';
import AppShell, { Garde, GardeSuper, GestionRetour } from './components/AppShell';
import { Connexion, Inscription } from './modules/auth/Auth';
import Serveur from './modules/auth/Serveur';
import { MotDePasseOublie } from './modules/auth/Recuperation';
import Accueil from './modules/finances/Accueil';
import Operations from './modules/finances/Operations';
import { OperationForm, OperationDetail } from './modules/finances/OperationForm';
import { CaisseDetail, Transfert } from './modules/finances/Caisse';
import { Clotures, Rapports } from './modules/finances/Rapports';
import { Plus, Profil, AdminEglise } from './modules/admin/Plus';
import { Notifications, Aide, APropos } from './modules/info/Info';
import { ListeMessages, Conversation } from './modules/messages/Messages';
import Configuration from './modules/admin/Configuration';
import Import from './modules/finances/Import';
import { Historique, Corbeille } from './modules/admin/Historique';
import Console from './modules/console/Console';
import Programmes from './modules/programmes/Programmes';
import Pilotage from './modules/pilotage/Pilotage';
import Institutions, { FicheCompte } from './modules/institutions/Institutions';
import { ListeFideles, FicheFidele } from './modules/membres/Fideles';
import { ListeStructures, DetailStructure } from './modules/structures/Structures';
import { SuiviCotisation } from './modules/structures/CaisseStructure';
import { ListeActivites, FicheActivite } from './modules/activites/Activites';
import { AdminCaisses, AdminCategories, AdminUtilisateurs, AdminDroits } from './modules/admin/Admin';
import { useVue } from './state/useVue';

// Réservé à ceux qui voient le détail d'au moins une caisse (de l'église ou d'une de leurs structures)
function GardeDetail({ children }) {
  const { caisses, detail } = useVue();
  return caisses.some(detail) ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <GestionRetour />
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          <Route path="/inscription" element={<Inscription />} />
          <Route path="/serveur" element={<Serveur />} />
          <Route path="/mot-de-passe" element={<MotDePasseOublie />} />
          <Route element={<AppShell />}>
            <Route index element={<Accueil />} />
            <Route path="operations" element={<GardeDetail><Operations /></GardeDetail>} />
            <Route path="operations/nouvelle" element={<OperationForm />} />
            <Route path="operations/:id" element={<OperationDetail />} />
            <Route path="operations/:id/modifier" element={<OperationForm />} />
            <Route path="caisses/:id" element={<CaisseDetail />} />
            <Route path="transfert" element={<Garde droit="fin.transferer"><Transfert /></Garde>} />
            <Route path="clotures" element={<GardeDetail><Clotures /></GardeDetail>} />
            <Route path="rapports" element={<GardeDetail><Rapports /></GardeDetail>} />
            <Route path="plus" element={<Plus />} />
            <Route path="profil" element={<Profil />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="configuration" element={<Garde droit="admin.eglise"><Configuration /></Garde>} />
            <Route path="import" element={<Import />} />
            <Route path="historique" element={<Garde droit="admin.eglise"><Historique /></Garde>} />
            <Route path="corbeille" element={<Corbeille />} />
            <Route path="fideles" element={<ListeFideles />} />
            <Route path="fideles/:id" element={<FicheFidele />} />
            <Route path="structures" element={<ListeStructures />} />
            <Route path="structures/:id" element={<DetailStructure />} />
            <Route path="cotisations/:id" element={<SuiviCotisation />} />
            <Route path="activites" element={<ListeActivites />} />
            <Route path="programmes" element={<Programmes />} />
            <Route path="pilotage" element={<Pilotage />} />
            <Route path="institutions" element={<Institutions />} />
            <Route path="institutions/:id" element={<FicheCompte />} />
            <Route path="activites/:id" element={<FicheActivite />} />
            <Route path="messages" element={<ListeMessages />} />
            <Route path="messages/:id" element={<Conversation />} />
            <Route path="aide" element={<Aide />} />
            <Route path="a-propos" element={<APropos />} />
            <Route path="admin/caisses" element={<Garde droit="admin.caisses"><AdminCaisses /></Garde>} />
            <Route path="admin/categories" element={<Garde droit="admin.categories"><AdminCategories /></Garde>} />
            <Route path="admin/utilisateurs" element={<Garde droit="admin.utilisateurs"><AdminUtilisateurs /></Garde>} />
            <Route path="admin/droits" element={<Garde droit="admin.droits"><AdminDroits /></Garde>} />
            <Route path="admin/eglise" element={<Garde droit="admin.eglise"><AdminEglise /></Garde>} />
            <Route path="admin/eglises" element={<Navigate to="/console?onglet=eglises" replace />} />
            <Route path="console" element={<GardeSuper><Console /></GardeSuper>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
