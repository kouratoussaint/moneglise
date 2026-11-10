import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, ArrowLeftRight, ListOrdered, LockKeyhole, ChevronRight, ArrowDown, AlertTriangle, MoreVertical, Pencil, Eye, EyeOff, FileText, FileSpreadsheet, Share2, Tags, Trash2, Upload } from 'lucide-react';
import EditeurCaisse from '../../components/EditeurCaisse';
import { exporterExcel, exporterOperationsPDF, partagerTexte } from '../../lib/exporter';
import { useApp } from '../../state/AppContext';
import { useVue } from '../../state/useVue';
import { useCaissesSaisie } from '../../components/AppShell';
import { totaux, parMois, caissesEglise, estVerrouille, soldeCaisse } from '../../lib/finance';
import { fcfa, lastMonths, ymOf, moisLabel, num, today, parseMontant } from '../../lib/format';
import { Avatar, Champ, Confirmation, EnTete, Feuille, IMAGES, Icone, PastilleCaisse, Vide } from '../../components/ui';
import { LigneSolde, BarresMois } from './Graphiques';
import { LigneOperation } from './Operations';

export function CaisseDetail() {
  const { id } = useParams();
  const { db, can, aujourdhui, actions, notifier, eglise, user } = useApp();
  const { caisses, ops: tous, detail } = useVue();
  const nav = useNavigate();
  const c = caisses.find((x) => x.id === id);
  const restreint = !detail(c);
  const [menu, setMenu] = useState(false);
  const [edition, setEdition] = useState(null);
  const [suppr, setSuppr] = useState(false);

  const s = useMemo(() => {
    if (!c) return null;
    const ops = tous.filter((o) => o.caisse_id === id);
    const mois = lastMonths(6, ymOf(aujourdhui));
    let cumul = totaux(ops.filter((o) => o.date < `${mois[0]}-01`)).solde;
    const pm = parMois(ops, mois).map((m) => ({ ...m, cumul: (cumul += m.solde) }));
    return { ops, t: totaux(ops), mm: totaux(ops.filter((o) => ymOf(o.date) === ymOf(aujourdhui))), pm, recentes: [...ops].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6) };
  }, [c, tous, id, aujourdhui]);

  if (!c) return <><EnTete titre="Caisse" /><Vide icone="Wallet" titre="Caisse introuvable" texte="Elle n'existe plus ou n'est pas visible pour votre profil." /></>;
  const gest = db.users.filter((u) => u.role === 'gestionnaire' && u.caisses?.includes(c.id));

  return (
    <div>
      <div className="banniere" style={{ backgroundImage: `url(${IMAGES[c.image] || IMAGES.communaute})` }}>
        <span className="banniere-teinte" style={{ background: `linear-gradient(180deg, rgba(11,42,102,.25), ${c.couleur}F2 85%)` }} />
        <div className="banniere-barre">
          <button className="btn-icone sur-image" aria-label="Retour" onClick={() => nav(-1)}><ArrowLeft size={22} /></button>
          <button className="btn-icone sur-image" aria-label="Actions sur la caisse" onClick={() => setMenu(true)}><MoreVertical size={22} /></button>
        </div>
        <div className="banniere-contenu">
          <span className="banniere-icone"><Icone nom={c.icone} size={22} /></span>
          <h1>{c.nom}</h1>
          <p>{c.description}</p>
          <span className="banniere-solde-label">Solde actuel</span>
          <strong className="banniere-solde">{fcfa(s.t.solde)}</strong>
        </div>
      </div>

      <div className="actions-rapides">
        {can('fin.saisir', c.id) && <Link to={`/operations/nouvelle?type=recette&caisse=${c.id}`}><span className="pastille vert"><Plus size={20} /></span>Recette</Link>}
        {can('fin.saisir', c.id) && <Link to={`/operations/nouvelle?type=depense&caisse=${c.id}`}><span className="pastille or"><Plus size={20} /></span>Dépense</Link>}
        {can('fin.transferer', c.id) && <Link to={`/transfert?source=${c.id}`}><span className="pastille bleu"><ArrowLeftRight size={20} /></span>Transfert</Link>}
        {detail(c) && <Link to={`/operations?caisse=${c.id}`}><span className="pastille gris"><ListOrdered size={20} /></span>Opérations</Link>}
        {detail(c) && <Link to={`/clotures?caisse=${c.id}`}><span className="pastille violet"><LockKeyhole size={20} /></span>Clôtures</Link>}
      </div>

      <div className="duo bloc">
        <div><small>Recettes de {moisLabel(ymOf(aujourdhui)).split(' ')[0].toLowerCase()}</small><strong className="recette">{fcfa(s.mm.recettes)}</strong></div>
        <div><small>Dépenses de {moisLabel(ymOf(aujourdhui)).split(' ')[0].toLowerCase()}</small><strong className="depense">{fcfa(s.mm.depenses)}</strong></div>
      </div>
      <BilanMois resultat={s.mm.solde} solde={s.t.solde} mois={moisLabel(ymOf(aujourdhui)).toLowerCase()} />

      {can('fin.voir_graphiques') && (
        <section className="bloc">
          <div className="bloc-tete"><h2>Évolution du solde</h2></div>
          <LigneSolde donnees={s.pm} />
        </section>
      )}

      {restreint ? (
        <section className="bloc">
          <div className="bloc-tete"><h2>Totaux par mois</h2></div>
          <BarresMois donnees={s.pm} hauteur={170} />
          <table className="tableau compact">
            <thead><tr><th>Mois</th><th className="droite">Recettes</th><th className="droite">Dépenses</th></tr></thead>
            <tbody>{[...s.pm].reverse().map((m) => <tr key={m.ym}><td>{moisLabel(m.ym)}</td><td className="droite recette">{num(m.recettes)}</td><td className="droite depense">{num(m.depenses)}</td></tr>)}</tbody>
          </table>
        </section>
      ) : (
        <section className="bloc bloc-liste">
          <div className="bloc-tete"><h2>Dernières opérations</h2><Link className="lien" to={`/operations?caisse=${c.id}`}>Tout voir <ChevronRight size={16} /></Link></div>
          {s.recentes.length ? s.recentes.map((o) => <LigneOperation key={o.id} o={o} caisse={c} />) : <Vide icone="Receipt" titre="Aucune opération" texte="Cette caisse n'a encore aucun mouvement." />}
        </section>
      )}

      {!restreint && (
        <section className="bloc">
          <h2>Gestionnaires</h2>
          {gest.length ? gest.map((u) => (
            <div key={u.id} className="personne"><Avatar user={u} taille={36} /><span><strong>{u.prenom} {u.nom}</strong><small>{u.email}</small></span></div>
          )) : <p className="texte-doux">Aucun gestionnaire attribué. L'administrateur peut en désigner un dans Utilisateurs.</p>}
        </section>
      )}
      <Feuille ouverte={menu} onFermer={() => setMenu(false)} titre={c.nom}>
        <div className="actions-liste">
          {can('admin.caisses') && <button onClick={() => { setMenu(false); setEdition({ ...c }); }}><Pencil size={20} /><span>Renommer et personnaliser<small>Nom, description, pictogramme, couleur, image</small></span></button>}
          {can('admin.caisses') && <button onClick={() => { actions.enregistrerCaisse({ id: c.id, visible_fideles: c.visible_fideles === false }); notifier(c.visible_fideles === false ? 'Caisse visible par les fidèles' : 'Caisse masquée aux fidèles'); setMenu(false); }}>
            {c.visible_fideles === false ? <Eye size={20} /> : <EyeOff size={20} />}<span>{c.visible_fideles === false ? 'Afficher aux fidèles' : 'Masquer aux fidèles'}<small>Les fidèles ne voient que les totaux</small></span></button>}
          {can('fin.saisir', c.id) && <button onClick={() => { setMenu(false); nav(`/import?caisse=${c.id}`); }}><Upload size={20} /><span>Importer depuis Excel<small>Ajouter des opérations à partir d'un fichier</small></span></button>}
          {can('fin.exporter', c.id) && detail(c) && <>
            <button onClick={async () => { setMenu(false); const ops = [...s.ops].sort((a, b) => b.date.localeCompare(a.date)); await exporterOperationsPDF(ops, { titre: `Relevé — ${c.nom}`, sousTitre: `${ops.length} opération(s)`, eglise: eglise.nom, partager: true, caissiers: gest.map((u) => `${u.prenom} ${u.nom}`), editePar: `${user.prenom} ${user.nom}`, phrase: `Solde : ${fcfa(s.t.solde)}, c'est l'argent qui reste en caisse à ce jour.`, synthese: [{ label: 'Recettes', valeur: fcfa(s.t.recettes), couleur: [14, 159, 110] }, { label: 'Dépenses', valeur: fcfa(s.t.depenses), couleur: [217, 71, 90] }, { label: 'Solde (en caisse)', valeur: fcfa(s.t.solde) }] }); }}><FileText size={20} /><span>Relevé PDF<small>Toutes les opérations de la caisse</small></span></button>
            <button onClick={async () => { setMenu(false); await exporterExcel(s.ops, `releve_${c.nom}`, { partager: true }); }}><FileSpreadsheet size={20} /><span>Relevé Excel</span></button>
          </>}
          <button onClick={() => { setMenu(false); partagerTexte(`${eglise.nom}\n${c.nom}\nSolde : ${fcfa(s.t.solde)}\nRecettes du mois : ${fcfa(s.mm.recettes)}\nDépenses du mois : ${fcfa(s.mm.depenses)}\n— Mon Église`); }}><Share2 size={20} /><span>Partager le solde</span></button>
          {detail(c) && <button onClick={() => { setMenu(false); nav(`/clotures?caisse=${c.id}`); }}><LockKeyhole size={20} /><span>Clôtures mensuelles</span></button>}
          {can('admin.categories') && <button onClick={() => { setMenu(false); nav('/admin/categories'); }}><Tags size={20} /><span>Catégories</span></button>}
          {can('admin.caisses') && <button className="danger" onClick={() => { setMenu(false); setSuppr(true); }}><Trash2 size={20} /><span>{s.ops.length ? 'Archiver la caisse' : 'Supprimer la caisse'}<small>{s.ops.length ? 'Elle contient des opérations : l\'historique est conservé' : 'Elle ne contient aucune opération'}</small></span></button>}
        </div>
      </Feuille>
      <EditeurCaisse caisse={edition} setCaisse={setEdition} onFermer={() => setEdition(null)} />
      <Confirmation ouverte={suppr} onFermer={() => setSuppr(false)} danger libelle={s.ops.length ? 'Archiver' : 'Supprimer'} titre={`${s.ops.length ? 'Archiver' : 'Supprimer'} ${c.nom} ?`}
        message={s.ops.length ? 'La caisse disparaîtra des écrans mais ses opérations restent dans l\'historique. Elle pourra être restaurée depuis Administration › Caisses.' : 'Cette caisse et ses catégories seront supprimées définitivement.'}
        onConfirmer={() => { const r = actions.supprimerCaisse(c.id); if (r === 'archivee') notifier('Caisse archivée', 'ok', 'tic', { annuler: () => { actions.restaurerCaisse(c.id); notifier('Caisse restaurée', 'ok', 'tic'); } }); else notifier('Caisse supprimée', 'ok', 'depense', { annuler: () => { actions.restaurer(r?.corbeille || []); notifier('Caisse restaurée', 'ok', 'tic'); } }); nav('/', { replace: true }); }} />
    </div>
  );
}

// Résultat du mois puis solde : deux notions distinctes, expliquées simplement
export function BilanMois({ resultat, solde, mois, fin }) {
  return (
    <div className="bilan-mois">
      <div className="bm-resultat">
        <small>Résultat {mois.startsWith('de ') || mois.includes('–') ? 'de la période' : `de ${mois}`}</small>
        <strong className={resultat < 0 ? 'negatif' : 'recette'}>{resultat >= 0 ? '+' : '−'} {fcfa(Math.abs(resultat))}</strong>
        <span>Recettes moins dépenses {mois.includes('–') ? 'de la période' : 'du mois'}{resultat < 0 ? ' : on a dépensé plus qu\'on a reçu' : ''}</span>
      </div>
      <div className="bm-solde">
        <small>Solde {fin ? `au ${fin}` : 'du mois'}</small>
        <strong className={solde < 0 ? 'negatif' : ''}>{fcfa(solde)}</strong>
        <span>C'est l'argent qui reste en caisse{fin ? '' : ' à ce jour'}</span>
      </div>
    </div>
  );
}

export function Transfert() {
  const { db, egliseId, can, actions, notifier } = useApp();
  const nav = useNavigate();
  const sources = useCaissesSaisie().filter((c) => can('fin.transferer', c.id));
  // Caisses d'une structure : seulement pour ses responsables (séparation stricte des caisses)
  const toutes = caissesEglise(db, egliseId).filter((c) => !c.structure_id || can('fin.saisir', c.id) || can('admin.eglise'));
  const [params] = useSearchParams();
  const [f, setF] = useState({ source: params.get('source') || sources[0]?.id || '', destination: '', date: today(), montantTexte: '', libelle: '', observations: '' });
  const [err, setErr] = useState('');
  if (!sources.length) return <Navigate to="/" replace />;

  const soldeSource = f.source ? soldeCaisse(db, f.source) : 0;
  const montant = parseMontant(f.montantTexte);
  const destinations = toutes.filter((c) => c.id !== f.source);
  const cs = toutes.find((c) => c.id === f.source), cd = toutes.find((c) => c.id === f.destination);
  const verrou = (f.source && estVerrouille(db, f.source, f.date)) || (f.destination && estVerrouille(db, f.destination, f.date));

  const valider = (e) => {
    e.preventDefault();
    if (!f.destination) return setErr('Choisissez la caisse qui reçoit le transfert.');
    if (!montant) return setErr('Indiquez un montant supérieur à zéro.');
    const m = actions.transferer({ ...f, montant });
    if (m) return setErr(m);
    notifier(`Transfert de ${fcfa(montant)} effectué`);
    nav(-1);
  };

  return (
    <form onSubmit={valider} className="formulaire">
      <EnTete titre="Transfert entre caisses" />
      <div className="transfert-schema">
        <div className="transfert-bout">
          <small>Depuis</small>
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value, destination: f.destination === e.target.value ? '' : f.destination })}>
            {sources.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <span className="texte-doux petit">Solde : {fcfa(soldeSource)}</span>
        </div>
        <span className="transfert-fleche"><ArrowDown size={20} /></span>
        <div className="transfert-bout">
          <small>Vers</small>
          <select value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })}>
            <option value="">Choisir la caisse…</option>
            {destinations.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          {cd && <span className="texte-doux petit">Solde : {fcfa(soldeCaisse(db, cd.id))}</span>}
        </div>
      </div>

      <div className="saisie-montant transfert">
        <input inputMode="numeric" aria-label="Montant" placeholder="0" value={f.montantTexte} onChange={(e) => { const n = parseMontant(e.target.value); setF({ ...f, montantTexte: n ? num(n) : '' }); }} />
        <span className="saisie-montant-devise">F CFA</span>
      </div>
      {montant > soldeSource && <p className="alerte"><AlertTriangle size={16} /> Le montant dépasse le solde de {cs?.nom}. La caisse passera en négatif.</p>}

      <div className="pile carte-form">
        <Champ label="Date"><input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Champ>
        {verrou && <p className="alerte"><LockKeyhole size={16} /> {moisLabel(ymOf(f.date))} est clôturé pour l'une des caisses.</p>}
        <Champ label="Motif"><input value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} placeholder="Ex. Appui aux travaux décidé en conseil" /></Champ>
        <Champ label="Observations"><textarea rows={2} value={f.observations} onChange={(e) => setF({ ...f, observations: e.target.value })} /></Champ>
      </div>
      {err && <p className="erreur centre">{err}</p>}
      <p className="texte-doux petit centre">Le transfert crée une dépense dans {cs?.nom || 'la caisse source'} et une recette dans {cd?.nom || 'la caisse destinataire'}.</p>
      <div className="barre-action">
        <button type="button" className="btn btn-doux" onClick={() => nav(-1)}>Annuler</button>
        <button className="btn btn-primaire" disabled={verrou}>Transférer {montant ? fcfa(montant) : ''}</button>
      </div>
    </form>
  );
}
