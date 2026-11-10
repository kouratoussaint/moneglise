import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Upload, Download, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Copy, Ban, Undo2, X } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { useCaissesSaisie } from '../../components/AppShell';
import { CHAMPS, lireClasseur, devinerEntete, devinerMappage, convertir, signature, cleDoublon, normaliser } from '../../lib/import';
import { estVerrouille } from '../../lib/finance';
import { exporterModeleImport } from '../../lib/exporter';
import { dateFr, fcfa, num, uid } from '../../lib/format';
import { Champ, Confirmation, EnTete, Interrupteur, PastilleCaisse, Vide } from '../../components/ui';

const ETAPES = ['Fichier', 'Colonnes', 'Catégories', 'Aperçu'];
const MODES = [
  { v: 'colonne', l: 'Une colonne Montant et une colonne Type' },
  { v: 'deux', l: 'Deux colonnes : Entrées et Sorties' },
  { v: 'signe', l: 'Une colonne Montant (négatif = dépense)' },
  { v: 'recette', l: 'Tout le fichier en recettes' },
  { v: 'depense', l: 'Tout le fichier en dépenses' },
];
const lettre = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);
const MODELES = 'e360:import-modeles';
const lireModeles = () => { try { return JSON.parse(localStorage.getItem(MODELES)) || {}; } catch { return {}; } };

