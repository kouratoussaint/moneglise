import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock, Pencil, Trash2, Share2, ArrowLeftRight, CalendarDays, User, Clock, Undo2, FileSpreadsheet } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { useCaissesSaisie } from '../../components/AppShell';
import { estVerrouille } from '../../lib/finance';
import { dateFr, fcfa, num, parseMontant, today, moisLabel, ymOf } from '../../lib/format';
import { partagerTexte } from '../../lib/exporter';
import { Champ, Confirmation, EnTete, Feuille, Montant, PastilleCaisse, Segmente, Vide, lirePiece } from '../../components/ui';
import { estValidee } from '../../lib/finance';
import { Paperclip, Camera, FileText, X, CheckCircle2, RotateCcw, ExternalLink } from 'lucide-react';

export function OperationForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { db, actions, notifier, can } = useApp();
  const nav = useNavigate();
  const caisses = useCaissesSaisie();
  const existante = id ? db.operations.find((o) => o.id === id) : null;

  const [f, setF] = useState(() => existante
    ? { ...existante, montantTexte: num(existante.montant), motif_modification: '' }
    : { type: params.get('type') || 'recette', caisse_id: params.get('caisse') || caisses[0]?.id || '', date: today(), montantTexte: '', libelle: '', categorie_id: '', description: '', observations: '' });
  const [erreurs, setErreurs] = useState({});
  const [fichiers, setFichiers] = useState([]);
  const validee = existante && estValidee(db, existante);

  const categories = useMemo(() => db.categories
    .filter((c) => c.eglise_id === db.caisses.find((x) => x.id === f.caisse_id)?.eglise_id && c.type === f.type && !c.transfert && (c.actif !== false || c.id === f.categorie_id) && (c.caisse_id === f.caisse_id || !c.caisse_id))
    .sort((a, b) => (a.systeme ? 1 : 0) - (b.systeme ? 1 : 0)), [db, f.caisse_id, f.type]);

  if (existante && (existante.transfert_id || !can('fin.modifier', existante.caisse_id))) return <Navigate to={`/operations/${id}`} replace />;
  if (!existante && caisses.length === 0) return <><EnTete titre="Nouvelle opération" /><Vide icone="Lock" titre="Aucune caisse attribuée" texte="Demandez à l'administrateur de vous attribuer une caisse pour saisir des opérations." /></>;

  const verrou = f.caisse_id && f.date && estVerrouille(db, f.caisse_id, f.date);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const recette = f.type === 'recette';

  const enregistrer = (e) => {
    e.preventDefault();
    const montant = parseMontant(f.montantTexte);
    const err = {};
    if (!montant) err.montant = 'Indiquez un montant supérieur à zéro.';
    if (!f.libelle.trim()) err.libelle = 'Le libellé permet de retrouver l\'opération.';
    if (!f.caisse_id) err.caisse = 'Choisissez une caisse.';
    if (!f.date) err.date = 'Indiquez la date.';
    const catEffective = f.categorie_id || categories.find((c) => c.systeme)?.id;
    if (categories.find((c) => c.id === catEffective)?.systeme && !f.description.trim()) err.description = 'Décrivez l\'opération : c\'est obligatoire pour la catégorie « Autre / N.P. ».';
    if (validee && !(f.motif_modification || '').trim()) err.motif = 'Opération validée : indiquez le motif de la correction.';
    setErreurs(err);
    if (Object.keys(err).length) return;
    const categorie_id = f.categorie_id || categories.find((c) => c.systeme)?.id;
    const reste = { ...f }; delete reste.montantTexte;
    const msg = actions.enregistrerOperation({ ...reste, montant, categorie_id, libelle: f.libelle.trim() }, fichiers);
    if (msg) return notifier(msg, 'erreur');
    notifier(existante ? 'Opération modifiée' : recette ? 'Recette enregistrée' : 'Dépense enregistrée', 'ok', recette ? 'succes' : 'depense');
    nav(-1);
  };

  return (
    <form onSubmit={enregistrer} className="formulaire">
      <EnTete titre={existante ? 'Modifier l\'opération' : recette ? 'Nouvelle recette' : 'Nouvelle dépense'} />
      {!existante && (
        <Segmente valeur={f.type} onChange={(v) => setF({ ...f, type: v, categorie_id: '' })} options={[{ v: 'recette', l: 'Recette', icone: 'ArrowDownLeft' }, { v: 'depense', l: 'Dépense', icone: 'ArrowUpRight' }]} />
      )}

      <div className={`saisie-montant ${f.type} ${erreurs.montant ? 'erreur' : ''}`}>
        <span className="saisie-montant-signe">{recette ? '+' : '−'}</span>
        <input inputMode="numeric" aria-label="Montant" placeholder="0" value={f.montantTexte} autoFocus={!existante}
          onChange={(e) => { const n = parseMontant(e.target.value); set('montantTexte', n ? num(n) : ''); }} />
        <span className="saisie-montant-devise">F CFA</span>
      </div>
      {erreurs.montant && <p className="erreur centre">{erreurs.montant}</p>}

      <div className="pile carte-form">
        <Champ label="Caisse" erreur={erreurs.caisse}>
          <div className="choix-caisses">
            {caisses.map((c) => (
              <button type="button" key={c.id} className={f.caisse_id === c.id ? 'actif' : ''} onClick={() => setF({ ...f, caisse_id: c.id, categorie_id: '' })}>
                <PastilleCaisse caisse={c} taille={28} /><span>{c.nom}</span>
              </button>
            ))}
          </div>
        </Champ>
        <Champ label="Date" erreur={erreurs.date}><input type="date" value={f.date} max={today()} onChange={(e) => set('date', e.target.value)} /></Champ>
        {verrou && <p className="alerte"><Lock size={16} /> {moisLabel(ymOf(f.date))} est clôturé pour cette caisse. Choisissez une autre date ou demandez la réouverture du mois.</p>}
        <Champ label="Libellé" erreur={erreurs.libelle}><input value={f.libelle} onChange={(e) => set('libelle', e.target.value)} placeholder={recette ? 'Ex. Dîmes du culte dominical' : 'Ex. Facture SONABEL'} maxLength={90} /></Champ>
        <Champ label="Catégorie" aide="Sans choix, l'opération est classée dans « Autre / N.P. » et une description est alors demandée.">
          <select value={categories.some((c) => c.id === f.categorie_id && !c.systeme) ? f.categorie_id : ''} onChange={(e) => set('categorie_id', e.target.value)}>
            <option value="">Autre / N.P.</option>
            {categories.filter((c) => c.caisse_id).length > 0 && (
              <optgroup label="Catégories de la caisse">
                {categories.filter((c) => c.caisse_id).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </optgroup>
            )}
            {categories.filter((c) => !c.caisse_id && !c.systeme).length > 0 && (
              <optgroup label="Toutes caisses">
                {categories.filter((c) => !c.caisse_id && !c.systeme).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </optgroup>
            )}
          </select>
        </Champ>
        {(() => {
          const obligatoire = categories.find((c) => c.id === (f.categorie_id || categories.find((x) => x.systeme)?.id))?.systeme;
          return <Champ label={obligatoire ? 'Description (obligatoire pour « Autre / N.P. »)' : 'Description'} erreur={erreurs.description}><textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder={obligatoire ? 'À quoi correspond cette opération ?' : 'Détails utiles (facultatif)'} /></Champ>;
        })()}
        <Champ label="Observations"><textarea rows={2} value={f.observations} onChange={(e) => set('observations', e.target.value)} placeholder="Remarques, références de reçu… (facultatif)" /></Champ>
      </div>

      <div className="carte-form pieces">
        <span className="champ-label">Pièces justificatives</span>
        <div className="liste-pieces">
          {(f.pieces || []).map((p) => (
            <span key={p.id} className="piece">{p.type === 'application/pdf' ? <FileText size={16} /> : <Paperclip size={16} />}<span>{p.nom}</span>
              {!validee && <button type="button" aria-label="Retirer" onClick={() => set('pieces', f.pieces.filter((x) => x.id !== p.id))}><X size={14} /></button>}</span>
          ))}
          {fichiers.map((p) => (
            <span key={p.id} className="piece nouvelle">{p.type === 'application/pdf' ? <FileText size={16} /> : <img src={p.dataUrl} alt="" />}<span>{p.nom}</span>
              <button type="button" aria-label="Retirer" onClick={() => setFichiers(fichiers.filter((x) => x.id !== p.id))}><X size={14} /></button></span>
          ))}
        </div>
        <div className="deux-col">
          <label className="btn btn-doux petit"><Camera size={16} /> Photo du reçu
            <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const fi = e.target.files?.[0]; e.target.value = ''; if (fi) try { const p = await lirePiece(fi); setFichiers((l) => [...l, p]); } catch (er) { notifier(er.message, 'erreur'); } }} />
          </label>
          <label className="btn btn-doux petit"><Paperclip size={16} /> Fichier (image, PDF)
            <input type="file" accept="image/*,application/pdf" hidden onChange={async (e) => { const fi = e.target.files?.[0]; e.target.value = ''; if (fi) try { const p = await lirePiece(fi); setFichiers((l) => [...l, p]); } catch (er) { notifier(er.message, 'erreur'); } }} />
          </label>
        </div>
      </div>
      {validee && (
        <div className="carte-form">
          <Champ label="Motif de la correction (obligatoire)" erreur={erreurs.motif} aide="L'opération est validée : la correction et son motif seront visibles dans l'historique.">
            <textarea rows={2} value={f.motif_modification || ''} onChange={(e) => set('motif_modification', e.target.value)} placeholder="Ex. Erreur de saisie sur le montant" />
          </Champ>
        </div>
      )}

      <div className="barre-action">
        <button type="button" className="btn btn-doux" onClick={() => nav(-1)}>Annuler</button>
        <button className={`btn ${recette ? 'btn-primaire' : 'btn-or'}`} disabled={verrou}>{existante ? 'Enregistrer les modifications' : recette ? 'Enregistrer la recette' : 'Enregistrer la dépense'}</button>
      </div>
    </form>
  );
}

