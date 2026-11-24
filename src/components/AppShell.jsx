import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import {
  Home, ListOrdered, Plus, BarChart3, LayoutGrid, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Cloud, CloudOff, RefreshCw, AlertTriangle, X, Smartphone, MessageCircle, Upload,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useVue } from '../state/useVue';
import { MenuTiroir } from './Menu';
import { lireApplication } from '../lib/application';
import { Wrench } from 'lucide-react';
import { caissesEglise } from '../lib/finance';
import { ROLES } from '../lib/permissions';
import { Avatar, Champ, Confirmation, Feuille, LogoEglise, MenuCtx, SYMBOLE, Toast, pileRetour, useRetour } from './ui';
import { ecouterClics } from '../lib/notifications';
import { jouer } from '../lib/son';
import { totalNonLus } from '../lib/messagerie';
import EnAttente from './EnAttente';
import MesEglises from './MesEglises';
import { ChangerMotDePasse } from '../modules/auth/Recuperation';

export function useCaissesSaisie() {
  const { db, egliseId, can } = useApp();
  if (!db) return [];
  return caissesEglise(db, egliseId).filter((c) => can('fin.saisir', c.id));
}

// Bouton retour d'Android : ferme la fenêtre ouverte, sinon revient à l'écran précédent,
// et sur l'accueil demande un second appui avant de quitter.
export function GestionRetour() {
  const nav = useNavigate();
  const loc = useLocation();
  const { notifier } = useApp();
  const refs = useRef({});
  refs.current = { nav, loc, notifier };
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let poignee, dernier = 0;
    import('@capacitor/app').then(({ App }) => {
      poignee = App.addListener('backButton', () => {
        const { nav: n, loc: l, notifier: t } = refs.current;
        if (pileRetour.length) { pileRetour[pileRetour.length - 1](); return; }
        const racine = ['/', '/connexion'].includes(l.pathname);
        if (!racine) {
          if ((window.history.state?.idx ?? 0) > 0) n(-1); else n('/', { replace: true });
          return;
        }
        const maintenant = Date.now();
        if (maintenant - dernier < 2000) App.exitApp();
        else { dernier = maintenant; t('Appuyez encore sur retour pour quitter'); }
      });
    });
    return () => { Promise.resolve(poignee).then((p) => p?.remove()); };
  }, []);
  return null;
}

