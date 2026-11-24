import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, ChevronDown, Server, MailCheck, Cloud, WifiOff } from 'lucide-react';
import { listeEglises, listeStructures } from '../../data/sync';
import { useApp } from '../../state/AppContext';
import { compteMemorise } from '../../lib/horsLigne';
import { Champ, IMAGES, SYMBOLE, Segmente, Toast } from '../../components/ui';

const DEMO = [
  { email: 'admin@demo.bf', l: 'Administrateur' },
  { email: 'pasteur@demo.bf', l: 'Pasteur' },
  { email: 'tresorier@demo.bf', l: 'Gestionnaire (Église, Construction)' },
  { email: 'vimab@demo.bf', l: 'Gestionnaire (VIMAB, Diacres)' },
  { email: 'fidele@demo.bf', l: 'Fidèle' },
  { email: 'superadmin@eglise360.app', l: 'Administrateur de l’application' },
];

function Cadre({ children }) {
  return (
    <div className="auth">
      <div className="auth-visuel" style={{ backgroundImage: `url(${IMAGES.louange})` }}>
        <div className="auth-voile" />
        <svg className="auth-arc" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-10 100 C 120 20, 280 10, 410 60" />
        </svg>
        <div className="auth-marque">
          <img src={SYMBOLE} alt="" width="64" height="64" />
          <div>
            <strong>Mon Église</strong>
            <span>Toute votre église à portée de main</span>
          </div>
        </div>
      </div>
      <div className="auth-carte">{children}</div>
      <Toast />
    </div>
  );
}

