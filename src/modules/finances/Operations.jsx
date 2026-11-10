import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, ArrowUpDown, Download, X, ArrowLeftRight, Lock, FileSpreadsheet, FileText, Printer, Share2, Sheet, Upload } from 'lucide-react';
import { useCaissesSaisie } from '../../components/AppShell';
import { useApp } from '../../state/AppContext';
import { useVue } from '../../state/useVue';
import { totaux, estVerrouille } from '../../lib/finance';
import { dateFr, dateCourte, fcfa, today, ymOf, addMonths, moisLabel, num } from '../../lib/format';
import { exporterCSV, exporterExcel, exporterOperationsPDF } from '../../lib/exporter';
import { EnTete, Feuille, Champ, Interrupteur, Montant, PastilleCaisse, Segmente, Vide, useSelection, gestesSelection, BarreSelection } from '../../components/ui';
import { CheckCheck, Trash2 } from 'lucide-react';
import { estValidee } from '../../lib/finance';

const Badge = ({ o }) => (o.statut === 'a_valider' ? <em className="badge-valider">À valider</em> : o.annulee_par ? <em className="badge-annulee">Annulée</em> : null);

export function LigneOperation({ o, caisse, onClick, sel }) {
  const nav = useNavigate();
  const { db } = useApp();
  const ouvrir = onClick || (() => nav(`/operations/${o.id}`));
  return (
    <button className="ligne-op" {...(sel ? gestesSelection(sel, o.id, ouvrir) : { onClick: ouvrir })}>
      <PastilleCaisse caisse={caisse} taille={40} />
      <span className="ligne-op-texte">
        <strong>{o.libelle}</strong>
        <small><Badge o={o} />{o._categorie} · {caisse?.nom}</small>
      </span>
      <span className="ligne-op-droite">
        <Montant valeur={o.montant} type={o.type} />
        <small>
          {o.transfert_id && <ArrowLeftRight size={12} />}
          {estVerrouille(db, o.caisse_id, o.date) && <Lock size={12} />}
          {dateCourte(o.date)}
        </small>
      </span>
    </button>
  );
}

function CarteOperation({ o, caisse, sel }) {
  const nav = useNavigate();
  return (
    <button className={`carte-op ${o.type}`} {...gestesSelection(sel, o.id, () => nav(`/operations/${o.id}`))}>
      <div className="carte-op-tete">
        <PastilleCaisse caisse={caisse} taille={34} />
        <span className="carte-op-cat">{o._categorie}</span><Badge o={o} />
        <span className="carte-op-date">{dateFr(o.date)}</span>
      </div>
      <strong className="carte-op-libelle">{o.libelle}</strong>
      {o.description && <p className="carte-op-desc">{o.description}</p>}
      <div className="carte-op-pied">
        <span className="texte-doux petit">{caisse?.nom}</span>
        <Montant valeur={o.montant} type={o.type} />
      </div>
    </button>
  );
}

const PERIODES = [
  { v: 'tout', l: 'Tout' },
  { v: 'mois', l: 'Ce mois' },
  { v: 'mois_prec', l: 'Mois dernier' },
  { v: '3mois', l: '3 derniers mois' },
  { v: 'annee', l: 'Cette année' },
  { v: 'perso', l: 'Personnalisée' },
];
const TRIS = [
  { v: 'date_desc', l: 'Date, plus récentes d\'abord' },
  { v: 'date_asc', l: 'Date, plus anciennes d\'abord' },
  { v: 'montant_desc', l: 'Montant, du plus élevé' },
  { v: 'montant_asc', l: 'Montant, du plus faible' },
  { v: 'libelle', l: 'Libellé, de A à Z' },
];
const GROUPES = [
  { v: 'aucun', l: 'Aucun' }, { v: 'mois', l: 'Mois' }, { v: 'caisse', l: 'Caisse' }, { v: 'categorie', l: 'Catégorie' }, { v: 'type', l: 'Type' },
];

