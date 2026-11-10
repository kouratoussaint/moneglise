import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, MessageCircle, Bell, ArrowDownLeft, ArrowUpRight, LockKeyhole, Layers, CheckCheck, Trash2, Search, ChevronDown, Cloud, ShieldCheck, Smartphone, Users, HeartHandshake } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { EnTete, IMAGES, SYMBOLE, Vide, useSelection, gestesSelection, BarreSelection } from '../../components/ui';
import { MODULES } from '../registre';
import { Icone } from '../../components/ui';

const quand = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};
const ICONE_NOTIF = { recette: ArrowDownLeft, depense: ArrowUpRight, rappel: LockKeyhole, groupe: Layers };

export function Notifications() {
  const { notifs, actions } = useApp();
  const nav = useNavigate();
  const sel = useSelection();
  const ouvrir = (n) => { actions.lireNotif(n.id); if (n.lien) nav(n.lien); };
  return (
    <div>
      <EnTete titre="Notifications" actions={notifs.length > 0 && <>
        <button className="btn-icone" aria-label="Tout marquer comme lu" onClick={actions.toutLire}><CheckCheck size={21} /></button>
        <button className="btn-icone" aria-label="Tout effacer" onClick={actions.viderNotifs}><Trash2 size={20} /></button>
      </>} />
      <BarreSelection sel={sel} tous={notifs.map((n) => n.id)} actions={[
        { label: 'Marquer comme lu', icone: CheckCheck, onClick: () => { sel.ids.forEach((id) => actions.lireNotif(id)); sel.vider(); } },
        { label: 'Supprimer', icone: Trash2, danger: true, onClick: () => { actions.masquerNotifs(sel.ids); sel.vider(); } },
      ]} />
      {notifs.length === 0 ? (
        <Vide icone="Inbox" titre="Aucune notification" texte="Vous serez prévenu ici des nouvelles opérations saisies par les gestionnaires et des mois à clôturer." />
      ) : (
        <div className="liste-notifs">
          {notifs.map((n, i) => {
            const I = ICONE_NOTIF[n.type] || Bell;
            return (
              <button key={n.id} className={`notif ${n.lu ? '' : 'non-lue'} ${n.type || ''}`} style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }} {...gestesSelection(sel, n.id, () => ouvrir(n))}>
                <span className="notif-icone"><I size={18} /></span>
                <span className="notif-texte"><strong>{n.titre}</strong><small>{n.texte}</small></span>
                <span className="notif-quand">{quand(n.le)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const AIDE = [
  { theme: 'Premiers pas', q: [
    ['Comment créer mon église ?', 'Sur l\'écran de connexion, touchez « Créer un compte », puis « Inscrire mon église ». Vous devenez l\'administrateur et quatre caisses de départ sont créées : Caisse Église, VIMAB, Construction et Dîmes des diacres. Vous pouvez les renommer ou les supprimer.'],
    ['Comment ajouter les responsables (pasteur, gestionnaires) ?', 'Menu › Utilisateurs et rôles › bouton +. Indiquez l\'adresse e-mail, le rôle et, pour un gestionnaire, ses caisses. La personne crée ensuite son compte avec cette même adresse : elle reçoit automatiquement son rôle.'],
    ['Comment un fidèle rejoint-il l\'église ?', 'Il crée un compte en choisissant « Rejoindre mon église ». Il voit alors les totaux des caisses, sans le détail des opérations.'],
  ] },
  { theme: 'Recettes et dépenses', q: [
    ['Saisir une recette ou une dépense', 'Touchez le bouton bleu + en bas de l\'écran, choisissez Recette ou Dépense, tapez le montant, la caisse, la date, le libellé et la catégorie, puis enregistrez.'],
    ['Je ne vois pas le bouton +', 'Seuls les profils autorisés à saisir le voient, et uniquement pour les caisses qui leur sont attribuées. Demandez à l\'administrateur de vérifier vos caisses et vos droits.'],
    ['Corriger ou supprimer une opération', 'Ouvrez l\'opération, puis touchez Modifier ou Supprimer. Ce n\'est plus possible si le mois est clôturé : il faut d\'abord le rouvrir.'],
    ['Faire un transfert entre caisses', 'Bouton + › Transfert, ou depuis la fiche d\'une caisse. Le transfert crée une dépense dans la caisse de départ et une recette dans celle d\'arrivée.'],
  ] },
  { theme: 'Caisses, clôtures et rapports', q: [
    ['Renommer ou supprimer une caisse', 'Ouvrez la caisse depuis l\'accueil, puis touchez les trois points en haut à droite. Une caisse qui contient des opérations est archivée pour garder l\'historique.'],
    ['À quoi sert la clôture mensuelle ?', 'Elle arrête les comptes d\'un mois : les opérations sont verrouillées et le solde de clôture devient le solde d\'ouverture du mois suivant. Les mois se clôturent dans l\'ordre.'],
    ['Importer des opérations depuis Excel', 'Ouvrez la caisse, touchez ⋮ puis « Importer depuis Excel » (ou le bouton + › Importer). Choisissez le fichier, indiquez quelle colonne contient la date, le libellé et le montant (une seule colonne, ou deux colonnes Entrées / Sorties), associez les catégories, puis vérifiez l\'aperçu : les lignes en erreur, les doublons et les lignes de total sont signalés. Un import peut être annulé en entier. Un modèle Excel est proposé au départ.'],
    ['Exporter, imprimer ou partager', 'Dans Opérations, l\'icône de téléchargement propose PDF, Excel, CSV, impression et partage (WhatsApp, e-mail…). Les rapports ont aussi leur bouton PDF. Seule la sélection filtrée est exportée.'],
  ] },
  { theme: 'Connexion et synchronisation', q: [
    ['Puis-je travailler sans internet ?', 'Oui. Les saisies sont enregistrées sur le téléphone et envoyées automatiquement au retour de la connexion. La pastille en haut de l\'accueil indique les modifications en attente.'],
    ['Comment actualiser les données ?', 'Tirez l\'écran vers le bas depuis le haut de la page, ou touchez la pastille de synchronisation.'],
    ['Attention avant de se déconnecter', 'Si des modifications sont en attente, connectez-vous à internet avant de vous déconnecter, sinon elles seront perdues.'],
    ['J\'ai oublié mon mot de passe', 'Contactez l\'administrateur de votre église. Une fois connecté, vous pouvez changer votre mot de passe dans Mon profil.'],
  ] },
  { theme: 'Droits et sécurité', q: [
    ['Qui peut voir quoi ?', 'L\'administrateur règle, pour chaque profil, ce qu\'il peut voir et faire : Menu › Droits d\'accès. Ces règles sont aussi appliquées par le serveur, pas seulement par l\'application.'],
    ['Que voient les fidèles ?', 'Uniquement les soldes et les totaux des caisses marquées « visibles par les fidèles ». L\'administrateur peut aussi limiter l\'affichage aux mois clôturés.'],
  ] },
];

export function Aide() {
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState(null);
  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    return AIDE.map((g) => ({ ...g, q: g.q.filter(([a, b]) => !t || `${a} ${b}`.toLowerCase().includes(t)) })).filter((g) => g.q.length);
  }, [q]);
  return (
    <div>
      <EnTete titre="Aide" />
      <div className="aide-hero" style={{ backgroundImage: `url(${IMAGES.lecture})` }}>
        <div className="aide-voile" />
        <div className="aide-contenu"><HeartHandshake size={26} /><strong>Comment pouvons-nous vous aider ?</strong></div>
      </div>
      <div className="recherche aide-recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans l'aide" /></div>
      {liste.length === 0 && <Vide icone="SearchX" titre="Aucune réponse trouvée" texte="Essayez avec un autre mot." />}
      {liste.map((g) => (
        <section key={g.theme} className="aide-groupe">
          <h3 className="menu-titre">{g.theme}</h3>
          <div className="menu">
            {g.q.map(([titre, texte]) => {
              const k = `${g.theme}-${titre}`, o = ouvert === k || !!q.trim();
              return (
                <div key={k} className={`faq ${o ? 'ouverte' : ''}`}>
                  <button onClick={() => setOuvert(ouvert === k ? null : k)} aria-expanded={o}><span>{titre}</span><ChevronDown size={18} /></button>
                  {o && <p>{texte}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const FONCTIONS = [
  { icone: 'Wallet', titre: 'Finances', texte: 'Caisses, recettes et dépenses, transferts, clôtures mensuelles, rapports, export PDF et Excel.' },
  { icone: 'MessageCircle', titre: 'Messagerie', texte: 'Discussions privées, groupes, annonces et discussion de l\'église, avec accusés de réception et de lecture.' },
  { icone: 'Bell', titre: 'Notifications', texte: 'Nouveaux messages, nouvelles opérations, demandes d\'adhésion et rappels, même application fermée.' },
  { icone: 'Building2', titre: 'Plusieurs églises', texte: 'Chaque église a ses caisses, ses règles et ses droits ; un pasteur peut suivre plusieurs églises.' },
  { icone: 'ShieldCheck', titre: 'Sécurité et validations', texte: 'Inscriptions validées, droits configurables par profil, règles appliquées par le serveur.' },
  { icone: 'Smartphone', titre: 'Même sans connexion', texte: 'Saisie hors ligne, envoi automatique au retour du réseau, synchronisation entre téléphones.' },
];

export function APropos() {
  return (
    <div>
      <EnTete titre="À propos" />
      <div className="apropos-tete">
        <svg className="apropos-arc" viewBox="0 0 360 200" preserveAspectRatio="none" aria-hidden="true"><path d="M-20 180 C 100 150, 260 90, 380 20" /></svg>
        <img src={SYMBOLE} alt="" width="84" height="84" />
        <h2>Mon Église</h2>
        <p>Toute votre église à portée de main</p>
        <span className="badge-version">Version 1.0</span>
      </div>
      <section className="bloc">
        <p>Mon Église est l'application de gestion et de communication des églises. Elle réunit au même endroit la vie financière, les échanges entre les membres et l'organisation de l'église, pour une gestion simple, transparente et partagée par tous les responsables.</p>
      </section>
      <h3 className="menu-titre">Ce que fait l'application</h3>
      <div className="fonctions">
        {FONCTIONS.map((f) => (
          <div key={f.titre} className="fonction"><span className="pastille" style={{ background: '#1F5FD614', color: '#1F5FD6' }}><Icone nom={f.icone} size={20} /></span><span><strong>{f.titre}</strong><small>{f.texte}</small></span></div>
        ))}
      </div>
      <h3 className="menu-titre">Modules</h3>
      <div className="menu">
        {MODULES.map((m) => (
          <div key={m.cle} className={`tiroir-module ${m.disponible ? '' : 'bientot'}`}><Icone nom={m.icone} size={18} /><span>{m.titre}</span>{!m.disponible && <small>Bientôt</small>}</div>
        ))}
      </div>
      <h3 className="menu-titre">Développeur</h3>
      <section className="bloc developpeur">
        <div className="dev-tete">
          <span className="dev-avatar">TK</span>
          <span><strong>KOURA Toussaint</strong><small>Développeur</small></span>
        </div>
        <div className="dev-contacts">
          <a className="btn btn-doux" href="tel:+22675493518"><Phone size={17} /> +226 75 49 35 18</a>
          <a className="btn btn-doux" href="tel:+22671222228"><Phone size={17} /> +226 71 22 22 28</a>
          <a className="btn btn-whatsapp" href="https://wa.me/22675493518" target="_blank" rel="noreferrer"><MessageCircle size={17} /> Écrire sur WhatsApp</a>
        </div>
      </section>
      <h3 className="menu-titre">Crédits</h3>
      <section className="bloc credits">
        <p>Photographies : Unsplash (licence Unsplash). Police : Outfit (SIL Open Font License). Pictogrammes : Lucide (licence ISC). Serveur : Supabase. Notifications : Firebase. Application : React et Capacitor.</p>
      </section>
      <p className="tiroir-pied">© {new Date().getFullYear()} Mon Église · KOURA Toussaint</p>
    </div>
  );
}

export function IconeNotifs({ className = '' }) {
  const { notifs } = useApp();
  const nav = useNavigate();
  const n = notifs.filter((x) => !x.lu).length;
  return (
    <button className={`cloche ${className}`} aria-label={`Notifications${n ? ` (${n} non lues)` : ''}`} onClick={() => nav('/notifications')}>
      <Bell size={20} />
      {n > 0 && <b>{n > 9 ? '9+' : n}</b>}
    </button>
  );
}