const ilYa = (iso) => {
  if (!iso) return 'jamais';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `il y a ${h} h` : `le ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

export function EtatSync({ compact }) {
  const { online, sync, actions } = useApp();
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  if (!online) return compact ? null : <div className="etat-sync demo"><Smartphone size={16} /><span>Mode démonstration · données sur ce téléphone</span></div>;
  const { statut, derniere, attente } = sync;
  const icone = statut === 'en_cours' ? <RefreshCw size={16} className="tourne" /> : statut === 'hors_ligne' ? <CloudOff size={16} /> : statut === 'erreur' ? <AlertTriangle size={16} /> : <Cloud size={16} />;
  const texte = statut === 'en_cours' ? 'Synchronisation…'
    : statut === 'hors_ligne' ? `Hors ligne${attente ? ` · ${attente} en attente` : ''}`
      : statut === 'reconnexion' ? 'Mot de passe requis pour synchroniser'
      : statut === 'erreur' ? 'Échec de la synchronisation'
        : attente ? `${attente} modification(s) à envoyer` : `Synchronisé ${ilYa(derniere)}`;
  if (compact) return <button className={`puce-sync ${statut}`} onClick={() => actions.synchroniser()} aria-label={texte}>{icone}{attente > 0 && <b>{attente}</b>}</button>;
  return (
    <div className={`etat-sync ${statut}`}>
      {icone}<span>{texte}</span>
      <button className="lien" disabled={statut === 'en_cours'} onClick={() => actions.synchroniser()}>Synchroniser</button>
    </div>
  );
}

// Session ouverte sans internet, application relancée : le serveur est de nouveau joignable,
// il suffit du mot de passe pour envoyer les modifications faites hors ligne
function Reconnexion() {
  const { sync, actions, notifier } = useApp();
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(false);
  const [plusTard, setPlusTard] = useState(false);
  if (sync.statut !== 'reconnexion' || plusTard) return null;
  const valider = async () => {
    setAttente(true); setErreur('');
    const e = await actions.reconnecter(mdp);
    setAttente(false);
    if (e) setErreur(e); else { setMdp(''); notifier('Reconnecté au serveur'); }
  };
  return (
    <Feuille ouverte onFermer={() => setPlusTard(true)} titre="Reconnexion au serveur"
      pied={<><button className="btn btn-doux" onClick={() => setPlusTard(true)}>Plus tard</button><button className="btn btn-primaire" disabled={mdp.length < 6 || attente} onClick={valider}>{attente ? 'Connexion…' : 'Se reconnecter'}</button></>}>
      <p className="texte-doux">Internet est de nouveau disponible. Saisissez votre mot de passe pour envoyer au serveur les modifications faites sans connexion{sync.attente ? ` (${sync.attente})` : ''}.</p>
      <Champ label="Mot de passe"><input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="current-password" /></Champ>
      {erreur && <p className="erreur">{erreur}</p>}
    </Feuille>
  );
}

function Tiroir({ ouvert, fermer }) {
  const vueMenu = useVue();
  const voitDetailMenu = vueMenu.caisses.some(vueMenu.detail);
  const { user, eglise, can, actions, sync, online, notifs, db, mesAdhesions, egliseId } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [deco, setDeco] = useState(false);
  const [eglises, setEglises] = useState(false);
  useEffect(() => { const o = () => setEglises(true); window.addEventListener('e360:mes-eglises', o); return () => window.removeEventListener('e360:mes-eglises', o); }, []);
  const adhesionsAttente = can('admin.utilisateurs') ? db.users.filter((u) => u.eglise_id === egliseId && u.statut === 'en_attente').length : 0;
  const eglisesAttente = user?.role === 'super_admin' ? db.eglises.filter((e) => e.statut === 'en_attente').length : 0;
  const nonLues = notifs.filter((n) => !n.lu).length;
  const msgNonLus = user ? totalNonLus(db, user) : 0;
  useRetour(ouvert, fermer);
  const aller = (to) => { fermer(); if (loc.pathname !== to) nav(to); };
  const Lien = ({ to, icone: I, l, couleur }) => (
    <button className={`tiroir-lien ${loc.pathname === to ? 'actif' : ''}`} onClick={() => aller(to)}>
      <I size={20} style={couleur ? { color: couleur } : undefined} /><span>{l}</span>
    </button>
  );
  const admin = ['admin.caisses', 'admin.categories', 'admin.utilisateurs', 'admin.droits', 'admin.eglise'].some((d) => can(d)) || user?.role === 'super_admin';
  if (!user) return null;
  return (
    <>
      <div className={`tiroir-fond ${ouvert ? 'ouvert' : ''}`} onClick={fermer} aria-hidden={!ouvert} />
      <aside className={`tiroir ${ouvert ? 'ouvert' : ''}`} aria-hidden={!ouvert} aria-label="Menu">
        <div className="tiroir-tete">
          <svg className="tiroir-arc" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true"><path d="M150 124 C 220 112, 275 80, 312 26" /></svg>
          <div className="tiroir-marque"><img src={SYMBOLE} alt="" width="34" height="34" /><strong>Mon Église</strong>
            <button className="btn-icone sur-sombre" aria-label="Fermer le menu" onClick={fermer}><X size={20} /></button>
          </div>
          <button className="tiroir-profil" onClick={() => aller('/profil')}>
            <Avatar user={user} taille={48} />
            <span><strong>{user.prenom} {user.nom}</strong><small>{ROLES[user.role].label}</small></span>
          </button>
          <button className="tiroir-eglise" onClick={() => { fermer(); setEglises(true); }}>
            <LogoEglise eglise={eglise} taille={30} /><span>{eglise?.nom}</span>
            {(mesAdhesions.length > 1 || user.role === 'super_admin') && <small>Changer</small>}
          </button>
        </div>
        <div className="tiroir-corps">
          <EtatSync />
          <MenuTiroir aller={aller} actif={loc.pathname} ouvrirEglises={() => { fermer(); setEglises(true); }} deconnexion={() => { fermer(); setDeco(true); }} />
          <p className="tiroir-pied">Mon Église · version 1.0 · Toute votre église à portée de main</p>
        </div>
      </aside>
      <MesEglises ouverte={eglises} onFermer={() => setEglises(false)} />
      <Confirmation ouverte={deco} onFermer={() => setDeco(false)} titre="Se déconnecter ?" libelle="Se déconnecter"
        message={online ? (sync.attente ? `${sync.attente} modification(s) n'ont pas encore été envoyées. Connectez-vous à internet avant de vous déconnecter pour ne rien perdre.` : 'Les données seront retirées de ce téléphone. Elles restent en sécurité sur le serveur.') : 'Vos données restent enregistrées sur l\'appareil.'}
        danger={!!(online && sync.attente)}
        onConfirmer={async () => { await actions.deconnexion(); nav('/connexion', { replace: true }); }} />
    </>
  );
}