function ChampMdp({ value, onChange, placeholder = 'Mot de passe', autoComplete = 'current-password' }) {
  const [voir, setVoir] = useState(false);
  return (
    <div className="saisie-icone">
      <Lock size={18} />
      <input type={voir ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} required minLength={6} />
      <button type="button" className="btn-icone petit" aria-label={voir ? 'Masquer' : 'Afficher'} onClick={() => setVoir(!voir)}>{voir ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
  );
}

export function Connexion() {
  const { actions, user, pret, online } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState('');
  const [demo, setDemo] = useState(false);
  const [attente, setAttente] = useState(false);
  const [reseau, setReseau] = useState(() => navigator.onLine !== false);
  const memo = online ? compteMemorise() : null;
  useEffect(() => {
    const maj = () => setReseau(navigator.onLine !== false);
    window.addEventListener('online', maj); window.addEventListener('offline', maj);
    return () => { window.removeEventListener('online', maj); window.removeEventListener('offline', maj); };
  }, []);
  // Dernier compte utilisé : e-mail proposé d'office
  useEffect(() => { if (memo && !email) setEmail(memo.email); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (pret && user) return <Navigate to="/" replace />;
  if (!pret) return <div className="chargement"><span className="loader" /></div>;

  const soumettre = async (e) => {
    e.preventDefault();
    setAttente(true); setErreur('');
    const err = await actions.connexion(email, mdp);
    setAttente(false);
    if (err) setErreur(err); else nav('/', { replace: true });
  };
  return (
    <Cadre>
      <h1>Connexion</h1>
      <p className="texte-doux">Entrez l'adresse e-mail de votre compte.</p>
      {online && !reseau && (
        <p className="note"><WifiOff size={16} /><span>{memo ? `Pas de connexion internet : vous pouvez vous connecter avec le dernier compte utilisé sur ce téléphone (${memo.email}) et travailler sur les données de l'appareil.` : 'Pas de connexion internet : la première connexion sur ce téléphone doit se faire avec internet.'}</span></p>
      )}
      <form onSubmit={soumettre} className="pile">
        <div className="saisie-icone">
          <Mail size={18} />
          <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail" autoComplete="email" required />
        </div>
        <ChampMdp value={mdp} onChange={setMdp} />
        {erreur && <p className="erreur">{erreur}</p>}
        <button className="btn btn-primaire btn-large" disabled={attente}>{attente ? <span className="loader petit" /> : 'Se connecter'}</button>
      </form>
      <p className="auth-bas"><Link to="/mot-de-passe">Mot de passe oublié ?</Link></p>
      <p className="auth-bas">Pas encore de compte ? <Link to="/inscription">Créer un compte</Link></p>
      <ModeServeur />

      {!online && <button className={`demo-toggle ${demo ? 'ouvert' : ''}`} onClick={() => setDemo(!demo)}>
        Comptes de démonstration <ChevronDown size={16} />
      </button>}
      {!online && demo && (
        <div className="demo-liste">
          <p className="texte-doux petit">Mot de passe pour tous : <b>demo123</b></p>
          {DEMO.map((d) => (
            <button key={d.email} className="demo-item" onClick={() => { setEmail(d.email); setMdp('demo123'); setErreur(''); }}>
              <strong>{d.l}</strong><small>{d.email}</small>
            </button>
          ))}
        </div>
      )}
    </Cadre>
  );
}

function ModeServeur() {
  const { online } = useApp();
  return (
    <Link to="/serveur" className={`mode-serveur ${online ? 'en-ligne' : ''}`}>
      {online ? <Cloud size={15} /> : <Server size={15} />}
      {online ? 'Connecté au serveur de l\'église' : 'Mode démonstration · configurer le serveur'}
    </Link>
  );
}

export function Inscription() {
  const { actions, db, user, pret, online } = useApp();
  const nav = useNavigate();
  const [eglises, setEglises] = useState(null);
  const [attente, setAttente] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  useEffect(() => {
    if (!online) return;
    listeEglises().then(setEglises).catch(() => setEglises([]));
  }, [online]);
  const [f, setF] = useState({ prenom: '', nom: '', email: '', mdp: '', mdp2: '', mode: 'rejoindre', egliseIdChoisie: '', nouvelleEgliseNom: '', ville: '' });
  const [erreur, setErreur] = useState('');
  // Structures de l'église choisie : le fidèle indique celles dont il fait partie
  const [structuresEg, setStructuresEg] = useState([]);
  useEffect(() => {
    if (f.mode !== 'rejoindre' || !f.egliseIdChoisie) { setStructuresEg([]); return; }
    if (online) listeStructures(f.egliseIdChoisie).then(setStructuresEg);
    else setStructuresEg((db?.structures || []).filter((s) => s.eglise_id === f.egliseIdChoisie && s.actif !== false));
  }, [f.mode, f.egliseIdChoisie, online, db]);
  if (pret && user) return <Navigate to="/" replace />;
  if (!pret) return <div className="chargement"><span className="loader" /></div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const soumettre = async (e) => {
    e.preventDefault();
    if (f.mdp !== f.mdp2) return setErreur('Les deux mots de passe ne correspondent pas.');
    if (f.mode === 'rejoindre' && !f.egliseIdChoisie) return setErreur('Choisissez votre église.');
    setAttente(true); setErreur('');
    const err = await actions.inscription({ ...f, egliseIdChoisie: f.mode === 'rejoindre' ? f.egliseIdChoisie : null, nouvelleEgliseNom: f.mode === 'creer' ? f.nouvelleEgliseNom : null });
    setAttente(false);
    if (err === 'CONFIRMER') setConfirmer(true);
    else if (err) setErreur(err); else nav('/', { replace: true });
  };
  const listeChoix = online ? (eglises || []) : db.eglises.filter((e) => (e.statut || 'actif') === 'actif');


  if (confirmer) return (
    <Cadre>
      <div className="vide">
        <div className="vide-icone"><MailCheck size={28} /></div>
        <h3>Confirmez votre adresse e-mail</h3>
        <p>Un lien a été envoyé à {f.email}. Ouvrez-le, puis revenez vous connecter.</p>
        <Link to="/connexion" className="btn btn-primaire">Aller à la connexion</Link>
      </div>
    </Cadre>
  );

  return (
    <Cadre>
      <h1>Créer un compte</h1>
      <form onSubmit={soumettre} className="pile">
        <div className="deux-col">
          <Champ label="Prénom"><input value={f.prenom} onChange={set('prenom')} required autoComplete="given-name" /></Champ>
          <Champ label="Nom"><input value={f.nom} onChange={set('nom')} required autoComplete="family-name" /></Champ>
        </div>
        <Champ label="Adresse e-mail"><input type="email" inputMode="email" value={f.email} onChange={set('email')} required autoComplete="email" /></Champ>
        <Champ label="Mot de passe" aide="6 caractères minimum"><ChampMdp value={f.mdp} onChange={(v) => setF({ ...f, mdp: v })} autoComplete="new-password" /></Champ>
        <Champ label="Confirmer le mot de passe"><ChampMdp value={f.mdp2} onChange={(v) => setF({ ...f, mdp2: v })} placeholder="Retapez le mot de passe" autoComplete="new-password" /></Champ>

        <Segmente valeur={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={[{ v: 'rejoindre', l: 'Rejoindre mon église' }, { v: 'creer', l: 'Inscrire mon église' }]} />
        {f.mode === 'rejoindre' ? (
          <>
          <Champ label="Votre église" aide={online && eglises === null ? 'Chargement de la liste…' : 'Vous serez inscrit comme fidèle. L\'administrateur pourra changer votre rôle.'}>
            <select value={f.egliseIdChoisie} onChange={set('egliseIdChoisie')} required>
              <option value="">Choisir…</option>
              {listeChoix.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.ville ? ` — ${e.ville}` : ''}</option>)}
            </select>
          </Champ>
          {structuresEg.length > 0 && (
            <div className="champ"><span className="champ-label">Vos structures (facultatif)</span>
              <div className="puces enveloppe">{structuresEg.map((st) => (
                <button type="button" key={st.id} className={`puce ${(f.structures || []).includes(st.id) ? 'active' : ''}`}
                  onClick={() => setF({ ...f, structures: (f.structures || []).includes(st.id) ? f.structures.filter((x) => x !== st.id) : [...(f.structures || []), st.id] })}>{st.nom}</button>
              ))}</div>
              <span className="champ-aide">Votre adhésion à l'église est validée par l'administrateur, et celle à chaque structure par son président.</span>
            </div>
          )}
          </>
        ) : (
          <>
            <Champ label="Nom de l'église" aide="Vous en deviendrez l'administrateur après validation."><input value={f.nouvelleEgliseNom} onChange={set('nouvelleEgliseNom')} required /></Champ>
            <Champ label="Ville"><input value={f.ville} onChange={set('ville')} /></Champ>
          </>
        )}
        {erreur && <p className="erreur">{erreur}</p>}
        <button className="btn btn-primaire btn-large" disabled={attente}>{attente ? <span className="loader petit" /> : 'Créer mon compte'}</button>
      </form>
      <p className="auth-bas">Déjà inscrit ? <Link to="/connexion">Se connecter</Link></p>
    </Cadre>
  );
}