export function OperationDetail() {
  const { id } = useParams();
  const { db, can, actions, notifier, eglise } = useApp();
  const nav = useNavigate();
  const [confirmer, setConfirmer] = useState(false);
  const [annulerLot, setAnnulerLot] = useState(false);
  const [cp, setCp] = useState(false);
  const [motifCp, setMotifCp] = useState('');
  const o = db.operations.find((x) => x.id === id);
  if (!can('fin.voir_details')) return <Navigate to="/" replace />;
  if (!o) return <><EnTete titre="Opération" /><Vide icone="SearchX" titre="Opération introuvable" texte="Elle a peut-être été supprimée." /></>;

  const caisse = db.caisses.find((c) => c.id === o.caisse_id);
  const categorie = db.categories.find((c) => c.id === o.categorie_id);
  const auteur = db.users.find((u) => u.id === o.cree_par);
  const modif = db.users.find((u) => u.id === o.modifie_par);
  const verrou = estVerrouille(db, o.caisse_id, o.date);
  const liee = o.transfert_id && db.operations.find((x) => x.transfert_id === o.transfert_id && x.id !== o.id);
  const validee = estValidee(db, o);
  const peutModifier = !verrou && !o.transfert_id && !o.annulee_par && can('fin.modifier', o.caisse_id);
  // Une opération validée ne se supprime pas : elle s'annule par contre-passation
  const peutSupprimer = !validee && can('fin.supprimer', o.caisse_id);
  const peutContrePasser = validee && !o.annulee_par && !o.contre_passation_de && !o.transfert_id && (can('fin.saisir', o.caisse_id) || can('fin.valider'));
  const orig = o.contre_passation_de && db.operations.find((x) => x.id === o.contre_passation_de);
  const annulee = o.annulee_par && db.operations.find((x) => x.id === o.annulee_par);
  const ouvrirPiece = async (p) => {
    const url = await actions.urlPiece(p);
    if (!url) return notifier('Pièce disponible seulement avec une connexion internet', 'erreur');
    window.open(url, '_blank');
  };

  const partager = () => partagerTexte(
    `${eglise.nom}\n${o.type === 'recette' ? 'Recette' : 'Dépense'} — ${caisse?.nom}\n${o.libelle}\n${dateFr(o.date)} · ${categorie?.nom || 'Autre / N.P.'}\nMontant : ${fcfa(o.montant)}${o.observations ? `\nObs. : ${o.observations}` : ''}\n— Mon Église`);

  return (
    <div>
      <EnTete titre={o.type === 'recette' ? 'Recette' : 'Dépense'} actions={<button className="btn-icone" aria-label="Partager" onClick={partager}><Share2 size={20} /></button>} />
      <div className={`detail-tete ${o.type}`}>
        <PastilleCaisse caisse={caisse} taille={52} />
        <Montant valeur={o.montant} type={o.type} grand />
        <h2>{o.libelle}</h2>
        <span className="badge-cat">{categorie?.nom || 'Autre / N.P.'}</span>
        {verrou && <span className="badge-verrou"><Lock size={13} /> Mois clôturé</span>}
        {o.statut === 'a_valider' && <span className="badge-valider">En attente de validation</span>}
        {o.statut === 'validee' && !verrou && <span className="badge-verrou valide"><CheckCircle2 size={13} /> Validée</span>}
        {annulee && <button className="badge-annulee lien" onClick={() => nav(`/operations/${annulee.id}`, { replace: true })}>Annulée par contre-passation</button>}
        {orig && <button className="badge-valider lien" onClick={() => nav(`/operations/${orig.id}`, { replace: true })}>Contre-passation d'une opération</button>}
      </div>
      <dl className="fiche">
        <div><dt><CalendarDays size={16} /> Date</dt><dd>{dateFr(o.date)}</dd></div>
        <div><dt>Caisse</dt><dd>{caisse?.nom}</dd></div>
        {o.description && <div className="bloc-texte"><dt>Description</dt><dd>{o.description}</dd></div>}
        {o.observations && <div className="bloc-texte"><dt>Observations</dt><dd>{o.observations}</dd></div>}
        {liee && <div><dt><ArrowLeftRight size={16} /> Transfert lié</dt><dd><button className="lien" onClick={() => nav(`/operations/${liee.id}`, { replace: true })}>{db.caisses.find((c) => c.id === liee.caisse_id)?.nom}</button></dd></div>}
        <div><dt><User size={16} /> {o.import_lot ? 'Importée par' : 'Saisie par'}</dt><dd>{auteur ? `${auteur.prenom} ${auteur.nom}` : '—'}</dd></div>
        {o.import_lot && <div><dt><FileSpreadsheet size={16} /> Origine</dt><dd>Import Excel</dd></div>}
        {modif && <div><dt><Clock size={16} /> Modifiée par</dt><dd>{modif.prenom} {modif.nom}</dd></div>}
      </dl>
      {o.pieces?.length > 0 && (
        <div className="carte-form pieces">
          <span className="champ-label">Pièces justificatives</span>
          <div className="liste-pieces">
            {o.pieces.map((p) => <button key={p.id} className="piece" onClick={() => ouvrirPiece(p)}>{p.type === 'application/pdf' ? <FileText size={16} /> : <Paperclip size={16} />}<span>{p.nom}</span><ExternalLink size={14} /></button>)}
          </div>
        </div>
      )}
      {o.statut === 'a_valider' && can('fin.valider') && (
        <button className="btn btn-primaire btn-plein" onClick={() => { actions.validerOperations([o.id]); notifier('Opération validée'); }}><CheckCircle2 size={18} /> Valider cette opération</button>
      )}
      {peutContrePasser && (
        <button className="btn btn-doux btn-plein" onClick={() => { setMotifCp(''); setCp(true); }}><RotateCcw size={18} /> Annuler par contre-passation</button>
      )}
      {o.import_lot && peutSupprimer && (
        <button className="btn btn-doux btn-plein annuler-lot" onClick={() => setAnnulerLot(true)}><Undo2 size={18} /> Annuler tout cet import ({db.operations.filter((x) => x.import_lot === o.import_lot).length} opérations)</button>
      )}
      {(peutModifier || peutSupprimer) && (
        <div className="barre-action">
          {peutSupprimer && <button className="btn btn-danger-doux" onClick={() => setConfirmer(true)}><Trash2 size={18} /> Supprimer</button>}
          {peutModifier && <button className="btn btn-primaire" onClick={() => nav(`/operations/${o.id}/modifier`)}><Pencil size={18} /> Modifier</button>}
        </div>
      )}
      <Feuille ouverte={cp} onFermer={() => setCp(false)} titre="Annuler par contre-passation"
        pied={<><button className="btn btn-doux" onClick={() => setCp(false)}>Fermer</button><button className="btn btn-primaire" disabled={motifCp.trim().length < 5} onClick={() => { const e = actions.contrePasser(o.id, motifCp.trim()); if (e) notifier(e, 'erreur'); else { notifier('Contre-passation enregistrée'); setCp(false); } }}>Confirmer</button></>}>
        <p className="texte-doux">Une écriture inverse de {fcfa(o.montant)} sera créée à la date d'aujourd'hui. L'opération d'origine reste visible et les deux sont liées : rien n'est effacé.</p>
        <Champ label="Motif (obligatoire)"><textarea rows={3} value={motifCp} onChange={(e) => setMotifCp(e.target.value)} placeholder="Ex. Don enregistré deux fois" /></Champ>
      </Feuille>
      <Confirmation ouverte={annulerLot} onFermer={() => setAnnulerLot(false)} danger libelle="Annuler l'import" titre="Annuler tout cet import ?"
        message="Toutes les opérations importées avec celle-ci depuis le même fichier seront supprimées."
        onConfirmer={() => { const m = actions.annulerImport(o.import_lot); if (m) notifier(m, 'erreur'); else { notifier('Import annulé'); nav(-1); } }} />
      <Confirmation ouverte={confirmer} onFermer={() => setConfirmer(false)} danger libelle="Supprimer"
        titre="Supprimer cette opération ?" message={o.transfert_id ? 'Les deux mouvements du transfert seront supprimés. Les soldes des deux caisses seront recalculés.' : `« ${o.libelle} » sera supprimée et le solde de ${caisse?.nom} recalculé.`}
        onConfirmer={() => { const r = actions.supprimerOperation(o.id); if (typeof r === 'string') notifier(r, 'erreur'); else { notifier('Opération supprimée', 'ok', 'depense', { annuler: () => { actions.restaurer(r?.corbeille || []); notifier('Suppression annulée', 'ok', 'tic'); } }); nav(-1); } }} />
    </div>
  );
}
