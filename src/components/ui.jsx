import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowDownLeft, ArrowLeft, Menu, LifeBuoy, Info, MessageCircle, User, Bell, Smartphone, Settings2, History, Trash2, Hourglass, UserPlus, IdCard, BookOpen as BookOpen2, ArrowLeftRight, ArrowUpRight, Baby, BarChart3, BookOpen, Building2, CalendarDays, CheckCircle2, ChevronRight, Church, Circle, Gift, HandHeart, HandHelping, HardHat, Heart, Inbox, Landmark, LayoutGrid, LayoutList, List, Lock, LockKeyhole, LogOut, Megaphone, Music, Network, PiggyBank, Receipt, SearchX, Settings, ShieldCheck, Table2, Tags, UserCog, Users, Wallet, X,
} from 'lucide-react';
import { ROLES } from '../lib/permissions';
import { fcfa, initiales } from '../lib/format';
import { useApp } from '../state/AppContext';
import interieur from '../assets/img/interieur.webp';
import lecture from '../assets/img/lecture.webp';
import construction from '../assets/img/construction.webp';
import bible from '../assets/img/bible.webp';
import communaute from '../assets/img/communaute.webp';
import worship from '../assets/img/worship.webp';
import louange from '../assets/img/louange.webp';
import symbole from '../assets/img/symbole.png';

// Pile des éléments ouverts (feuilles, menu) : le bouton retour d'Android ferme le dernier ouvert
export const pileRetour = [];
export const MenuCtx = createContext({ ouvrir: () => {} });
export const useMenu = () => useContext(MenuCtx);

export const IMAGES = { interieur, lecture, construction, bible, communaute, worship, louange };
export const SYMBOLE = symbole;
export const ICONES_CAISSE = ['Church', 'Users', 'HardHat', 'HandHeart', 'Wallet', 'PiggyBank', 'Music', 'BookOpen', 'Heart', 'Baby', 'Gift', 'Landmark'];

const ICONES = { LifeBuoy, Info, MessageCircle, User, Bell, Smartphone, Settings2, History, Trash2, Hourglass, UserPlus, IdCard, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Baby, BarChart3, BookOpen, Building2, CalendarDays, Church, Circle, Gift, HandHeart, HandHelping, HardHat, Heart, Inbox, Landmark, LayoutGrid, LayoutList, List, Lock, LockKeyhole, LogOut, Megaphone, Music, Network, PiggyBank, Receipt, SearchX, Settings, ShieldCheck, Table2, Tags, UserCog, Users, Wallet };

export function Icone({ nom, size = 20, ...p }) {
  const C = ICONES[nom] || Circle;
  return <C size={size} strokeWidth={1.9} {...p} />;
}

export function EnTete({ titre, retour = true, actions, sousTitre }) {
  const nav = useNavigate();
  const menu = useMenu();
  return (
    <header className="entete">
      {retour ? (
        <button className="btn-icone" aria-label="Retour" onClick={() => nav(-1)}><ArrowLeft size={22} /></button>
      ) : (
        <button className="btn-icone" aria-label="Ouvrir le menu" onClick={menu.ouvrir}><Menu size={23} /></button>
      )}
      <div className="entete-titres">
        <h1>{titre}</h1>
        {sousTitre && <p>{sousTitre}</p>}
      </div>
      <div className="entete-actions">{actions}</div>
    </header>
  );
}

export function useRetour(ouvert, fermer) {
  const ref = useRef(fermer);
  ref.current = fermer;
  useEffect(() => {
    if (!ouvert) return undefined;
    const f = () => ref.current();
    pileRetour.push(f);
    const k = (e) => e.key === 'Escape' && f();
    window.addEventListener('keydown', k);
    return () => { const i = pileRetour.lastIndexOf(f); if (i >= 0) pileRetour.splice(i, 1); window.removeEventListener('keydown', k); };
  }, [ouvert]);
}

export function Feuille({ ouverte, onFermer, titre, children, pied }) {
  useRetour(ouverte, onFermer);
  if (!ouverte) return null;
  return (
    <div className="feuille-fond" onClick={onFermer}>
      <div className="feuille" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className="feuille-poignee" />
        {titre && (
          <div className="feuille-tete">
            <h2>{titre}</h2>
            <button className="btn-icone" aria-label="Fermer" onClick={onFermer}><X size={20} /></button>
          </div>
        )}
        <div className="feuille-corps">{children}</div>
        {pied && <div className="feuille-pied">{pied}</div>}
      </div>
    </div>
  );
}

