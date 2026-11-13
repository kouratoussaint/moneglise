import { useEffect, useState } from 'react';
import { Check, Plus, LogIn, Hourglass } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { listeEglises } from '../data/sync';
import { ROLES } from '../lib/permissions';
import { Champ, Feuille, LogoEglise, Segmente } from './ui';

// Choisir l'église active, rejoindre une autre église ou en inscrire une nouvelle
export default function MesEglises({ ouverte, onFermer }) {
  const { db, user, egliseId, mesAdhesions, actions, notifier, online } = useApp();
  const [mode, setMode] = useState('liste');
  const [liste, setListe] = useState(null);
  const [choix, setChoix] = useState('');
  const [f, setF] = useState({ nom: '', ville: '' });
  const [attente, setAttente] = useState(false);
  const fermer = () => { setMode('liste'); setChoix(''); setF({ nom: '', ville: '' }); onFermer(); };
  useEffect(() => {
    if (mode !== 'rejoindre') return;
    if (online) listeEglises().then(setListe).catch(() => setListe([]));
    else setListe(db.eglises.filter((e) => (e.statut || 'actif') === 'actif'));
  }, [mode, online, db]);
  const miennes = new Set(mesAdhesions.map((a) => a.eglise_id));
  const nomE = (id) => db.eglises.find((e) => e.id === id);

  const valider = async () => {
    setAttente(true);
    const err = mode === 'rejoindre' ? await actions.rejoindreEglise(choix) : await actions.creerAutreEglise(f);
    setAttente(false);
    if (err) return notifier(err, 'erreur');
    notifier(mode === 'rejoindre' ? 'Demande envoyée au administrateur de l’application' : 'Église inscrite : en attente de validation');
    fermer();
  };

  return (
    <Feuille ouverte={ouverte} onFermer={fermer} titre="Mes églises"
      pied={mode !== 'liste' && <><button className="btn btn-doux" onClick={() => setMode('liste')}>Retour</button><button className="btn btn-primaire" disabled={attente || (mode === 'rejoindre' ? !choix : !f.nom.trim())} onClick={valider}>{mode === 'rejoindre' ? 'Envoyer la demande' : 'Inscrire l\'église'}</button></>}>
      {mode === 'liste' && (
        <div className="pile">
          <div className="liste-contacts">
            {(user.role === 'super_admin' ? db.eglises.filter((e) => (e.statut || 'actif') === 'actif') : mesAdhesions.map((a) => ({ ...nomE(a.eglise_id), adhesion: a }))).filter((e) => e?.id).map((e) => (
              <button key={e.id} className={`contact ${e.id === egliseId ? 'choisi' : ''}`} onClick={() => { actions.changerEglise(e.id); fermer(); }}>
                <LogoEglise eglise={e} taille={40} />
                <span><strong>{e.nom}</strong><small>{e.adhesion ? ROLES[e.adhesion.role]?.label : e.ville}{e.adhesion?.statut === 'en_attente' || e.statut === 'en_attente' ? ' · en attente de validation' : ''}</small></span>
                {e.id === egliseId ? <Check size={18} className="texte-bleu" /> : (e.adhesion?.statut === 'en_attente' || e.statut === 'en_attente') && <Hourglass size={16} className="texte-doux" />}
              </button>
            ))}
          </div>
          {/* Seuls les pasteurs peuvent suivre plusieurs églises */}
          {mesAdhesions.some((a) => a.role === 'pasteur') && (
            <div className="actions-liste">
              <button onClick={() => setMode('rejoindre')}><LogIn size={20} /><span>Rejoindre une autre église<small>Comme pasteur ; l’administrateur de l’application validera votre demande</small></span></button>
              <button onClick={() => setMode('creer')}><Plus size={20} /><span>Inscrire une nouvelle église<small>Validation par l’administrateur de l’application</small></span></button>
            </div>
          )}
        </div>
      )}
      {mode === 'rejoindre' && (
        <Champ label="Église à rejoindre" aide={liste === null ? 'Chargement…' : 'Vous y serez inscrit comme pasteur après validation par l’administrateur de l’application.'}>
          <select value={choix} onChange={(e) => setChoix(e.target.value)}>
            <option value="">Choisir…</option>
            {(liste || []).filter((e) => !miennes.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.nom}{e.ville ? ` — ${e.ville}` : ''}</option>)}
          </select>
        </Champ>
      )}
      {mode === 'creer' && (
        <div className="pile">
          <Segmente valeur="creer" onChange={() => {}} options={[{ v: 'creer', l: 'Nouvelle église' }]} />
          <Champ label="Nom de l'église"><input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
          <Champ label="Ville"><input value={f.ville} onChange={(e) => setF({ ...f, ville: e.target.value })} /></Champ>
          <p className="texte-doux petit">L'inscription sera validée par l’administrateur de l’application. Vous pourrez la configurer en attendant.</p>
        </div>
      )}
    </Feuille>
  );
}
