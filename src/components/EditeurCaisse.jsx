import { useApp } from '../state/AppContext';
import { Champ, Feuille, ICONES_CAISSE, IMAGES, Icone, Interrupteur } from './ui';

export const COULEURS = ['#1F5FD6', '#7A4FD6', '#C98A06', '#0E9F6E', '#D9475A', '#2D8CF0', '#0B2A66', '#5B6B86'];
export const nouvelleCaisse = () => ({ nom: '', description: '', icone: 'Wallet', couleur: COULEURS[0], image: 'communaute', visible_fideles: true });

// Feuille de création / modification d'une caisse (utilisée par l'administration et la fiche caisse)
export default function EditeurCaisse({ caisse, setCaisse, onFermer }) {
  const { actions, notifier } = useApp();
  const enregistrer = () => {
    if (!caisse.nom.trim()) return notifier('Donnez un nom à la caisse.', 'erreur');
    actions.enregistrerCaisse({ ...caisse, nom: caisse.nom.trim() });
    notifier(caisse.id ? 'Caisse modifiée' : 'Caisse créée');
    onFermer();
  };
  return (
    <Feuille ouverte={!!caisse} onFermer={onFermer} titre={caisse?.id ? 'Modifier la caisse' : 'Nouvelle caisse'}
      pied={<><button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button></>}>
      {caisse && (
        <div className="pile">
          <Champ label="Nom"><input value={caisse.nom} onChange={(e) => setCaisse({ ...caisse, nom: e.target.value })} placeholder="Ex. Caisse chorale" /></Champ>
          <Champ label="Description"><textarea rows={2} value={caisse.description} onChange={(e) => setCaisse({ ...caisse, description: e.target.value })} placeholder="D'où viennent les fonds de cette caisse ?" /></Champ>
          <div className="champ"><span className="champ-label">Pictogramme</span>
            <div className="grille-icones">{ICONES_CAISSE.map((i) => <button type="button" key={i} className={caisse.icone === i ? 'actif' : ''} onClick={() => setCaisse({ ...caisse, icone: i })} aria-label={i}><Icone nom={i} size={20} /></button>)}</div>
          </div>
          <div className="champ"><span className="champ-label">Couleur</span>
            <div className="grille-couleurs">{COULEURS.map((c) => <button type="button" key={c} style={{ background: c }} className={caisse.couleur === c ? 'actif' : ''} onClick={() => setCaisse({ ...caisse, couleur: c })} aria-label={c} />)}</div>
          </div>
          <div className="champ"><span className="champ-label">Image</span>
            <div className="grille-images">{Object.entries(IMAGES).map(([k, src]) => <button type="button" key={k} className={caisse.image === k ? 'actif' : ''} style={{ backgroundImage: `url(${src})` }} onClick={() => setCaisse({ ...caisse, image: k })} aria-label={k} />)}</div>
          </div>
          <Interrupteur label="Visible par les fidèles" aide="Les fidèles voient uniquement les totaux." actif={caisse.visible_fideles !== false} onChange={(v) => setCaisse({ ...caisse, visible_fideles: v })} />
        </div>
      )}
    </Feuille>
  );
}
