// Organisation unique des menus (menu latéral et menu Plus) : mêmes groupes, même ordre,
// chaque entrée une seule fois par menu
import { ChevronRight, Home, MessageCircle, Bell, UserRound, Building, Users, Network, CalendarDays, ListOrdered, BarChart3,
  LockKeyhole, ArrowLeftRight, Upload, Settings, Settings2, UserCog, UserCheck, ShieldCheck, Wallet, Tags, History, Trash2,
  LayoutDashboard, LifeBuoy, Info, Server, LogOut, CalendarClock } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useVue } from '../state/useVue';
import { totalNonLus } from '../lib/messagerie';
import { caissesEglise } from '../lib/finance';
import { MODULES } from '../modules/registre';
import { Icone } from './ui';

export function useMenu({ ouvrirEglises, deconnexion }) {
  const { db, user, eglise, egliseId, can, notifs, mesAdhesions, online } = useApp();
  const vue = useVue();
  if (!user || !db) return [];
  const superAdmin = user.role === 'super_admin';
  const voitDetail = vue.caisses.some(vue.detail);
  const msg = totalNonLus(db, user);
  const nonLues = notifs.filter((n) => !n.lu).length;
  const attente = can('admin.utilisateurs') ? db.users.filter((u) => u.eglise_id === egliseId && u.statut === 'en_attente').length : 0;
  const aValiderAppli = superAdmin ? db.eglises.filter((e) => e.statut === 'en_attente').length + db.users.filter((u) => u.statut === 'en_attente' && u.role === 'pasteur').length : 0;
  const saisie = caissesEglise(db, egliseId).some((c) => can('fin.saisir', c.id));
  const adminEglise = ['admin.caisses', 'admin.categories', 'admin.utilisateurs', 'admin.droits', 'admin.eglise'].some((d) => can(d));
  const groupes = [
    { titre: 'Mon espace', entrees: [
      { to: '/', icone: Home, l: 'Accueil' },
      can('msg.utiliser') && { to: '/messages', icone: MessageCircle, l: 'Messages', badge: msg, couleur: '#0E9F6E' },
      { to: '/notifications', icone: Bell, l: 'Notifications', badge: nonLues, couleur: '#C98A06' },
      { to: '/profil', icone: UserRound, l: 'Mon profil' },
      (mesAdhesions.length > 1 || superAdmin) && { action: ouvrirEglises, icone: Building, l: 'Mes églises', texte: eglise?.nom },
    ] },
    { titre: "Vie de l'église", entrees: [
      { to: '/fideles', icone: Users, l: 'Fidèles', couleur: '#0E9F6E' },
      { to: '/structures', icone: Network, l: 'Structures', couleur: '#7A4FD6' },
      { to: '/activites', icone: CalendarDays, l: 'Activités', couleur: '#D9475A' },
      { to: '/programmes', icone: CalendarClock, l: 'Programmes et services', couleur: '#C98A06' },
    ] },
    { titre: 'Finances', entrees: [
      voitDetail && { to: '/operations', icone: ListOrdered, l: 'Opérations' },
      voitDetail && { to: '/rapports', icone: BarChart3, l: 'Rapports' },
      voitDetail && { to: '/clotures', icone: LockKeyhole, l: 'Clôtures mensuelles', couleur: '#7A4FD6' },
      can('fin.transferer') && { to: '/transfert', icone: ArrowLeftRight, l: 'Transferts', couleur: '#2D8CF0' },
      saisie && { to: '/import', icone: Upload, l: 'Import Excel', couleur: '#0E9F6E' },
    ] },
    adminEglise && { titre: "Administration de l'église", entrees: [
      can('admin.eglise') && (eglise?.configuree
        ? { to: '/admin/eglise', icone: Settings, l: "Paramètres de l'église" }
        : { to: '/configuration', icone: Settings2, l: 'Assistant de configuration' }),
      can('admin.utilisateurs') && { to: '/admin/utilisateurs', icone: attente ? UserCheck : UserCog, l: 'Comptes et responsabilités', badge: attente },
      can('admin.droits') && { to: '/admin/droits', icone: ShieldCheck, l: "Droits d'accès" },
      can('admin.caisses') && { to: '/admin/caisses', icone: Wallet, l: 'Caisses' },
      can('admin.categories') && { to: '/admin/categories', icone: Tags, l: 'Catégories' },
      can('admin.eglise') && { to: '/historique', icone: History, l: 'Historique', couleur: '#5B6B86' },
      (can('admin.eglise') || can('fin.supprimer')) && { to: '/corbeille', icone: Trash2, l: 'Corbeille', couleur: '#D9475A' },
    ] },
    superAdmin && { titre: "Administration de l'application", entrees: [
      { to: '/console', icone: LayoutDashboard, l: "Console d'administration", badge: aValiderAppli, couleur: '#0B2A66' },
    ] },
    { titre: 'Bientôt', entrees: MODULES.filter((m) => !m.disponible).map((m) => ({ icone: m.icone, l: m.titre, bientot: true })) },
    { titre: 'Application', entrees: [
      { to: '/aide', icone: LifeBuoy, l: 'Aide' },
      { to: '/a-propos', icone: Info, l: 'À propos' },
      (adminEglise || superAdmin || !online) && { to: '/serveur', icone: Server, l: "Serveur de l'église" },
      { action: deconnexion, icone: LogOut, l: 'Se déconnecter', danger: true },
    ] },
  ];
  return groupes.filter(Boolean).map((g) => ({ ...g, entrees: g.entrees.filter(Boolean) })).filter((g) => g.entrees.length);
}