export default function Import() {
  const { db, egliseId, can, actions, notifier } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const caisses = useCaissesSaisie();
  const [etape, setEtape] = useState(0);
  const [caisseId, setCaisseId] = useState(params.get('caisse') && caisses.some((c) => c.id === params.get('caisse')) ? params.get('caisse') : caisses[0]?.id);
  const [fichier, setFichier] = useState(null);
  const [feuilles, setFeuilles] = useState([]);
  const [feuille, setFeuille] = useState(0);
  const [entete, setEntete] = useState(0);
  const [mappage, setMappage] = useState({});
  const [mode, setMode] = useState('colonne');
  const [assoc, setAssoc] = useState({});
  const [doublons, setDoublons] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [annuler, setAnnuler] = useState(false);

  const caisse = caisses.find((c) => c.id === caisseId);
  const lignesBrutes = feuilles[feuille]?.lignes || [];
  const entetes = (lignesBrutes[entete] || []).map((h, i) => String(h || '').trim() || `Colonne ${lettre(i)}`);
  const catsCaisse = db.categories.filter((c) => c.eglise_id === egliseId && !c.transfert && (c.caisse_id === caisseId || !c.caisse_id));
  const autre = (type) => `${egliseId}_autre_${type}`;

  // Choix initial des réglages d'après le fichier (ou d'après le dernier import du même modèle)
  const preparer = (fs, idx) => {
    const lignes = fs[idx].lignes;
    const e = devinerEntete(lignes);
    const ent = (lignes[e] || []).map((h) => String(h || ''));
    // La détection automatique prime ; un réglage mémorisé ne fait que compléter ce qui n'a pas été trouvé
    const memo = lireModeles()[signature(ent)];
    const auto = devinerMappage(ent);
    const m = { ...Object.fromEntries(Object.entries(memo?.mappage || {}).filter(([, v]) => v != null && v < ent.length)), ...auto };
    setEntete(e); setMappage(m);
    setMode(memo?.mode || (m.entree != null && m.sortie != null ? 'deux' : m.type != null ? 'colonne' : 'signe'));
  };

  const ouvrirFichier = async (f) => {
    if (!f) return;
    setChargement(true);
    try {
      const fs = await lireClasseur(f);
      if (!fs.length) throw new Error('vide');
      setFichier(f); setFeuilles(fs); setFeuille(0); preparer(fs, 0); setEtape(1);
    } catch { notifier('Ce fichier ne peut pas être lu. Utilisez un fichier Excel (.xlsx, .xls) ou CSV.', 'erreur'); }
    setChargement(false);
  };

  const lignes = useMemo(() => {
    if (!lignesBrutes.length) return [];
    const modeType = mode === 'recette' || mode === 'depense' ? 'fixe' : mode;
    return convertir(lignesBrutes, entete, mappage, { modeType, typeFixe: mode });
  }, [lignesBrutes, entete, mappage, mode]);

  // Noms de catégories trouvés dans le fichier, par type
  const nomsCats = useMemo(() => {
    const m = new Map();
    for (const l of lignes) if (!l.ignoree && l.categorieNom && l.type) m.set(`${l.type}|${normaliser(l.categorieNom)}`, { type: l.type, nom: l.categorieNom });
    return [...m.entries()].map(([k, v]) => ({ k, ...v }));
  }, [lignes]);
  const assocDefaut = (n) => catsCaisse.find((c) => c.type === n.type && normaliser(c.nom) === normaliser(n.nom))?.id || (can('admin.categories') ? 'creer' : autre(n.type));
  const choixCat = (n) => assoc[n.k] ?? assocDefaut(n);

  const analyse = useMemo(() => {
    if (etape < 3) return null;
    const existants = new Set(db.operations.filter((o) => o.caisse_id === caisseId).map((o) => cleDoublon(o.date, o.montant, o.libelle)));
    const vus = new Set();
    return lignes.map((l) => {
      if (l.ignoree) return { ...l, statut: 'ignoree' };
      const erreurs = [...l.erreurs];
      if (l.date && estVerrouille(db, caisseId, l.date)) erreurs.push('Mois clôturé');
      if (erreurs.length) return { ...l, erreurs, statut: 'erreur' };
      const k = cleDoublon(l.date, l.montant, l.libelle);
      const doublon = existants.has(k) || vus.has(k);
      vus.add(k);
      return { ...l, statut: doublon ? 'doublon' : 'ok' };
    });
  }, [etape, lignes, db, caisseId]);
  const aImporter = (analyse || []).filter((l) => l.statut === 'ok' || (doublons && l.statut === 'doublon'));
  const compte = (s) => (analyse || []).filter((l) => l.statut === s).length;
  const tot = (t) => aImporter.filter((l) => l.type === t).reduce((s, l) => s + l.montant, 0);

  const importer = () => {
    const nouvelles = [];
    const idCat = {};
    for (const n of nomsCats) {
      const c = choixCat(n);
      if (c === 'creer') { const id = uid('cat'); nouvelles.push({ id, caisse_id: caisseId, type: n.type, nom: n.nom.trim() }); idCat[n.k] = id; } else idCat[n.k] = c;
    }
    const pretes = aImporter.map((l) => ({ ...l, categorie_id: l.categorieNom ? idCat[`${l.type}|${normaliser(l.categorieNom)}`] || autre(l.type) : autre(l.type) }));
    const modeles = lireModeles();
    modeles[signature(lignesBrutes[entete].map((h) => String(h || '')))] = { mappage, mode };
    localStorage.setItem(MODELES, JSON.stringify(modeles));
    const lot = actions.importerOperations({ caisse_id: caisseId, lignes: pretes, nouvellesCategories: nouvelles, fichier: fichier?.name });
    setResultat({ lot, n: pretes.length, recettes: tot('recette'), depenses: tot('depense') });
    notifier(`${pretes.length} opération(s) importée(s)`);
  };

  if (!caisses.length) return <><EnTete titre="Importer depuis Excel" /><Vide icone="Lock" titre="Aucune caisse disponible" texte="Il faut le droit de saisir dans une caisse pour y importer des opérations." /></>;

  if (resultat) return (
    <div>
      <EnTete titre="Import terminé" retour={false} />
      <div className="import-fin">
        <span className="import-fin-icone"><CheckCircle2 size={34} /></span>
        <h2>{resultat.n} opération{resultat.n > 1 ? 's' : ''} importée{resultat.n > 1 ? 's' : ''}</h2>
        <p className="texte-doux">dans {caisse?.nom}</p>
        <div className="duo"><div><small>Recettes</small><strong className="recette">{fcfa(resultat.recettes)}</strong></div><div><small>Dépenses</small><strong className="depense">{fcfa(resultat.depenses)}</strong></div></div>
        <button className="btn btn-primaire btn-plein" onClick={() => nav(`/caisses/${caisseId}`, { replace: true })}>Voir la caisse</button>
        <button className="btn btn-danger-doux btn-plein" onClick={() => setAnnuler(true)}><Undo2 size={18} /> Annuler cet import</button>
      </div>
      <Confirmation ouverte={annuler} onFermer={() => setAnnuler(false)} danger libelle="Annuler l'import" titre="Annuler cet import ?" message={`Les ${resultat.n} opérations importées seront supprimées. Les catégories créées sont conservées.`}
        onConfirmer={() => { const e = actions.annulerImport(resultat.lot); if (e) notifier(e, 'erreur'); else { notifier('Import annulé'); nav(-1); } }} />
    </div>
  );

  return (
    <div className="assistant">
      <header className="entete">
        <button className="btn-icone" aria-label="Fermer" onClick={() => nav(-1)}><X size={22} /></button>
        <div className="entete-titres"><h1>Importer depuis Excel</h1><p>Étape {etape + 1} sur 4 · {ETAPES[etape]}</p></div>
      </header>
      <div className="assistant-progres">{ETAPES.map((t, i) => <button key={t} className={i < etape ? 'fait' : i === etape ? 'actif' : ''} onClick={() => i < etape && setEtape(i)} aria-label={t}>{i + 1}</button>)}</div>

      {etape === 0 && (
        <div className="pile">
          <Champ label="Caisse de destination">
            <div className="choix-caisses">
              {caisses.map((c) => <button type="button" key={c.id} className={caisseId === c.id ? 'actif' : ''} onClick={() => setCaisseId(c.id)}><PastilleCaisse caisse={c} taille={28} /><span>{c.nom}</span></button>)}
            </div>
          </Champ>
          <label className="depot-fichier">
            <Upload size={30} />
            <strong>{chargement ? 'Lecture du fichier…' : 'Choisir un fichier'}</strong>
            <small>Excel (.xlsx, .xls) ou CSV</small>
            <input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden onChange={(e) => ouvrirFichier(e.target.files?.[0])} />
          </label>
          <button className="btn btn-doux" onClick={() => exporterModeleImport(caisse, catsCaisse)}><Download size={18} /> Télécharger le modèle Excel</button>
          <p className="texte-doux petit">Votre propre fichier convient aussi : à l'étape suivante, vous indiquerez quelle colonne contient la date, le libellé, le montant…</p>
        </div>
      )}

      {etape === 1 && (
        <div className="pile">
          <div className="fichier-choisi"><FileSpreadsheet size={20} /><span>{fichier?.name}</span></div>
          {Object.keys(mappage).filter((k) => mappage[k] != null).length < 2 && (
            <p className="alerte"><AlertTriangle size={16} /> Les titres des colonnes n'ont pas été reconnus. Vérifiez la feuille et la ligne des titres ci-dessous, ou choisissez les colonnes à la main.</p>
          )}
          {feuilles.length > 1 && (
            <Champ label="Feuille"><select value={feuille} onChange={(e) => { const i = +e.target.value; setFeuille(i); preparer(feuilles, i); }}>{feuilles.map((f, i) => <option key={f.nom} value={i}>{f.nom}{f.masquee ? ' (masquée)' : ''}</option>)}</select></Champ>
          )}
          <Champ label="Ligne des titres" aide="La ligne qui contient les noms des colonnes">
            <select value={entete} onChange={(e) => { const i = +e.target.value; setEntete(i); setMappage(devinerMappage(lignesBrutes[i].map((h) => String(h || '')))); }}>
              {lignesBrutes.slice(0, 15).map((l, i) => <option key={i} value={i}>Ligne {i + 1} : {l.filter((c) => String(c).trim()).slice(0, 4).join(' · ').slice(0, 60)}</option>)}
            </select>
          </Champ>
          <Champ label="Comment sont indiqués les montants ?">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>{MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select>
          </Champ>
          <div className="carte-form mappage">
            <span className="champ-label">Colonne du fichier pour chaque information</span>
            {CHAMPS.filter((c) => (mode === 'deux' ? c.cle !== 'montant' && c.cle !== 'type' : c.cle !== 'entree' && c.cle !== 'sortie' && (mode === 'colonne' || c.cle !== 'type'))).map((c) => (
              <label key={c.cle} className="ligne-mappage">
                <span>{c.label}{(c.requis || ((mode === 'deux') && ['entree', 'sortie'].includes(c.cle)) || (mode !== 'deux' && c.cle === 'montant') || (mode === 'colonne' && c.cle === 'type')) && <b>*</b>}</span>
                <select value={mappage[c.cle] ?? ''} onChange={(e) => setMappage({ ...mappage, [c.cle]: e.target.value === '' ? undefined : +e.target.value })}>
                  <option value="">— Aucune —</option>
                  {entetes.map((h, i) => <option key={i} value={i}>{lettre(i)} · {h.slice(0, 28)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <ApercuBrut lignes={lignesBrutes} entete={entete} />
        </div>
      )}

      {etape === 2 && (
        <div className="pile">
          {nomsCats.length === 0 ? (
            <div className="carte-form"><p className="texte-doux">{mappage.categorie == null ? 'Aucune colonne Catégorie : les opérations seront classées dans « Autre / N.P. ». Vous pourrez les reclasser ensuite.' : 'Aucune catégorie trouvée dans le fichier.'}</p></div>
          ) : (
            <div className="carte-form">
              <span className="champ-label">Catégories trouvées dans le fichier</span>
              {nomsCats.map((n) => (
                <label key={n.k} className="ligne-mappage">
                  <span>{n.nom}<small className={n.type}>{n.type === 'recette' ? 'recette' : 'dépense'}</small></span>
                  <select value={choixCat(n)} onChange={(e) => setAssoc({ ...assoc, [n.k]: e.target.value })}>
                    {can('admin.categories') && <option value="creer">Créer « {n.nom.slice(0, 24)} »</option>}
                    {catsCaisse.filter((c) => c.type === n.type && !c.systeme).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    <option value={autre(n.type)}>Autre / N.P.</option>
                  </select>
                </label>
              ))}
              {!can('admin.categories') && <p className="texte-doux petit">Seul un administrateur peut créer des catégories : les nouvelles sont classées dans « Autre / N.P. » ou dans une catégorie existante.</p>}
            </div>
          )}
        </div>
      )}

      {etape === 3 && analyse && (
        <div className="pile">
          <div className="import-bilan">
            <div className="ok"><CheckCircle2 size={18} /><b>{compte('ok')}</b><small>prêtes</small></div>
            <div className="err"><AlertTriangle size={18} /><b>{compte('erreur')}</b><small>en erreur</small></div>
            <div className="dbl"><Copy size={18} /><b>{compte('doublon')}</b><small>doublons</small></div>
            <div className="ign"><Ban size={18} /><b>{compte('ignoree')}</b><small>ignorées</small></div>
          </div>
          {compte('doublon') > 0 && <Interrupteur label="Importer aussi les doublons probables" aide="Même date, même montant et même libellé qu'une opération existante" actif={doublons} onChange={setDoublons} />}
          <div className="duo bloc"><div><small>Recettes à importer</small><strong className="recette">{fcfa(tot('recette'))}</strong></div><div><small>Dépenses à importer</small><strong className="depense">{fcfa(tot('depense'))}</strong></div></div>
          <div className="liste-import">
            {analyse.slice(0, 300).map((l) => (
              <div key={l.num} className={`ligne-import ${l.statut}`}>
                <span className="li-num">{l.num}</span>
                <span className="li-texte"><strong>{l.libelle || '—'}</strong>
                  <small>{l.statut === 'ignoree' ? l.ignoree : l.statut === 'erreur' ? l.erreurs.join(' · ') : `${dateFr(l.date)}${l.categorieNom ? ` · ${l.categorieNom}` : ''}${l.statut === 'doublon' ? ' · doublon probable' : ''}`}</small>
                </span>
                {l.montant ? <span className={`li-montant ${l.type || ''}`}>{l.type === 'depense' ? '−' : '+'} {num(l.montant)}</span> : null}
              </div>
            ))}
            {analyse.length > 300 && <p className="texte-doux petit centre">… et {analyse.length - 300} autres lignes</p>}
          </div>
        </div>
      )}

      <div className="barre-action">
        {etape > 0 ? <button className="btn btn-doux" onClick={() => setEtape(etape - 1)}><ChevronLeft size={18} /> Retour</button> : <button className="btn btn-doux" onClick={() => nav(-1)}>Annuler</button>}
        {etape === 1 && <button className="btn btn-primaire" disabled={mappage.date == null || mappage.libelle == null || (mode === 'deux' ? mappage.entree == null && mappage.sortie == null : mappage.montant == null) || (mode === 'colonne' && mappage.type == null)} onClick={() => setEtape(2)}>Suivant <ChevronRight size={18} /></button>}
        {etape === 2 && <button className="btn btn-primaire" onClick={() => setEtape(3)}>Vérifier <ChevronRight size={18} /></button>}
        {etape === 3 && <button className="btn btn-primaire" disabled={!aImporter.length} onClick={importer}>Importer {aImporter.length} opération{aImporter.length > 1 ? 's' : ''}</button>}
      </div>
    </div>
  );
}

// Aperçu des premières lignes du fichier, pour repérer les colonnes
function ApercuBrut({ lignes, entete }) {
  const cols = Math.min(8, Math.max(...lignes.slice(entete, entete + 6).map((l) => l.length), 0));
  return (
    <div className="bloc">
      <span className="champ-label">Aperçu du fichier</span>
      <div className="tableau-defile">
        <table className="tableau compact apercu-brut">
          <thead><tr><th />{Array.from({ length: cols }, (_, i) => <th key={i}>{lettre(i)}</th>)}</tr></thead>
          <tbody>
            {lignes.slice(entete, entete + 6).map((l, i) => (
              <tr key={i} className={i === 0 ? 'titres' : ''}><td className="texte-doux">{entete + i + 1}</td>{Array.from({ length: cols }, (_, j) => <td key={j}>{String(l[j] instanceof Date ? l[j].toLocaleDateString('fr-FR') : l[j] ?? '').slice(0, 22)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
