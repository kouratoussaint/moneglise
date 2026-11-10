import { useNavigate } from 'react-router-dom';
import { Hourglass, Settings2, RefreshCw, LogOut, Repeat, XCircle } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { IMAGES, LogoEglise } from './ui';

// Écran affiché tant qu'une église ou une adhésion n'est pas validée
export default function EnAttente() {
  const { user, eglise, db, mesAdhesions, actions, online, notifier } = useApp();
  const nav = useNavigate();
  const egliseAttente = eglise?.statut === 'en_attente' || eglise?.statut === 'refuse';
  const refuse = user.statut === 'refuse' || eglise?.statut === 'refuse';
  const autres = mesAdhesions.filter((a) => a.id !== user.id && (a.statut || 'actif') === 'actif' && db.eglises.find((e) => e.id === a.eglise_id)?.statut !== 'en_attente');
  const nomEglise = eglise?.nom || db.eglises.find((e) => e.id === user.eglise_id)?.nom || 'votre église';

  return (
    <div className="attente">
      <div className="attente-visuel" style={{ backgroundImage: `url(${IMAGES.interieur})` }}><div className="attente-voile" /></div>
      <div className="attente-carte">
        <LogoEglise eglise={eglise} taille={64} />
        <span className={`attente-icone ${refuse ? 'refuse' : ''}`}>{refuse ? <XCircle size={26} /> : <Hourglass size={26} />}</span>
        {refuse ? (
          <><h1>Demande non retenue</h1><p>{egliseAttente ? `L'inscription de ${nomEglise} n'a pas été validée.` : `Votre demande d'adhésion à ${nomEglise} n'a pas été acceptée.`} Contactez l'administrateur pour en savoir plus.</p></>
        ) : egliseAttente ? (
          <><h1>Église en attente de validation</h1><p>L'inscription de <b>{nomEglise}</b> a bien été reçue. Le administrateur de l’application de Mon Église doit la valider avant que les membres puissent la rejoindre. En attendant, préparez sa configuration.</p></>
        ) : (
          <><h1>Adhésion en attente</h1><p>Votre demande pour rejoindre <b>{nomEglise}</b> a été envoyée. {user.role === 'pasteur' ? 'Le administrateur de l’application de Mon Église' : 'L\'administrateur de l\'église'} doit la valider : vous serez prévenu dès que c'est fait.</p></>
        )}
        <div className="pile">
          {egliseAttente && !refuse && user.role === 'admin' && <button className="btn btn-primaire btn-large" onClick={() => nav('/configuration')}><Settings2 size={18} /> Configurer mon église</button>}
          {autres.length > 0 && <button className="btn btn-doux" onClick={() => actions.changerEglise(autres[0].eglise_id)}><Repeat size={18} /> Aller à {db.eglises.find((e) => e.id === autres[0].eglise_id)?.nom}</button>}
          {online && <button className="btn btn-doux" onClick={async () => { const ok = await actions.synchroniser(); notifier(ok ? 'Vérification effectuée' : 'Pas de connexion', ok ? 'ok' : 'erreur', 'tic'); }}><RefreshCw size={18} /> Vérifier maintenant</button>}
          <button className="btn btn-danger-doux" onClick={async () => { await actions.deconnexion(); nav('/connexion', { replace: true }); }}><LogOut size={18} /> Se déconnecter</button>
        </div>
      </div>
    </div>
  );
}
