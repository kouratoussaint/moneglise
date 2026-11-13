import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, RotateCcw, CheckCircle2, XCircle, Lock, LockOpen, FileSpreadsheet, Undo2, UserCog, Archive, History, ArrowRight } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { ACTIONS, TABLES_LIBELLES } from '../../lib/historique';
import { personne, nomCourt } from '../../lib/messagerie';
import { dateFr } from '../../lib/format';
import { Avatar, EnTete, Feuille, Vide } from '../../components/ui';

const ICONES = { creation: Plus, modification: Pencil, suppression: Trash2, restauration: RotateCcw, validation: CheckCircle2, refus: XCircle,
  cloture: Lock, reouverture: LockOpen, import: FileSpreadsheet, annulation_import: Undo2, changement_role: UserCog, archivage: Archive, demande_reouverture: LockOpen };
const COULEURS = { creation: '#0E9F6E', suppression: '#D9475A', refus: '#D9475A', modification: '#1F5FD6', restauration: '#7A4FD6', validation: '#0E9F6E',
  cloture: '#7A4FD6', reouverture: '#C98A06', import: '#0E9F6E', annulation_import: '#C98A06', changement_role: '#1F5FD6', archivage: '#5B6B86' };
const VERBES = { creation: 'a ajouté', modification: 'a modifié', suppression: 'a supprimé', restauration: 'a restauré', validation: 'a validé', refus: 'a refusé',
  cloture: 'a clôturé', reouverture: 'a rouvert', import: 'a importé', annulation_import: 'a annulé un import', changement_role: 'a changé le rôle de',
  archivage: 'a archivé', annulation: 'a annulé', demande_reouverture: 'a demandé la réouverture de', contre_passation: 'a contre-passé' };
const CHAMPS = { libelle: 'Libellé', montant: 'Montant', date: 'Date', categorie_id: 'Catégorie', description: 'Description', observations: 'Observations', type: 'Type',
  caisse_id: 'Caisse', nom: 'Nom', role: 'Rôle', statut: 'Statut', caisses: 'Caisses', actif: 'Actif', visible_fideles: 'Visible par les fidèles', couleur: 'Couleur', icone: 'Pictogramme' };