export function Confirmation({ ouverte, titre, message, libelle = 'Confirmer', danger, onConfirmer, onFermer }) {
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={titre}
      pied={<>
        <button className="btn btn-doux" onClick={onFermer}>Annuler</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primaire'}`} onClick={() => { onConfirmer(); onFermer(); }}>{libelle}</button>
      </>}>
      <p className="texte-doux">{message}</p>
    </Feuille>
  );
}

export function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div key={toast.k} className={`toast toast-${toast.ton} ${toast.annuler ? 'avec-action' : ''}`} role="status">
      {toast.ton === 'erreur' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <span>{toast.message}</span>
      {toast.annuler && <button className="toast-action" onClick={() => { toast.annuler(); }}>Annuler</button>}
      {toast.annuler && <i className="toast-delai" />}
    </div>
  );
}

export function Vide({ icone = 'Inbox', titre, texte, action }) {
  return (
    <div className="vide">
      <div className="vide-icone"><Icone nom={icone} size={28} /></div>
      <h3>{titre}</h3>
      {texte && <p>{texte}</p>}
      {action}
    </div>
  );
}

export function Segmente({ options, valeur, onChange, petit }) {
  return (
    <div className={`segmente ${petit ? 'petit' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={valeur === o.v} className={valeur === o.v ? 'actif' : ''} onClick={() => onChange(o.v)}>
          {o.icone && <Icone nom={o.icone} size={16} />}{o.l && <span>{o.l}</span>}
        </button>
      ))}
    </div>
  );
}

export function Champ({ label, aide, erreur, children }) {
  return (
    <label className={`champ ${erreur ? 'champ-erreur' : ''}`}>
      <span className="champ-label">{label}</span>
      {children}
      {(erreur || aide) && <span className="champ-aide">{erreur || aide}</span>}
    </label>
  );
}

export function Interrupteur({ actif, onChange, label, aide, desactive }) {
  return (
    <button type="button" className="interrupteur-ligne" onClick={() => !desactive && onChange(!actif)} aria-pressed={actif} disabled={desactive}>
      <span className="interrupteur-texte"><span>{label}</span>{aide && <small>{aide}</small>}</span>
      <span className={`interrupteur ${actif ? 'on' : ''}`}><span /></span>
    </button>
  );
}

export function Montant({ valeur, type, grand, signe = true }) {
  const s = !signe || !type ? '' : type === 'recette' ? '+ ' : '− ';
  return <span className={`montant ${type || ''} ${grand ? 'grand' : ''}`}>{s}{fcfa(valeur)}</span>;
}

export function Avatar({ user, taille = 40 }) {
  const c = ROLES[user?.role]?.couleur || '#1F5FD6';
  if (user?.photo) return <img className="avatar photo" src={user.photo} alt="" width={taille} height={taille} style={{ width: taille, height: taille }} />;
  return <span className="avatar" style={{ width: taille, height: taille, background: `${c}1A`, color: c, fontSize: taille * 0.36 }}>{initiales(user)}</span>;
}

// Logo de l'église (ou pictogramme par défaut)
export function LogoEglise({ eglise, taille = 40 }) {
  if (eglise?.logo) return <img className="logo-eglise" src={eglise.logo} alt="" width={taille} height={taille} style={{ width: taille, height: taille, minWidth: taille }} />;
  return <i className="logo-eglise logo-defaut" style={{ width: taille, height: taille, minWidth: taille, maxWidth: taille }}><Church size={taille * 0.5} /></i>;
}

// Réduit une image choisie (photo, logo) en carré compressé, stocké directement dans les données
export function lireImage(fichier, taille = 160) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onerror = ko;
    r.onload = () => {
      const img = new Image();
      img.onerror = ko;
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = taille;
        const cote = Math.min(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, taille, taille);
        ctx.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, taille, taille);
        ok(c.toDataURL('image/jpeg', 0.78));
      };
      img.src = r.result;
    };
    r.readAsDataURL(fichier);
  });
}

export function BadgeRole({ role }) {
  const r = ROLES[role];
  return <span className="badge" style={{ color: r?.couleur, background: `${r?.couleur}14` }}>{r?.court}</span>;
}

export function PastilleCaisse({ caisse, taille = 40 }) {
  return (
    <span className="pastille" style={{ width: taille, height: taille, background: `${caisse?.couleur || '#1F5FD6'}18`, color: caisse?.couleur || '#1F5FD6' }}>
      <Icone nom={caisse?.icone || 'Wallet'} size={taille * 0.48} />
    </span>
  );
}

export function LigneMenu({ icone, titre, texte, onClick, couleur = '#1F5FD6', droite }) {
  return (
    <button className="ligne-menu" onClick={onClick}>
      <span className="pastille" style={{ background: `${couleur}14`, color: couleur }}><Icone nom={icone} size={20} /></span>
      <span className="ligne-menu-texte"><strong>{titre}</strong>{texte && <small>{texte}</small>}</span>
      {droite ?? <ChevronRight size={18} className="chevron" />}
    </button>
  );
}

// ---------- Sélection multiple (appui long), commune à toute l'application ----------
export function useSelection() {
  const [ids, setIds] = useState([]);
  const sel = {
    ids, actif: ids.length > 0,
    contient: (id) => ids.includes(id),
    basculer: (id) => setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])),
    choisir: (liste) => setIds(liste),
    vider: () => setIds([]),
  };
  useRetour(sel.actif, sel.vider);
  return sel;
}

// Gestes d'un élément sélectionnable : appui long = sélectionner ; en mode sélection, un appui ajoute/retire.
// L'état de l'appui est global (un seul doigt à la fois) pour survivre aux re-rendus pendant l'appui.
const appui = { t: null, long: false, id: null, depart: null };
export function gestesSelection(sel, id, ouvrir) {
  const annuler = () => { clearTimeout(appui.t); appui.t = null; };
  return {
    onPointerDown: (e) => {
      annuler(); appui.long = false; appui.id = id; appui.depart = { x: e.clientX, y: e.clientY };
      appui.t = setTimeout(() => { appui.long = true; if (navigator.vibrate) navigator.vibrate(25); sel.basculer(id); }, 450);
    },
    onPointerMove: (e) => { if (appui.depart && (Math.abs(e.clientX - appui.depart.x) > 8 || Math.abs(e.clientY - appui.depart.y) > 8)) annuler(); },
    onPointerUp: annuler, onPointerLeave: annuler, onPointerCancel: annuler,
    onContextMenu: (e) => { e.preventDefault(); annuler(); if (!(appui.long && appui.id === id)) { appui.long = true; appui.id = id; sel.basculer(id); } },
    onClick: (e) => {
      if (appui.long && appui.id === id) { appui.long = false; e.preventDefault(); return; }
      if (sel.actif) { e.preventDefault(); sel.basculer(id); } else ouvrir?.(e);
    },
    'data-selectionne': sel.contient(id) ? 'oui' : undefined,
  };
}

export function BarreSelection({ sel, tous = [], actions = [] }) {
  if (!sel.actif) return null;
  return (
    <div className="barre-selection" role="toolbar" aria-label="Sélection">
      <button className="btn-icone" aria-label="Annuler la sélection" onClick={sel.vider}><X size={21} /></button>
      <strong>{sel.ids.length} sélectionné{sel.ids.length > 1 ? 's' : ''}</strong>
      {tous.length > sel.ids.length && <button className="lien sur-sombre" onClick={() => sel.choisir(tous)}>Tout</button>}
      <span className="bs-actions">
        {actions.filter((a) => a && !a.cache).map((a) => (
          <button key={a.label} className={`btn-icone ${a.danger ? 'danger' : ''}`} aria-label={a.label} title={a.label} onClick={a.onClick} disabled={a.desactive}><a.icone size={20} /></button>
        ))}
      </span>
    </div>
  );
}

// Photo de reçu : redimensionnée (1400 px max) et compressée ; PDF : 3 Mo maximum
export function lirePiece(fichier) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onerror = ko;
    r.onload = () => {
      const base = { id: `pc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nom: fichier.name || 'piece' };
      if (fichier.type === 'application/pdf') {
        if (fichier.size > 3 * 1024 * 1024) return ko(new Error('PDF trop lourd (3 Mo maximum)'));
        return ok({ ...base, type: 'application/pdf', ext: 'pdf', taille: fichier.size, dataUrl: r.result });
      }
      const img = new Image();
      img.onerror = () => ko(new Error('Image illisible'));
      img.onload = () => {
        const k = Math.min(1, 1400 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const dataUrl = c.toDataURL('image/jpeg', 0.72);
        ok({ ...base, type: 'image/jpeg', ext: 'jpg', taille: Math.round(dataUrl.length * 0.75), dataUrl });
      };
      img.src = r.result;
    };
    r.readAsDataURL(fichier);
  });
}