// Tirer vers le bas pour actualiser
function useTirerPourActualiser(actualiser) {
  const [dist, setDist] = useState(0);
  const [charge, setCharge] = useState(false);
  const r = useRef({ actif: false, y0: 0, x0: 0, dist: 0 });
  const poser = (v) => { r.current.dist = v; setDist(v); };
  return {
    dist, charge,
    gestes: {
      onTouchStart: (e) => {
        if (window.scrollY > 2 || charge || pileRetour.length) return;
        r.current = { actif: true, y0: e.touches[0].clientY, x0: e.touches[0].clientX, dist: 0 };
      },
      onTouchMove: (e) => {
        if (!r.current.actif) return;
        const dy = e.touches[0].clientY - r.current.y0, dx = Math.abs(e.touches[0].clientX - r.current.x0);
        if (dx > dy || dy <= 0) { if (dx > 12) r.current.actif = false; poser(0); return; }
        poser(Math.min(120, dy * 0.5));
      },
      onTouchEnd: async () => {
        if (!r.current.actif) return;
        r.current.actif = false;
        if (r.current.dist >= 64) {
          setCharge(true); poser(58); jouer('tic');
          try { await actualiser(); } finally { setCharge(false); poser(0); }
        } else poser(0);
      },
    },
  };
}

