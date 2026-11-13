import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, SquarePen, Send, Check, CheckCheck, Clock3, Users, User, LifeBuoy, ArrowLeft, Info, Trash2, Megaphone, X, Pin, PinOff, BellOff, Bell, MailOpen, Mail, MessageCircle, MoreVertical, Copy } from 'lucide-react';
import { vibrer } from '../../lib/son';
import { useApp } from '../../state/AppContext';
import { conversationsDe, messagesDe, membresDe, personnes, personne, titreConv, statutMessage, nomCourt, TYPES_CONV, famille, lectureDe, presence } from '../../lib/messagerie';
import { ROLES } from '../../lib/permissions';
import { dateFr } from '../../lib/format';
import { Avatar, BadgeRole, Champ, Confirmation, EnTete, Feuille, Icone, Vide, Segmente, useSelection, gestesSelection, BarreSelection } from '../../components/ui';

const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const quandListe = (iso) => {
  if (!iso) return '';
  const d = new Date(iso), j = new Date();
  if (d.toDateString() === j.toDateString()) return heure(iso);
  const hier = new Date(j); hier.setDate(j.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return 'Hier';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const jourLabel = (iso) => {
  const d = new Date(iso), j = new Date();
  if (d.toDateString() === j.toDateString()) return 'Aujourd\'hui';
  const hier = new Date(j); hier.setDate(j.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return 'Hier';
  return dateFr(iso.slice(0, 10));
};

function AvatarConv({ db, conv, user, taille = 46 }) {
  if (conv.type === 'prive') {
    const autre = personne(db, (conv.membres || []).find((id) => id !== user.id));
    return <AvatarPresence db={db} u={autre} taille={taille} />;
  }
  const t = TYPES_CONV[conv.type] || TYPES_CONV.groupe;
  return <span className="pastille ronde" style={{ width: taille, height: taille, background: `${t.couleur}18`, color: t.couleur }}><Icone nom={t.icone} size={taille * 0.46} /></span>;
}

export function AvatarPresence({ db, u, taille = 40 }) {
  const p = u ? presence(db, u.id) : {};
  return <span className="avatar-presence"><Avatar user={u} taille={taille} />{p.enLigne && <i className="point-en-ligne" aria-label="En ligne" />}</span>;
}

function Coches({ statut }) {
  if (statut === 'attente') return <Clock3 size={14} className="coche attente" aria-label="En attente d'envoi" />;
  if (statut === 'envoye') return <Check size={15} className="coche" aria-label="Envoyé" />;
  return <CheckCheck size={15} className={`coche ${statut === 'lu' ? 'lu' : ''}`} aria-label={statut === 'lu' ? 'Lu' : 'Reçu'} />;
}

export function ListeMessages() {
  const { db, user, can, sync, actions, notifier, online } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [onglet, setOnglet] = useState(() => sessionStorage.getItem('e360:onglet-msg') || 'individuel');
  const [nouveau, setNouveau] = useState(false);
  const [cible, setCible] = useState(null);
  const [suppr, setSuppr] = useState(null);
  const sel = useSelection();
  const convs = useMemo(() => conversationsDe(db, user), [db, user]);
  const parFamille = (f) => convs.filter((c) => famille(c) === f);
  const nonLus = (f) => parFamille(f).reduce((t, c) => t + (c.sourdine ? 0 : c.nonLus), 0);
  const filtrees = parFamille(onglet).filter((c) => !q || titreConv(db, c, user).toLowerCase().includes(q.toLowerCase()) || c.dernier?.texte?.toLowerCase().includes(q.toLowerCase()));
  const file = online ? JSON.parse(localStorage.getItem('eglise360:sync:v1') || '{}').file || {} : {};
  const changerOnglet = (v) => { setOnglet(v); sessionStorage.setItem('e360:onglet-msg', v); };

  if (!can('msg.utiliser')) return <><EnTete titre="Messages" retour={false} /><Vide icone="Lock" titre="Messagerie désactivée" texte="L'administrateur de votre église n'a pas activé la messagerie pour votre profil." /></>;

  const marquerNonLu = (c) => actions.prefConversation(c.id, () => {
    const autres = messagesDe(db, c.id).filter((m) => m.auteur_id !== user.id);
    return { lu: autres.length > 1 ? autres[autres.length - 2].le : '' };
  });

  return (
    <div>
      <EnTete titre="Messages" retour={false} actions={<button className="btn-icone" aria-label="Nouvelle discussion" onClick={() => setNouveau(true)}><SquarePen size={21} /></button>} />
      <div className="onglets-msg">
        {[['individuel', 'Discussions', User], ['groupe', 'Groupes', Users]].map(([v, l, I]) => (
          <button key={v} className={onglet === v ? 'actif' : ''} onClick={() => changerOnglet(v)}>
            <I size={17} /><span>{l}</span>{nonLus(v) > 0 && <b>{nonLus(v)}</b>}
          </button>
        ))}
      </div>
      <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une discussion" /></div>
      <div className="liste-convs">
        {filtrees.map((c) => {
          const d = c.dernier;
          const auteur = d && d.auteur_id === user.id ? 'Vous' : d ? nomCourt(personne(db, d.auteur_id)) : '';
          const st = d && d.auteur_id === user.id ? statutMessage(db, c, d, !!file[`messages:${d.id}`]).statut : null;
          return (
            <div key={c.id} className="conv-rang">
            <button className={`conv ${c.nonLus ? 'non-lue' : ''} ${cible?.id === c.id ? 'appuyee' : ''}`} {...gestesSelection(sel, c.id, () => nav(`/messages/${c.id}`))}>
              <AvatarConv db={db} conv={c} user={user} />
              <span className="conv-texte">
                <span className="conv-ligne"><strong>{titreConv(db, c, user)}</strong><small>{c.epingle && <Pin size={12} />}{quandListe(d?.le)}</small></span>
                <span className="conv-ligne">
                  <span className="conv-apercu">{st && <Coches statut={st} />}{d ? (d.supprime ? <i>Message supprimé</i> : `${c.type !== 'prive' || d.auteur_id === user.id ? `${auteur} : ` : ''}${d.texte}`) : <i>Aucun message pour le moment</i>}</span>
                  {c.sourdine && <BellOff size={14} className="texte-doux" />}
                  {c.nonLus > 0 && <b className={`pastille-nonlu ${c.sourdine ? 'grise' : ''}`}>{c.nonLus}</b>}
                </span>
              </span>
            </button>
            <button className="conv-plus" aria-label="Actions sur la discussion" onClick={() => setCible(c)}><MoreVertical size={18} /></button>
            </div>
          );
        })}
        {filtrees.length === 0 && (onglet === 'individuel'
          ? <Vide icone="MessageCircle" titre="Aucune discussion privée" texte="Touchez le crayon en haut à droite pour écrire à un membre." action={<button className="btn btn-doux" onClick={() => setNouveau(true)}>Nouvelle discussion</button>} />
          : <Vide icone="Users" titre="Aucun groupe" texte="Les annonces et la discussion de l'église apparaîtront ici." />)}
      </div>
      <p className="astuce">Astuce : appuyez longuement pour sélectionner plusieurs discussions, ou touchez ⋮ pour les actions.</p>
      {(() => {
        const choisies = convs.filter((c) => sel.ids.includes(c.id));
        const pour = (f) => () => { choisies.forEach(f); sel.vider(); };
        return (
          <BarreSelection sel={sel} tous={filtrees.map((c) => c.id)} actions={[
            { label: 'Marquer comme lu', icone: MailOpen, onClick: pour((c) => actions.marquerLu(c.id)) },
            { label: 'Épingler', icone: Pin, onClick: pour((c) => actions.prefConversation(c.id, { epingle: !choisies.every((x) => x.epingle) })) },
            { label: 'Sourdine', icone: BellOff, onClick: () => { const on = !choisies.every((x) => x.sourdine); choisies.forEach((c) => actions.prefConversation(c.id, { sourdine: on })); notifier(on ? 'Discussions en sourdine' : 'Notifications réactivées', 'ok', 'tic'); sel.vider(); } },
            { label: 'Supprimer', icone: Trash2, danger: true, cache: !choisies.every((c) => ['prive', 'groupe', 'support'].includes(c.type)),
              onClick: () => { const le = new Date().toISOString(); choisies.forEach((c) => actions.prefConversation(c.id, { masque_avant: le })); notifier(`${choisies.length} discussion(s) supprimée(s)`, 'ok', 'depense', { annuler: () => choisies.forEach((c) => actions.prefConversation(c.id, { masque_avant: '' })) }); sel.vider(); } },
          ]} />
        );
      })()}
      {sync.statut === 'hors_ligne' && <p className="note"><Info size={16} /> Hors ligne : vos messages partiront au retour de la connexion.</p>}
      <NouvelleDiscussion ouverte={nouveau} onFermer={() => setNouveau(false)} />

      <Feuille ouverte={!!cible} onFermer={() => setCible(null)} titre={cible ? titreConv(db, cible, user) : ''}>
        {cible && (
          <div className="actions-liste">
            <button onClick={() => { setCible(null); nav(`/messages/${cible.id}`); }}><MessageCircle size={20} /><span>Ouvrir</span></button>
            <button onClick={() => { actions.prefConversation(cible.id, { epingle: !cible.epingle }); notifier(cible.epingle ? 'Discussion désépinglée' : 'Discussion épinglée en haut', 'ok', 'tic'); setCible(null); }}>{cible.epingle ? <PinOff size={20} /> : <Pin size={20} />}<span>{cible.epingle ? 'Désépingler' : 'Épingler en haut'}</span></button>
            {cible.nonLus > 0
              ? <button onClick={() => { actions.marquerLu(cible.id); setCible(null); }}><MailOpen size={20} /><span>Marquer comme lu</span></button>
              : <button onClick={() => { marquerNonLu(cible); setCible(null); }}><Mail size={20} /><span>Marquer comme non lu</span></button>}
            <button onClick={() => { actions.prefConversation(cible.id, { sourdine: !cible.sourdine }); notifier(cible.sourdine ? 'Notifications réactivées' : 'Discussion en sourdine', 'ok', 'tic'); setCible(null); }}>{cible.sourdine ? <Bell size={20} /> : <BellOff size={20} />}<span>{cible.sourdine ? 'Réactiver les notifications' : 'Mettre en sourdine'}<small>{cible.sourdine ? '' : 'Plus de notification pour cette discussion'}</small></span></button>
            {['prive', 'groupe', 'support'].includes(cible.type) && <button className="danger" onClick={() => { setSuppr(cible); setCible(null); }}><Trash2 size={20} /><span>Supprimer la discussion<small>Uniquement de votre téléphone : elle réapparaît si un nouveau message arrive</small></span></button>}
          </div>
        )}
      </Feuille>
      <Confirmation ouverte={!!suppr} onFermer={() => setSuppr(null)} danger libelle="Supprimer" titre="Supprimer cette discussion ?" message="Les messages actuels disparaîtront de votre liste. Les autres membres les conservent."
        onConfirmer={() => { actions.prefConversation(suppr.id, { masque_avant: new Date().toISOString() }); notifier('Discussion supprimée'); }} />
    </div>
  );
}

function NouvelleDiscussion({ ouverte, onFermer }) {
  const { db, user, can, actions, egliseId } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState('choix');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState([]);
  const [titre, setTitre] = useState('');
  const fermer = () => { setMode('choix'); setQ(''); setSel([]); setTitre(''); onFermer(); };
  const supers = personnes(db).filter((u) => u.role === 'super_admin' && u.id !== user.id);
  const estSuper = user.role === 'super_admin';
  const [portee, setPortee] = useState(egliseId);
  useEffect(() => { if (ouverte) actions.rafraichirAnnuaire(); }, [ouverte]);
  // Contacts : membres de l'église ; pour l’administrateur de l’application, aussi les administrateurs des autres églises
  // L’administrateur de l’application choisit une église (tous ses membres) ou « tous les administrateurs »
  const contacts = personnes(db).filter((u) => u.id !== user.id && u.actif !== false && (u.statut || 'actif') === 'actif' && (estSuper
    ? (portee === '_admins' ? u.role === 'admin' : u.eglise_id === portee)
    : (u.eglise_id === user.eglise_id || (user.role === 'admin' && u.role === 'super_admin'))))
    .filter((u) => !q || `${u.prenom} ${u.nom}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => `${a.prenom}${a.nom}`.localeCompare(`${b.prenom}${b.nom}`));
  const aller = (id) => { fermer(); nav(`/messages/${id}`); };
  const nomEglise = (id) => db.eglises.find((e) => e.id === id)?.nom;

  return (
    <Feuille ouverte={ouverte} onFermer={fermer} titre={mode === 'groupe' ? 'Nouveau groupe' : 'Nouvelle discussion'}
      pied={mode === 'groupe' && <><button className="btn btn-doux" onClick={() => setMode('choix')}>Retour</button><button className="btn btn-primaire" disabled={!titre.trim() || !sel.length} onClick={() => aller(actions.creerGroupe(titre, sel))}>Créer le groupe ({sel.length + 1})</button></>}>
      {mode === 'choix' && (
        <div className="pile">
          <div className="actions-liste">
            {can('msg.groupes') && <button onClick={() => setMode('groupe')}><Users size={20} /><span>Nouveau groupe<small>Plusieurs membres de l'église</small></span></button>}
            {user.role === 'admin' && supers.length > 0 && <button onClick={() => {
              const ex = db.conversations.find((c) => c.type === 'support' && c.eglise_id === egliseId);
              aller(ex ? ex.id : actions.creerGroupe('Support Mon Église', supers.map((u) => u.id), 'support'));
            }}><LifeBuoy size={20} /><span>Écrire au administrateur de l’application<small>Assistance de la plateforme Mon Église</small></span></button>}
          </div>
          {can('msg.prive') && <>
            {estSuper && (
              <label className="groupe-select large"><span>Afficher</span>
                <select value={portee} onChange={(e) => setPortee(e.target.value)}>
                  <option value="_admins">Tous les administrateurs</option>
                  {db.eglises.filter((e) => (e.statut || 'actif') === 'actif').map((e) => <option key={e.id} value={e.id}>Membres · {e.nom}</option>)}
                </select>
              </label>
            )}
            <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Écrire à…" /></div>
            <div className="liste-contacts">
              {contacts.map((u) => (
                <button key={u.id} className="contact" onClick={() => aller(actions.ouvrirPrive(u.id))}>
                  <AvatarPresence db={db} u={u} taille={40} />
                  <span><strong>{u.prenom} {u.nom}</strong><small>{ROLES[u.role]?.label}{u.eglise_id !== user.eglise_id ? ` · ${nomEglise(u.eglise_id) || 'autre église'}` : ''}{presence(db, u.id).texte ? ` · ${presence(db, u.id).texte}` : ''}</small></span>
                </button>
              ))}
              {contacts.length === 0 && <p className="texte-doux petit centre">Aucun membre trouvé.</p>}
            </div>
          </>}
        </div>
      )}
      {mode === 'groupe' && (
        <div className="pile">
          <Champ label="Nom du groupe"><input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Responsables JAD" maxLength={50} /></Champ>
          <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter des membres" /></div>
          <div className="liste-contacts">
            {contacts.filter((u) => u.eglise_id === user.eglise_id).map((u) => (
              <button key={u.id} className={`contact ${sel.includes(u.id) ? 'choisi' : ''}`} onClick={() => setSel(sel.includes(u.id) ? sel.filter((x) => x !== u.id) : [...sel, u.id])}>
                <Avatar user={u} taille={40} />
                <span><strong>{u.prenom} {u.nom}</strong><small>{ROLES[u.role]?.label}</small></span>
                <i className="case">{sel.includes(u.id) && <Check size={14} />}</i>
              </button>
            ))}
          </div>
        </div>
      )}
    </Feuille>
  );
}

export function Conversation() {
  const { id } = useParams();
  const { db, user, can, actions, online, notifier } = useApp();
  const nav = useNavigate();
  const notifierCopie = () => notifier('Texte copié', 'ok', 'tic');
  const gereGroupe = (db.conversations || []).find((c) => c.id === id)?.cree_par === user.id || can('admin.eglise');
  const conv = db.conversations?.find((c) => c.id === id);
  const [texte, setTexte] = useState('');
  const [detail, setDetail] = useState(null);
  const [infos, setInfos] = useState(false);
  const [suppr, setSuppr] = useState(null);
  const selM = useSelection();
  const bas = useRef(null);
  const zone = useRef(null);
  const masque = conv ? lectureDe(db, conv.id, user.id)?.masque_avant : null;
  const msgs = useMemo(() => (conv ? messagesDe(db, conv.id).filter((m) => !masque || m.le > masque) : []), [db, conv, masque]);
  const membres = useMemo(() => (conv ? membresDe(db, conv) : []), [db, conv]);
  const file = online ? JSON.parse(localStorage.getItem('eglise360:sync:v1') || '{}').file || {} : {};

  useEffect(() => { actions.ouvrirConversation(id); return () => actions.ouvrirConversation(null); }, [id]);
  const enBas = (doux) => bas.current?.scrollIntoView({ block: 'end', behavior: doux ? 'smooth' : 'auto' });
  useEffect(() => { actions.marquerLu(id); enBas(true); }, [msgs.length]);
  // À l'entrée dans la discussion, puis à chaque ouverture du clavier : dernier message visible
  useEffect(() => {
    const t = [0, 120, 400].map((d) => setTimeout(() => enBas(false), d));
    const surClavier = () => [60, 250].forEach((d) => setTimeout(() => enBas(false), d));
    const surResize = () => { if (document.activeElement === zone.current) surClavier(); };
    window.addEventListener('e360:clavier', surClavier);
    window.addEventListener('resize', surResize);
    window.visualViewport?.addEventListener('resize', surResize);
    return () => { t.forEach(clearTimeout); window.removeEventListener('e360:clavier', surClavier); window.removeEventListener('resize', surResize); window.visualViewport?.removeEventListener('resize', surResize); };
  }, [id]);
  // Hors temps réel (réseau instable), on vérifie aussi régulièrement les nouveaux messages
  useEffect(() => { if (!online) return undefined; const t = setInterval(() => actions.synchroniser(), 5000); return () => clearInterval(t); }, [online]);

  if (!conv) return <><EnTete titre="Discussion" /><Vide icone="MessageCircle" titre="Discussion introuvable" texte="Elle n'est peut-être pas encore synchronisée." /></>;
  const peutEcrire = can('msg.utiliser') && (conv.type !== 'annonces' || can('msg.annonces'));
  const envoyer = () => { if (!texte.trim()) return; actions.envoyerMessage(conv.id, texte); setTexte(''); if (zone.current) zone.current.style.height = 'auto'; };
  const titre = titreConv(db, conv, user);
  const autreId = conv.type === 'prive' ? conv.membres.find((x) => x !== user.id) : null;
  const pres = autreId ? presence(db, autreId) : null;
  const enLigne = membres.filter((u) => u.id !== user.id && presence(db, u.id).enLigne).length;
  const sousTitre = conv.type === 'prive'
    ? (pres.texte || ROLES[personne(db, autreId)?.role]?.label)
    : `${membres.length} membre${membres.length > 1 ? 's' : ''}${enLigne ? ` · ${enLigne} en ligne` : ''}`;
  let jourPrec = '';

  return (
    <div className="ecran-conv">
      <header className="entete entete-conv">
        <button className="btn-icone" aria-label="Retour" onClick={() => nav(-1)}><ArrowLeft size={22} /></button>
        <button className="conv-tete" onClick={() => setInfos(true)}>
          <AvatarConv db={db} conv={conv} user={user} taille={38} />
          <span><strong>{titre}</strong><small className={pres?.enLigne ? 'en-ligne' : ''}>{sousTitre}</small></span>
        </button>
      </header>

      <div className="fil">
        {msgs.length === 0 && <div className="fil-vide"><Icone nom={TYPES_CONV[conv.type]?.icone || 'MessageCircle'} size={28} /><p>{conv.type === 'annonces' ? 'Les annonces des responsables apparaîtront ici.' : 'Écrivez le premier message.'}</p></div>}
        {msgs.map((m, i) => {
          const moi = m.auteur_id === user.id;
          const jour = jourLabel(m.le);
          const sep = jour !== jourPrec; jourPrec = jour;
          const prec = msgs[i - 1];
          const suite = prec && prec.auteur_id === m.auteur_id && !sep && (Date.parse(m.le) - Date.parse(prec.le)) < 300000;
          const st = moi ? statutMessage(db, conv, m, !!file[`messages:${m.id}`]) : null;
          const auteur = personne(db, m.auteur_id);
          return (
            <div key={m.id}>
              {sep && <div className="fil-jour"><span>{jour}</span></div>}
              <div className={`bulle-ligne ${moi ? 'moi' : ''} ${suite ? 'suite' : ''}`}>
                {!moi && conv.type !== 'prive' && !suite && <Avatar user={auteur} taille={30} />}
                <button className={`bulle ${moi ? 'moi' : ''} ${m.supprime ? 'supprime' : ''} ${conv.type === 'annonces' ? 'annonce' : ''}`} {...gestesSelection(selM, m.id, () => !m.supprime && moi && setDetail(m))}>
                  {!moi && conv.type !== 'prive' && !suite && <span className="bulle-auteur" style={{ color: ROLES[auteur?.role]?.couleur }}>{nomCourt(auteur)}</span>}
                  <span className="bulle-texte">{m.supprime ? 'Message supprimé' : m.texte}</span>
                  <span className="bulle-meta">{heure(m.le)}{st && !m.supprime && <Coches statut={st.statut} />}</span>
                </button>
              </div>
            </div>
          );
        })}
        <div ref={bas} />
      </div>

      {(() => {
        const choisis = msgs.filter((m) => selM.ids.includes(m.id) && !m.supprime);
        return (
          <BarreSelection sel={selM} actions={[
            { label: 'Copier', icone: Copy, onClick: async () => { try { await navigator.clipboard.writeText(choisis.map((m) => m.texte).join('\n')); actions && notifierCopie(); } catch { /* */ } selM.vider(); } },
            { label: 'Supprimer pour tout le monde', icone: Trash2, danger: true, cache: !choisis.length || !choisis.every((m) => m.auteur_id === user.id),
              onClick: () => { choisis.forEach((m) => actions.supprimerMessage(m.id)); selM.vider(); } },
          ]} />
        );
      })()}
      {peutEcrire ? (
        <div className="saisie-msg">
          <textarea ref={zone} rows={1} value={texte} placeholder="Votre message" aria-label="Votre message"
            onFocus={() => [150, 400, 700].forEach((d) => setTimeout(() => enBas(false), d))}
            onChange={(e) => { setTexte(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); envoyer(); } }} />
          <button className="btn-envoyer" aria-label="Envoyer" disabled={!texte.trim()} onClick={envoyer}><Send size={20} /></button>
        </div>
      ) : (
        <p className="saisie-bloquee"><Megaphone size={16} /> Seuls les responsables autorisés publient ici.</p>
      )}

      <Feuille ouverte={!!detail} onFermer={() => setDetail(null)} titre="Détails du message">
        {detail && (() => {
          const st = statutMessage(db, conv, detail, !!file[`messages:${detail.id}`]);
          const lus = new Set((st.lus || []).map((x) => x.u.id)), recus = new Set((st.recus || []).map((x) => x.u.id));
          return (
            <div className="pile">
              <div className="bulle moi apercu"><span className="bulle-texte">{detail.texte}</span><span className="bulle-meta">{heure(detail.le)} <Coches statut={st.statut} /></span></div>
              {st.statut === 'attente' ? <p className="texte-doux">En attente d'envoi : le message partira dès que la connexion revient.</p> : (
                <>
                  <p className="texte-doux petit">Lu par {lus.size} sur {(st.autres || []).length} · Reçu par {recus.size} sur {(st.autres || []).length}</p>
                  <div className="liste-contacts">
                    {(st.autres || []).map((u) => (
                      <div key={u.id} className="contact">
                        <Avatar user={u} taille={34} />
                        <span><strong>{u.prenom} {u.nom}</strong><small>{lus.has(u.id) ? 'Lu' : recus.has(u.id) ? 'Reçu, pas encore lu' : 'Pas encore reçu'}</small></span>
                        <Coches statut={lus.has(u.id) ? 'lu' : recus.has(u.id) ? 'recu' : 'envoye'} />
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button className="btn btn-danger-doux" onClick={() => { setSuppr(detail); setDetail(null); }}><Trash2 size={18} /> Supprimer pour tout le monde</button>
            </div>
          );
        })()}
      </Feuille>

      <Feuille ouverte={infos} onFermer={() => setInfos(false)} titre={titre}>
        <p className="texte-doux petit">{conv.type === 'annonces' ? 'Canal d\'annonces de l\'église' : conv.type === 'eglise' ? 'Tous les membres de l\'église' : conv.type === 'support' ? 'Administrateurs de l\'église et administrateur de l’application' : conv.type === 'groupe' ? 'Groupe de discussion' : 'Message privé'}</p>
        <div className="liste-contacts">
          {membres.map((u) => (
            <div key={u.id} className="contact">
              <AvatarPresence db={db} u={u} taille={36} /><span><strong>{u.prenom} {u.nom}{u.id === user.id ? ' (vous)' : ''}</strong><small>{ROLES[u.role]?.label}{u.id !== user.id && presence(db, u.id).texte ? ` · ${presence(db, u.id).texte}` : ''}</small></span>
              {u.id !== user.id && can('msg.prive') && <button className="lien" onClick={() => { setInfos(false); nav(`/messages/${actions.ouvrirPrive(u.id)}`, { replace: true }); }}>Écrire</button>}
              {conv.type === 'groupe' && gereGroupe && u.id !== user.id && <button className="btn-icone petit" aria-label={`Retirer ${u.prenom}`} onClick={() => actions.modifierGroupe(conv.id, { membres: conv.membres.filter((x) => x !== u.id) })}><Trash2 size={16} /></button>}
            </div>
          ))}
        </div>
        {conv.type === 'groupe' && gereGroupe && (
          <div className="pile marge-haut">
            <Champ label="Nom du groupe"><input defaultValue={conv.titre} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== conv.titre && (actions.modifierGroupe(conv.id, { titre: e.target.value.trim() }), notifier('Groupe renommé', 'ok', 'tic'))} /></Champ>
            <button className="btn btn-danger-doux" onClick={() => { const r = actions.supprimerGroupe(conv.id); setInfos(false); notifier('Groupe supprimé', 'ok', 'depense', { annuler: () => actions.restaurer(r.corbeille) }); nav('/messages', { replace: true }); }}><Trash2 size={18} /> Supprimer le groupe</button>
          </div>
        )}
      </Feuille>
      <Confirmation ouverte={!!suppr} onFermer={() => setSuppr(null)} danger libelle="Supprimer" titre="Supprimer ce message ?" message="Il sera remplacé par « Message supprimé » chez tous les membres."
        onConfirmer={() => actions.supprimerMessage(suppr.id)} />
    </div>
  );
}
