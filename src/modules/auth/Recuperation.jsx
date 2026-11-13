import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, MailCheck, ShieldCheck } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { Champ, EnTete } from '../../components/ui';

// Mot de passe oublié : code à 6 chiffres envoyé par e-mail, puis nouveau mot de passe
export function MotDePasseOublie() {
  const { actions, online } = useApp();
  const nav = useNavigate();
  const [etape, setEtape] = useState('email');
  const [f, setF] = useState({ email: '', code: '', mdp: '', mdp2: '' });
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(false);
  const envoyer = async () => {
    setAttente(true); setErreur('');
    const e = await actions.motDePasseOublie(f.email);
    setAttente(false);
    if (e) setErreur(e); else setEtape('code');
  };
  const valider = async () => {
    if (f.mdp.length < 6) return setErreur('Le mot de passe doit contenir au moins 6 caractères.');
    if (f.mdp !== f.mdp2) return setErreur('Les deux mots de passe ne correspondent pas.');
    setAttente(true); setErreur('');
    const e = await actions.reinitialiserAvecCode(f.email, f.code, f.mdp);
    setAttente(false);
    if (e) setErreur(e); else nav('/', { replace: true });
  };
  return (
    <div className="app"><main className="page formulaire">
      <EnTete titre="Mot de passe oublié" />
      {!online ? (
        <p className="note"><KeyRound size={16} /><span>En mode démonstration, demandez à l'administrateur de votre église de vous donner un mot de passe temporaire (Comptes et responsabilités).</span></p>
      ) : etape === 'email' ? (
        <div className="pile carte-form">
          <p className="texte-doux">Indiquez l'adresse e-mail de votre compte : vous recevrez un code à 6 chiffres.</p>
          <Champ label="Adresse e-mail"><input type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Champ>
          {erreur && <p className="erreur">{erreur}</p>}
          <button className="btn btn-primaire" disabled={attente || !f.email.includes('@')} onClick={envoyer}>Recevoir le code</button>
          <p className="texte-doux petit">Pas d'accès à votre e-mail ? L'administrateur ou le pasteur de votre église peut vous donner un mot de passe temporaire.</p>
        </div>
      ) : (
        <div className="pile carte-form">
          <p className="note"><MailCheck size={16} /><span>Un code a été envoyé à {f.email}. Pensez à vérifier les courriers indésirables.</span></p>
          <Champ label="Code reçu"><input inputMode="numeric" maxLength={8} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} className="code-otp" /></Champ>
          <Champ label="Nouveau mot de passe" aide="6 caractères minimum"><input type="password" value={f.mdp} onChange={(e) => setF({ ...f, mdp: e.target.value })} autoComplete="new-password" /></Champ>
          <Champ label="Confirmer le mot de passe"><input type="password" value={f.mdp2} onChange={(e) => setF({ ...f, mdp2: e.target.value })} autoComplete="new-password" /></Champ>
          {erreur && <p className="erreur">{erreur}</p>}
          <button className="btn btn-primaire" disabled={attente || f.code.length < 6} onClick={valider}>Changer le mot de passe</button>
          <button className="lien" onClick={envoyer} disabled={attente}>Renvoyer un code</button>
        </div>
      )}
      <p className="auth-bas"><Link to="/connexion">Retour à la connexion</Link></p>
    </main></div>
  );
}

// Après un mot de passe temporaire : choix obligatoire d'un nouveau mot de passe
export function ChangerMotDePasse() {
  const { actions, notifier } = useApp();
  const [f, setF] = useState({ mdp: '', mdp2: '' });
  const [erreur, setErreur] = useState('');
  return (
    <div className="pile carte-form changer-mdp">
      <span className="vide-icone"><ShieldCheck size={28} /></span>
      <h2>Choisissez votre mot de passe</h2>
      <p className="texte-doux">Vous vous êtes connecté avec un mot de passe temporaire. Choisissez maintenant votre propre mot de passe.</p>
      <Champ label="Nouveau mot de passe" aide="6 caractères minimum"><input type="password" value={f.mdp} onChange={(e) => setF({ ...f, mdp: e.target.value })} autoComplete="new-password" /></Champ>
      <Champ label="Confirmer"><input type="password" value={f.mdp2} onChange={(e) => setF({ ...f, mdp2: e.target.value })} autoComplete="new-password" /></Champ>
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="btn btn-primaire" onClick={async () => {
        if (f.mdp.length < 6) return setErreur('6 caractères minimum.');
        if (f.mdp !== f.mdp2) return setErreur('Les deux mots de passe ne correspondent pas.');
        const e = await actions.nouveauMotDePasse(f.mdp);
        if (e) setErreur(e); else notifier('Mot de passe enregistré');
      }}>Enregistrer</button>
    </div>
  );
}