function bornes(periode, du, au) {
  const t = today(), m = ymOf(t);
  switch (periode) {
    case 'mois': return [`${m}-01`, `${m}-31`];
    case 'mois_prec': { const p = addMonths(m, -1); return [`${p}-01`, `${p}-31`]; }
    case '3mois': return [`${addMonths(m, -2)}-01`, `${m}-31`];
    case 'annee': return [`${m.slice(0, 4)}-01-01`, `${m.slice(0, 4)}-12-31`];
    case 'perso': return [du || '0000', au || '9999'];
    default: return ['0000', '9999'];
  }
}

export default function Operations() {
  const { db, eglise, can, actions, notifier, user } = useApp();
  const { caisses: visibles, ops: vues, detail } = useVue();
  // Seules les caisses dont on voit le détail (pas les totaux de synthèse)
  const caisses = useMemo(() => visibles.filter(detail), [visibles, detail]);
  const ops = useMemo(() => vues.filter((o) => caisses.some((c) => c.id === o.caisse_id)), [vues, caisses]);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const peutImporter = useCaissesSaisie().length > 0;
  const [q, setQ] = useState('');
  const [f, setF] = useState({ type: 'tous', caisse: params.get('caisse') || 'toutes', categorie: params.get('categorie') || 'toutes', periode: 'tout', du: '', au: '', min: '', max: '', transferts: true });
  const [tri, setTri] = useState('date_desc');
  const [vue, setVue] = useState(() => localStorage.getItem('e360:vue') || 'liste');
  const [groupe, setGroupe] = useState('mois');
  const [feuille, setFeuille] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const sel = useSelection();
  const changerVue = (v) => { setVue(v); localStorage.setItem('e360:vue', v); };

  const caisseDe = (id) => caisses.find((c) => c.id === id);
  const cats = db.categories.filter((c) => c.eglise_id === eglise.id && (f.caisse === 'toutes' || !c.caisse_id || c.caisse_id === f.caisse) && (f.type === 'tous' || c.type === f.type));

  const filtrees = useMemo(() => {
    const [d1, d2] = bornes(f.periode, f.du, f.au);
    const s = q.trim().toLowerCase();
    let r = ops.filter((o) =>
      (f.type === 'tous' || o.type === f.type) &&
      (f.caisse === 'toutes' || o.caisse_id === f.caisse) &&
      (f.categorie === 'toutes' || o.categorie_id === f.categorie) &&
      o.date >= d1 && o.date <= d2 &&
      (!f.min || o.montant >= Number(f.min)) && (!f.max || o.montant <= Number(f.max)) &&
      (f.transferts || !o.transfert_id) &&
      (!s || `${o.libelle} ${o.description} ${o.observations} ${o._categorie} ${o._caisse}`.toLowerCase().includes(s)));
    const cmp = {
      date_desc: (a, b) => b.date.localeCompare(a.date) || (b.cree_le || '').localeCompare(a.cree_le || ''),
      date_asc: (a, b) => a.date.localeCompare(b.date),
      montant_desc: (a, b) => b.montant - a.montant,
      montant_asc: (a, b) => a.montant - b.montant,
      libelle: (a, b) => a.libelle.localeCompare(b.libelle, 'fr'),
    }[tri];
    return [...r].sort(cmp);
  }, [ops, f, q, tri]);

  const t = totaux(filtrees);
  const groupes = useMemo(() => {
    if (groupe === 'aucun') return [{ cle: 'tout', titre: null, items: filtrees }];
    const cle = { mois: (o) => ymOf(o.date), caisse: (o) => o._caisse, categorie: (o) => o._categorie, type: (o) => (o.type === 'recette' ? 'Recettes' : 'Dépenses') }[groupe];
    const m = new Map();
    filtrees.forEach((o) => { const k = cle(o); if (!m.has(k)) m.set(k, []); m.get(k).push(o); });
    return [...m.entries()].map(([k, items]) => ({ cle: k, titre: groupe === 'mois' ? moisLabel(k) : k, items, t: totaux(items) }));
  }, [filtrees, groupe]);

  const nbFiltres = [f.type !== 'tous', f.caisse !== 'toutes', f.categorie !== 'toutes', f.periode !== 'tout', f.min || f.max, !f.transferts].filter(Boolean).length;
  const reinit = () => setF({ type: 'tous', caisse: 'toutes', categorie: 'toutes', periode: 'tout', du: '', au: '', min: '', max: '', transferts: true });

  const descr = [f.caisse !== 'toutes' && caisseDe(f.caisse)?.nom, PERIODES.find((p) => p.v === f.periode)?.l, f.type !== 'tous' && (f.type === 'recette' ? 'Recettes' : 'Dépenses')].filter(Boolean).join(' · ');
  const exporter = async (format, opts = {}) => {
    setEnvoi(true);
    try {
      const base = `operations_${eglise.nom}`;
      if (format === 'csv') await exporterCSV(filtrees, base, opts);
      if (format === 'xlsx') await exporterExcel(filtrees, base, opts);
      if (format === 'pdf') await exporterOperationsPDF(filtrees, {
        titre: 'Relevé des opérations', sousTitre: `${descr} · ${filtrees.length} opération(s)`, eglise: eglise.nom, ...opts,
        synthese: [{ label: 'Recettes', valeur: fcfa(t.recettes), couleur: [14, 159, 110] }, { label: 'Dépenses', valeur: fcfa(t.depenses), couleur: [217, 71, 90] }, { label: 'Solde', valeur: fcfa(t.solde) }],
      });
    } finally { setEnvoi(false); setFeuille(null); }
  };

  return (
    <div>
      <EnTete titre="Opérations" retour={false} actions={<>
        {peutImporter && <button className="btn-icone" aria-label="Importer depuis Excel" onClick={() => nav('/import')}><Upload size={21} /></button>}
        {can('fin.exporter') && <button className="btn-icone" aria-label="Exporter" onClick={() => setFeuille('export')}><Download size={21} /></button>}
      </>} />

      <div className="outils">
        <div className="recherche">
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un libellé, une catégorie…" />
          {q && <button className="btn-icone petit" aria-label="Effacer" onClick={() => setQ('')}><X size={16} /></button>}
        </div>
        <div className="puces">
          <button className={`puce ${nbFiltres ? 'active' : ''}`} onClick={() => setFeuille('filtres')}><SlidersHorizontal size={15} /> Filtres{nbFiltres ? ` (${nbFiltres})` : ''}</button>
          <button className="puce" onClick={() => setFeuille('tri')}><ArrowUpDown size={15} /> Trier</button>
          {['tous', 'recette', 'depense'].map((v) => (
            <button key={v} className={`puce ${f.type === v ? 'active' : ''}`} onClick={() => setF({ ...f, type: v, categorie: 'toutes' })}>{v === 'tous' ? 'Tout' : v === 'recette' ? 'Recettes' : 'Dépenses'}</button>
          ))}
        </div>
        <div className="outils-ligne">
          <Segmente petit valeur={vue} onChange={changerVue} options={[{ v: 'liste', icone: 'List' }, { v: 'cartes', icone: 'LayoutList' }, { v: 'grille', icone: 'LayoutGrid' }, { v: 'tableau', icone: 'Table2' }]} />
          <label className="groupe-select">
            <span>Grouper</span>
            <select value={groupe} onChange={(e) => setGroupe(e.target.value)}>{GROUPES.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}</select>
          </label>
        </div>
      </div>

      <div className="resume">
        <div><small>{filtrees.length} opération{filtrees.length > 1 ? 's' : ''}</small><strong className={t.solde < 0 ? 'negatif' : ''}>{fcfa(t.solde)}</strong></div>
        <div className="resume-detail">
          <span className="recette">+ {num(t.recettes)}</span>
          <span className="depense">− {num(t.depenses)}</span>
        </div>
      </div>

      {filtrees.length === 0 ? (
        <Vide icone="SearchX" titre="Aucune opération trouvée" texte="Modifiez la recherche ou les filtres pour élargir les résultats."
          action={nbFiltres > 0 && <button className="btn btn-doux" onClick={reinit}>Effacer les filtres</button>} />
      ) : vue === 'tableau' ? (
        <div className="tableau-defile">
          <table className="tableau">
            <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Caisse</th><th className="droite">Montant</th></tr></thead>
            {groupes.map((g) => (
              <tbody key={g.cle}>
                {g.titre && <tr className="tableau-groupe"><td colSpan={4}>{g.titre}</td><td className="droite">{fcfa(g.t.solde)}</td></tr>}
                {g.items.map((o) => <LigneTableau key={o.id} o={o} sel={sel} />)}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        groupes.map((g) => (
          <section key={g.cle} className="groupe">
            {g.titre && (
              <div className="groupe-tete"><h3>{g.titre}</h3><span className={g.t.solde < 0 ? 'negatif' : ''}>{g.t.solde >= 0 ? '+' : '−'} {num(Math.abs(g.t.solde))}</span></div>
            )}
            <div className={vue === 'grille' ? 'grille-ops' : vue === 'cartes' ? 'cartes-ops' : 'liste-ops'}>
              {g.items.map((o) => vue === 'liste'
                ? <LigneOperation key={o.id} o={o} caisse={caisseDe(o.caisse_id)} sel={sel} />
                : vue === 'grille' ? <TuileOperation key={o.id} o={o} caisse={caisseDe(o.caisse_id)} sel={sel} />
                  : <CarteOperation key={o.id} o={o} caisse={caisseDe(o.caisse_id)} sel={sel} />)}
            </div>
          </section>
        ))
      )}

      {(() => {
        const choisies = filtrees.filter((o) => sel.ids.includes(o.id));
        const aValider = choisies.filter((o) => o.statut === 'a_valider');
        const supprimables = choisies.filter((o) => !estValidee(db, o) && !o.transfert_id && can('fin.supprimer', o.caisse_id));
        return (
          <BarreSelection sel={sel} tous={filtrees.map((o) => o.id)} actions={[
            { label: 'Valider', icone: CheckCheck, cache: !can('fin.valider') || !aValider.length, onClick: () => { actions.validerOperations(aValider.map((o) => o.id)); notifier(`${aValider.length} opération(s) validée(s)`); sel.vider(); } },
            { label: 'Exporter la sélection', icone: Download, cache: !can('fin.exporter'), onClick: async () => { await exporterOperationsPDF(choisies, { titre: 'Opérations sélectionnées', sousTitre: `${choisies.length} opération(s)`, eglise: eglise.nom, partager: true, editePar: `${user.prenom} ${user.nom}` }); sel.vider(); } },
            { label: 'Supprimer', icone: Trash2, danger: true, cache: !supprimables.length || supprimables.length !== choisies.length, onClick: () => {
              const ids = []; supprimables.forEach((o) => { const r = actions.supprimerOperation(o.id); if (r?.corbeille) ids.push(...r.corbeille); });
              notifier(`${supprimables.length} opération(s) supprimée(s)`, 'ok', 'depense', { annuler: () => actions.restaurer(ids) }); sel.vider(); } },
          ]} />
        );
      })()}
      <Feuille ouverte={feuille === 'filtres'} onFermer={() => setFeuille(null)} titre="Filtrer"
        pied={<><button className="btn btn-doux" onClick={reinit}>Réinitialiser</button><button className="btn btn-primaire" onClick={() => setFeuille(null)}>Voir {filtrees.length} résultat{filtrees.length > 1 ? 's' : ''}</button></>}>
        <div className="pile">
          <Champ label="Caisse">
            <select value={f.caisse} onChange={(e) => setF({ ...f, caisse: e.target.value, categorie: 'toutes' })}>
              <option value="toutes">Toutes les caisses</option>
              {caisses.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </Champ>
          <Champ label="Catégorie">
            <select value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}>
              <option value="toutes">Toutes les catégories</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.nom}{f.type === 'tous' ? ` (${c.type === 'recette' ? 'recette' : 'dépense'})` : ''}</option>)}
            </select>
          </Champ>
          <div className="champ"><span className="champ-label">Période</span>
            <div className="puces enveloppe">
              {PERIODES.map((p) => <button key={p.v} className={`puce ${f.periode === p.v ? 'active' : ''}`} onClick={() => setF({ ...f, periode: p.v })}>{p.l}</button>)}
            </div>
          </div>
          {f.periode === 'perso' && (
            <div className="deux-col">
              <Champ label="Du"><input type="date" value={f.du} onChange={(e) => setF({ ...f, du: e.target.value })} /></Champ>
              <Champ label="Au"><input type="date" value={f.au} onChange={(e) => setF({ ...f, au: e.target.value })} /></Champ>
            </div>
          )}
          <div className="deux-col">
            <Champ label="Montant minimum"><input inputMode="numeric" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(/\D/g, '') })} placeholder="0" /></Champ>
            <Champ label="Montant maximum"><input inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(/\D/g, '') })} placeholder="Illimité" /></Champ>
          </div>
          <Interrupteur label="Inclure les transferts entre caisses" actif={f.transferts} onChange={(v) => setF({ ...f, transferts: v })} />
        </div>
      </Feuille>

      <Feuille ouverte={feuille === 'tri'} onFermer={() => setFeuille(null)} titre="Trier par">
        <div className="liste-choix">
          {TRIS.map((t) => (
            <button key={t.v} className={tri === t.v ? 'actif' : ''} onClick={() => { setTri(t.v); setFeuille(null); }}>{t.l}</button>
          ))}
        </div>
      </Feuille>

      <Feuille ouverte={feuille === 'export'} onFermer={() => setFeuille(null)} titre="Exporter la sélection">
        <p className="texte-doux petit">{filtrees.length} opération(s){descr ? ` · ${descr}` : ''}</p>
        <div className="grille-export">
          <button disabled={envoi} onClick={() => exporter('pdf')}><FileText size={22} /><span>PDF</span></button>
          <button disabled={envoi} onClick={() => exporter('xlsx')}><FileSpreadsheet size={22} /><span>Excel</span></button>
          <button disabled={envoi} onClick={() => exporter('csv')}><Sheet size={22} /><span>CSV</span></button>
          <button disabled={envoi} onClick={() => exporter('pdf', { imprimer: true })}><Printer size={22} /><span>Imprimer</span></button>
          <button disabled={envoi} onClick={() => exporter('pdf', { partager: true })} className="large"><Share2 size={22} /><span>Partager en PDF (WhatsApp, e-mail…)</span></button>
        </div>
      </Feuille>
    </div>
  );
}

function LigneTableau({ o, sel }) {
  const nav = useNavigate();
  return (
    <tr {...gestesSelection(sel, o.id, () => nav(`/operations/${o.id}`))}>
      <td className="nowrap">{dateCourte(o.date)}</td>
      <td>{o.libelle}</td>
      <td className="texte-doux">{o._categorie}</td>
      <td className="texte-doux">{o._caisse}</td>
      <td className="droite nowrap"><Montant valeur={o.montant} type={o.type} /></td>
    </tr>
  );
}

function TuileOperation({ o, caisse, sel }) {
  const nav = useNavigate();
  return (
    <button className={`tuile-op ${o.type}`} {...gestesSelection(sel, o.id, () => nav(`/operations/${o.id}`))}>
      <span className="tuile-op-haut"><PastilleCaisse caisse={caisse} taille={30} /><small>{dateCourte(o.date)}</small></span>
      <strong>{o.libelle}</strong>
      <small className="texte-doux">{o._categorie}</small>
      <Montant valeur={o.montant} type={o.type} />
    </button>
  );
}