const IconeEntree = ({ e, size }) => (typeof e.icone === 'string' ? <Icone nom={e.icone} size={size} /> : <e.icone size={size} />);

export function MenuTiroir({ aller, actif, ...props }) {
  const groupes = useMenu(props);
  return groupes.map((g, i) => (
    <nav key={g.titre}>
      {i > 0 && <h4>{g.titre}</h4>}
      {g.entrees.map((e) => (e.bientot
        ? <div key={e.l} className="tiroir-module bientot"><IconeEntree e={e} size={18} /><span>{e.l}</span><small>Bientôt</small></div>
        : <button key={e.l} className={`tiroir-lien ${e.danger ? 'danger' : ''} ${e.to && actif === e.to ? 'actif' : ''}`} onClick={() => (e.to ? aller(e.to) : e.action?.())}>
            <IconeEntree e={e} size={20} /><span>{e.l}</span>{e.badge ? <b className="tiroir-badge">{e.badge}</b> : null}
          </button>))}
    </nav>
  ));
}

export function MenuPlus({ aller, ...props }) {
  const groupes = useMenu(props);
  return groupes.map((g) => (
    <div key={g.titre}>
      <h3 className="menu-titre">{g.titre}</h3>
      <div className={`menu ${g.titre === 'Bientôt' ? 'menu-bientot' : ''}`}>
        {g.entrees.map((e) => {
          const c = e.danger ? '#D9475A' : e.couleur || '#1F5FD6';
          return (
            <button key={e.l} className={`ligne-menu ${e.bientot ? 'bientot' : ''}`} disabled={e.bientot} onClick={() => (e.to ? aller(e.to) : e.action?.())}>
              <span className="pastille" style={{ background: `${c}14`, color: c }}><IconeEntree e={e} size={20} /></span>
              <span className="ligne-menu-texte"><strong>{e.l}</strong>{e.texte && <small>{e.texte}</small>}{e.bientot && <small>Bientôt disponible</small>}</span>
              {e.badge ? <b className="tiroir-badge">{e.badge}</b> : e.bientot ? null : <ChevronRight size={18} className="chevron" />}
            </button>
          );
        })}
      </div>
    </div>
  ));
}