const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function Historique() {
  const { db, egliseId, user } = useApp();
  const nav = useNavigate();
  const [qui, setQui] = useState('');
  const [action, setAction] = useState('');
  const [table, setTable] = useState('');
  const [periode, setPeriode] = useState('30');
  const [detail, setDetail] = useState(null);
  const superAdmin = user.role === 'super_admin';
  const [egl, setEgl] = useState(superAdmin ? '' : egliseId);

  const entrees = useMemo(() => {
    const depuis = periode === 'tout' ? '' : new Date(Date.now() - Number(periode) * 86400000).toISOString();
    return (db.historique || [])
      .filter((h) => (superAdmin ? !egl || h.eglise_id === egl : h.eglise_id === egliseId) && (!qui || h.user_id === qui)
        && (!action || h.action === action) && (!table || h.table === table) && (!depuis || h.le >= depuis))
      .sort((a, b) => b.le.localeCompare(a.le)).slice(0, 400);
  }, [db.historique, egliseId, qui, action, table, periode, superAdmin, egl]);
  const auteurs = [...new Set((db.historique || []).filter((h) => h.eglise_id === egliseId).map((h) => h.user_id))].map((id) => personne(db, id)).filter(Boolean);
  let jourPrec = '';

  return (
    <div>
      <EnTete titre="Historique" sousTitre="Toutes les actions, avec leur auteur, la date et l'heure" />
      {superAdmin && (
        <select className="select-simple marge" value={egl} onChange={(e) => setEgl(e.target.value)}>
          <option value="">Toutes les églises</option>
          {db.eglises.filter((e) => e.id !== '_global').map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
      )}
      <div className="filtres-historique">
        <select value={qui} onChange={(e) => setQui(e.target.value)}><option value="">Toutes les personnes</option>{auteurs.map((u) => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}</select>
        <select value={action} onChange={(e) => setAction(e.target.value)}><option value="">Toutes les actions</option>{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={table} onChange={(e) => setTable(e.target.value)}><option value="">Tous les éléments</option>{Object.entries(TABLES_LIBELLES).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}</select>
        <select value={periode} onChange={(e) => setPeriode(e.target.value)}><option value="1">Aujourd'hui</option><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option><option value="365">12 derniers mois</option><option value="tout">Tout</option></select>
      </div>
      {entrees.length === 0 ? <Vide icone="Inbox" titre="Aucune action" texte="Les actions des membres (ajouts, modifications, suppressions, validations…) apparaîtront ici." /> : (
        <div className="liste-historique">
          {entrees.map((h) => {
            const jour = dateFr(h.le.slice(0, 10)); const sep = jour !== jourPrec; jourPrec = jour;
            const I = ICONES[h.action] || History; const auteur = personne(db, h.user_id);
            return (
              <div key={h.id}>
                {sep && <div className="fil-jour"><span>{jour}</span></div>}
                <button className="entree-historique" onClick={() => setDetail(h)}>
                  <span className="pastille" style={{ background: `${COULEURS[h.action] || '#5B6B86'}16`, color: COULEURS[h.action] || '#5B6B86' }}><I size={18} /></span>
                  <span className="eh-texte">{superAdmin && !egl && <small className="eh-eglise">{db.eglises.find((e) => e.id === h.eglise_id)?.nom || 'Application'}</small>}<span><b>{nomCourt(auteur)}</b> {VERBES[h.action] || h.action} {h.table && h.action !== 'import' && h.action !== 'annulation_import' ? `${(TABLES_LIBELLES[h.table] || '').toLowerCase()} ` : ''}<b>« {h.libelle} »</b></span><small>{heure(h.le)}{h.detail ? ` · ${h.detail}` : ''}</small></span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Feuille ouverte={!!detail} onFermer={() => setDetail(null)} titre={detail ? `${ACTIONS[detail.action] || detail.action} · ${TABLES_LIBELLES[detail.table] || ''}` : ''}>
        {detail && (
          <div className="pile">
            <div className="contact"><Avatar user={personne(db, detail.user_id)} taille={40} /><span><strong>{personne(db, detail.user_id)?.prenom} {personne(db, detail.user_id)?.nom}</strong><small>{dateFr(detail.le.slice(0, 10))} à {heure(detail.le)}</small></span></div>
            <p><b>{detail.libelle}</b>{detail.detail ? ` — ${detail.detail}` : ''}</p>
            {detail.avant && (
              <table className="tableau compact diff">
                <thead><tr><th>Champ</th><th>Avant</th><th /><th>Après</th></tr></thead>
                <tbody>{Object.keys(detail.avant).map((k) => (
                  <tr key={k}><td>{CHAMPS[k] || k}</td><td className="avant">{affiche(db, k, detail.avant[k])}</td><td><ArrowRight size={14} /></td><td className="apres">{affiche(db, k, detail.apres?.[k])}</td></tr>
                ))}</tbody>
              </table>
            )}
            {detail.lien && <button className="btn btn-doux" onClick={() => { setDetail(null); nav(detail.lien); }}>Voir l'élément</button>}
          </div>
        )}
      </Feuille>
    </div>
  );
}

function affiche(db, k, v) {
  if (v == null || v === '') return '—';
  if (k === 'categorie_id') return db.categories.find((c) => c.id === v)?.nom || 'Autre / N.P.';
  if (k === 'caisse_id') return db.caisses.find((c) => c.id === v)?.nom || v;
  if (k === 'montant') return `${Number(v).toLocaleString('fr-FR')} F CFA`;
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  return String(v);
}

export function Corbeille() {
  const { db, egliseId, user, can, actions, notifier } = useApp();
  // L'administrateur de l'application voit la corbeille de toutes les églises
  const entrees = (db.corbeille || []).filter((c) => (c.eglise_id === egliseId || user.role === 'super_admin') && (can('admin.eglise') || c.supprime_par === user.id))
    .sort((a, b) => b.le.localeCompare(a.le));
  return (
    <div>
      <EnTete titre="Corbeille" sousTitre="Les éléments supprimés peuvent être restaurés" />
      {entrees.length === 0 ? <Vide icone="Inbox" titre="La corbeille est vide" texte="Les opérations, caisses et catégories supprimées apparaîtront ici." /> : (
        <div className="bloc bloc-liste">
          {entrees.map((c) => (
            <div key={c.id} className="ligne-user">
              <span className="pastille" style={{ background: '#D9475A14', color: '#D9475A' }}><Trash2 size={18} /></span>
              <span className="ligne-user-texte"><strong>{c.libelle}</strong><small>{user.role === 'super_admin' ? `${db.eglises.find((e) => e.id === c.eglise_id)?.nom || 'Application'} · ` : ''}{TABLES_LIBELLES[c.table]} · supprimé par {nomCourt(personne(db, c.supprime_par))} le {dateFr(c.le.slice(0, 10))} à {heure(c.le)}</small></span>
              <button className="btn btn-doux petit" onClick={() => { actions.restaurer([c.id]); notifier('Élément restauré'); }}><RotateCcw size={16} /> Restaurer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