export default function AppShell() {
  const maintenance = lireApplication(useApp().db).maintenance;
  const vue = useVue(); // avant tout retour anticipé (règle des hooks)
  const voitDetail = vue.caisses.some(vue.detail);
  const { user, pret, can, online, actions, notifier, db, eglise } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const [ajout, setAjout] = useState(false);
  const [menu, setMenu] = useState(false);
  const saisissables = useCaissesSaisie();
  const tirer = useTirerPourActualiser(async () => {
    if (online) {
      const ok = await actions.synchroniser();
      notifier(ok ? 'Données à jour' : 'Synchronisation impossible pour le moment', ok ? 'ok' : 'erreur', ok ? 'tic' : undefined);
    } else { await new Promise((res) => setTimeout(res, 600)); notifier('Données à jour', 'ok', 'tic'); }
  });
  const navRef = useRef(nav);
  navRef.current = nav;
  // Chaque écran s'ouvre en haut de page
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname])
  useEffect(() => {
    let retirer = () => {};
    ecouterClics((lien) => navRef.current(lien)).then((f) => { retirer = f; });
    return () => retirer();
  }, []);
  if (!pret) return <div className="chargement"><span className="loader" /></div>;
  if (!user) return <Navigate to="/connexion" replace />;
  const statutEglise = eglise?.statut || 'actif';
  const bloque = user.role !== 'super_admin' && ((user.statut || 'actif') !== 'actif' || statutEglise !== 'actif');
  const autorise = bloque && (user.statut || 'actif') === 'actif' && user.role === 'admin' && statutEglise === 'en_attente' && ['/configuration', '/profil'].includes(loc.pathname);

  const peutSaisir = saisissables.length > 0;
  // Onglets Opérations et Rapports : dès qu'on voit le détail d'au moins une caisse
  // (de l'église, ou de sa structure pour un trésorier ou un secrétaire) — même règle que l'accès aux écrans (#8)

  const peutTransferer = can('fin.transferer') && saisissables.some((c) => can('fin.transferer', c.id));
  const nonLus = totalNonLus(db, user);
  let tabs = [
    { to: '/', icone: Home, l: 'Accueil', fin: true },
    voitDetail && { to: '/operations', icone: ListOrdered, l: 'Opérations' },
    peutSaisir && { fab: true },
    can('msg.utiliser') && { to: '/messages', icone: MessageCircle, l: 'Messages', badge: nonLus },
    voitDetail && { to: '/rapports', icone: BarChart3, l: 'Rapports' },
  ].filter(Boolean);
  tabs.push({ to: '/plus', icone: LayoutGrid, l: 'Plus' });
  const enConversation = /^\/messages\/./.test(loc.pathname) || loc.pathname === '/configuration' || loc.pathname === '/import';
  const aller = (to) => { setAjout(false); nav(to); };

  return (
    <MenuCtx.Provider value={{ ouvrir: () => setMenu(true) }}>
      <div className="app" {...tirer.gestes}>
        <div className={`tirer ${tirer.charge ? 'charge' : ''}`} style={{ transform: `translate(-50%, ${tirer.dist - 52}px)`, opacity: Math.min(1, tirer.dist / 50) }} aria-hidden="true">
          <RefreshCw size={20} style={{ transform: tirer.charge ? undefined : `rotate(${tirer.dist * 3}deg)` }} className={tirer.charge ? 'tourne' : ''} />
        </div>
        <main className="page" key={loc.pathname} style={tirer.dist && !tirer.charge ? { transform: `translateY(${tirer.dist * 0.4}px)` } : undefined}>
          {maintenance.actif && user.role !== 'super_admin' ? (
            <div className="attente"><div className="attente-carte"><span className="attente-icone"><Wrench size={26} /></span><h1>Maintenance en cours</h1><p>{maintenance.message}</p></div></div>
          ) : user.doit_changer_mdp ? <ChangerMotDePasse /> : bloque && !autorise ? <EnAttente /> : <Outlet />}
        </main>
        <nav className={`nav-bas ${bloque ? 'masquee' : ''} ${enConversation ? 'masquee' : ''} ${tabs.length >= 6 ? 'serre' : ''}`} aria-label="Navigation principale">
          {tabs.map((t) => t.fab ? (
            <button key="fab" className={`fab ${ajout ? 'ouvert' : ''}`} aria-label="Ajouter une opération" onClick={() => setAjout(true)}><Plus size={26} strokeWidth={2.4} /></button>
          ) : (
            <NavLink key={t.to} to={t.to} end={t.fin} className={({ isActive }) => `nav-item ${isActive ? 'actif' : ''}`}>
              <span className="nav-icone"><t.icone size={22} strokeWidth={1.9} />{t.badge > 0 && <b>{t.badge > 99 ? '99+' : t.badge}</b>}</span>
              <span>{t.l}</span>
            </NavLink>
          ))}
        </nav>
        <Feuille ouverte={ajout} onFermer={() => setAjout(false)} titre="Nouvelle opération">
          <div className="choix-ajout">
            <button className="choix recette" onClick={() => aller('/operations/nouvelle?type=recette')}>
              <span><ArrowDownLeft size={24} /></span><strong>Recette</strong><small>Dîme, offrande, don, contribution</small>
            </button>
            <button className="choix depense" onClick={() => aller('/operations/nouvelle?type=depense')}>
              <span><ArrowUpRight size={24} /></span><strong>Dépense</strong><small>Facture, achat, aide, paiement</small>
            </button>
            <button className="choix transfert import" onClick={() => aller('/import')}>
              <span><Upload size={22} /></span><strong>Importer</strong><small>Depuis un fichier Excel</small>
            </button>
            {peutTransferer && (
              <button className="choix transfert" onClick={() => aller('/transfert')}>
                <span><ArrowLeftRight size={24} /></span><strong>Transfert</strong><small>D'une caisse vers une autre</small>
              </button>
            )}
          </div>
        </Feuille>
        <Tiroir ouvert={menu} fermer={() => setMenu(false)} />
        <Reconnexion />
        <Toast />
      </div>
    </MenuCtx.Provider>
  );
}

export function Garde({ droit, children }) {
  const { can } = useApp();
  if (!can(droit)) return <Navigate to="/" replace />;
  return children;
}

export function GardeSuper({ children }) {
  const { user } = useApp();
  if (user?.role !== 'super_admin') return <Navigate to="/" replace />;
  return children;
}
