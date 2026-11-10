import { useState } from 'react';
import { Cloud, Server, CheckCircle2 } from 'lucide-react';
import { config, configIntegree, enregistrerConfig } from '../../config';
import { Champ, Confirmation, EnTete } from '../../components/ui';

// Écran de raccordement au serveur Supabase de l'église
export default function Serveur() {
  const c = config();
  const [f, setF] = useState({ url: c.source === 'appareil' ? c.url : '', cle: c.source === 'appareil' ? c.cle : '' });
  const [etat, setEtat] = useState('');
  const [attente, setAttente] = useState(false);
  const [demo, setDemo] = useState(false);

  const tester = async () => {
    setAttente(true); setEtat('');
    try {
      const url = f.url.trim().replace(/\/+$/, '');
      const r = await fetch(`${url}/rest/v1/rpc/liste_eglises`, { method: 'POST', headers: { apikey: f.cle.trim(), 'Content-Type': 'application/json' }, body: '{}' });
      if (r.status === 404) throw new Error('Serveur joint, mais le script d\'installation (schema.sql) n\'a pas été exécuté.');
      if (!r.ok) throw new Error(r.status === 401 ? 'Clé refusée. Copiez la clé « anon public ».' : `Réponse du serveur : ${r.status}`);
      enregistrerConfig(f);
      setEtat('ok');
      setTimeout(() => { window.location.hash = '#/connexion'; window.location.reload(); }, 900);
    } catch (e) {
      setEtat(e.message.includes('fetch') ? 'Serveur introuvable. Vérifiez l\'adresse et votre connexion internet.' : e.message);
    } finally { setAttente(false); }
  };

  return (
    <div className="app"><main className="page formulaire">
      <EnTete titre="Serveur de l'église" sousTitre={c.url ? 'Synchronisation en ligne active' : 'Mode démonstration (sans serveur)'} />
      <div className="note">{c.url ? <Cloud size={16} /> : <Server size={16} />}
        <span>{c.url ? `Connecté à ${c.url.replace('https://', '')}` : 'Les données restent sur ce téléphone. Raccordez un serveur Supabase gratuit pour partager les données entre tous les téléphones de l\'église.'}</span>
      </div>
      {configIntegree() && c.source === 'integre' ? (
        <p className="texte-doux">Le serveur est intégré à cette version de l'application.</p>
      ) : (
        <div className="pile carte-form">
          <Champ label="Adresse du projet (Project URL)"><input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://xxxx.supabase.co" inputMode="url" autoCapitalize="off" /></Champ>
          <Champ label="Clé publique (anon public)" aide="Supabase › Project Settings › API"><textarea rows={3} value={f.cle} onChange={(e) => setF({ ...f, cle: e.target.value })} autoCapitalize="off" spellCheck={false} /></Champ>
          {etat && etat !== 'ok' && <p className="erreur">{etat}</p>}
          {etat === 'ok' && <p className="alerte ok"><CheckCircle2 size={16} /> Serveur raccordé. Redémarrage…</p>}
          <button className="btn btn-primaire" disabled={attente || !f.url || !f.cle} onClick={tester}>{attente ? <span className="loader petit" /> : 'Tester et enregistrer'}</button>
          {c.source === 'appareil' && <button className="btn btn-doux" onClick={() => setDemo(true)}>Revenir au mode démonstration</button>}
        </div>
      )}
      <Confirmation ouverte={demo} onFermer={() => setDemo(false)} titre="Revenir au mode démonstration ?" message="Le téléphone ne sera plus raccordé au serveur. Les données en ligne restent intactes sur le serveur." libelle="Confirmer"
        onConfirmer={() => { enregistrerConfig(null); window.location.hash = '#/connexion'; window.location.reload(); }} />
    </main></div>
  );
}
