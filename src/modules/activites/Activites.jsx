import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, MapPin, Clock, CalendarDays, Users, Pencil, Ban, CheckCircle2, XCircle, Bell, Info, Network, Trash2, ImagePlus, X } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { statutActivite, LIBELLES_STATUT, activitesVisibles, formatDebut, TYPES_ACTIVITE, RAPPELS, finDe } from '../../lib/activites';
import { droitStructure, nomFidele, membresStructure, fidelesEglise } from '../../lib/structures';
import { dateFr } from '../../lib/format';
import { Champ, EnTete, Feuille, Segmente, Vide, lireIllustration } from '../../components/ui';

const COULEUR = { a_venir: '#1F5FD6', en_cours: '#0E9F6E', realisee: '#5B6B86', annulee: '#D9475A', non_tenue: '#C98A06' };

export function CarteActivite({ a, db, compact }) {
  const nav = useNavigate();
  const st = statutActivite(a);
  const structure = a.structure_id && (db.structures || []).find((s) => s.id === a.structure_id);
  const d = new Date(`${a.debut}:00`);
  return (
    <button className={`carte-activite ${st} ${compact ? 'compacte' : ''} ${a.image && !compact ? 'avec-image' : ''}`} onClick={() => nav(`/activites/${a.id}`)}>
      {a.image && !compact && <span className="ca-image" style={{ backgroundImage: `url(${a.image})` }} />}
      <span className="ca-date"><b>{d.getDate()}</b><small>{d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small></span>
      <span className="ca-texte">
        <strong>{a.titre}</strong>
        <small><Clock size={12} /> {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{a.lieu ? <> · <MapPin size={12} /> {a.lieu}</> : ''}</small>
        <small className="ca-org">{structure ? structure.nom : 'Église'}{a.type ? ` · ${a.type}` : ''}</small>
      </span>
      <span className="ca-statut" style={{ color: COULEUR[st], background: `${COULEUR[st]}14` }}>{LIBELLES_STATUT[st]}</span>
    </button>
  );
}

export function ListeActivites({ structureId, integre }) {
  const { db, user, can, egliseId } = useApp();
  const [params] = useSearchParams();
  const [onglet, setOnglet] = useState('a_venir');
  const [fin, setFin] = useState('realisee');
  const [structure, setStructure] = useState(structureId || params.get('structure') || '');
  const [edition, setEdition] = useState(null);
  const toutes = useMemo(() => activitesVisibles(db, user, can, egliseId), [db, user, can, egliseId]);
  const filtrees = toutes.filter((a) => !structure || (structure === '_eglise' ? !a.structure_id : a.structure_id === structure));
  const parStatut = (s) => filtrees.filter((a) => statutActivite(a) === s);
  const liste = onglet === 'terminees' ? parStatut(fin).sort((a, b) => b.debut.localeCompare(a.debut)) : parStatut(onglet).sort((a, b) => a.debut.localeCompare(b.debut));
  const structuresCreables = (db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false && droitStructure(db, user, can, s.id, 'activites'));

  const peutCreer = structureId ? droitStructure(db, user, can, structureId, 'activites') : can('admin.eglise') || structuresCreables.length > 0;
  const contenu = (
    <>
      <div className="onglets-msg">
        {[['a_venir', 'À venir'], ['en_cours', 'En cours'], ['terminees', 'Terminées']].map(([v, l]) => {
          const n = v === 'terminees' ? 0 : parStatut(v).length;
          return <button key={v} className={onglet === v ? 'actif' : ''} onClick={() => setOnglet(v)}><span>{l}</span>{n > 0 && <b className="compte">{n}</b>}</button>;
        })}
      </div>
      {onglet === 'terminees' && (
        <Segmente petit valeur={fin} onChange={setFin} options={[{ v: 'realisee', l: `Réalisées (${parStatut('realisee').length})` }, { v: 'annulee', l: `Annulées (${parStatut('annulee').length})` }, { v: 'non_tenue', l: `Non tenues (${parStatut('non_tenue').length})` }]} />
      )}
      {!structureId && (
        <select className="select-simple marge" value={structure} onChange={(e) => setStructure(e.target.value)}>
          <option value="">Toutes les activités</option><option value="_eglise">Activités de l'église</option>
          {(db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
      )}
      {liste.length === 0
        ? <Vide icone="CalendarDays" titre={onglet === 'a_venir' ? 'Aucune activité prévue' : onglet === 'en_cours' ? 'Aucune activité en cours' : 'Aucune activité dans cette catégorie'} texte={(peutCreer || structuresCreables.length > 0) && onglet === 'a_venir' ? 'Touchez « + » pour programmer une activité.' : undefined} />
        : <div className="liste-activites">{liste.map((a) => <CarteActivite key={a.id} a={a} db={db} />)}</div>}
      {edition && <EditeurActivite activite={edition} onFermer={() => setEdition(null)} />}
    </>
  );
  const nouvelle = () => setEdition({ titre: '', type: '', debut: '', fin: '', lieu: '', description: '', infos: '', structure_id: structureId || (can('admin.eglise') ? '' : structuresCreables[0]?.id || ''), rappels: [1440, 120], responsables: [] });
  if (integre) return <section className="pile">{(peutCreer || structuresCreables.length > 0) && <button className="btn btn-doux" onClick={nouvelle}><Plus size={18} /> Programmer une activité</button>}{contenu}</section>;
  return (
    <div>
      <EnTete titre="Activités" retour={false} actions={(can('admin.eglise') || structuresCreables.length > 0) && <button className="btn-icone" aria-label="Nouvelle activité" onClick={nouvelle}><Plus size={22} /></button>} />
      {contenu}
    </div>
  );
}

export function EditeurActivite({ activite, onFermer }) {
  const { db, user, can, egliseId, actions, notifier } = useApp();
  const nav = useNavigate();
  const [a, setA] = useState(() => ({ ...activite, rappels: activite.rappels || [1440, 120], responsables: activite.responsables || [] }));
  const structures = (db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false && droitStructure(db, user, can, s.id, 'activites'));
  const candidats = a.structure_id ? membresStructure(db, a.structure_id) : fidelesEglise(db, egliseId);
  const enregistrer = () => {
    if (!a.titre.trim() || !a.debut) return notifier('Indiquez au moins le titre, la date et l\'heure de début.', 'erreur');
    if (a.fin && a.fin < a.debut) return notifier('La fin ne peut pas être avant le début.', 'erreur');
    if (!a.structure_id && !can('admin.eglise')) return notifier('Choisissez la structure organisatrice.', 'erreur');
    const id = actions.enregistrerActivite({ ...a, titre: a.titre.trim(), structure_id: a.structure_id || null });
    notifier(activite.id ? 'Activité modifiée : les personnes concernées sont prévenues' : 'Activité programmée : les personnes concernées sont prévenues');
    onFermer();
    if (!activite.id) nav(`/activites/${id}`);
  };
  return (
    <Feuille ouverte onFermer={onFermer} titre={activite.id ? 'Modifier l\'activité' : 'Nouvelle activité'}
      pied={<><button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button></>}>
      <div className="pile">
        <div className="champ"><span className="champ-label">Image de l'activité (facultatif)</span>
          {a.image ? (
            <div className="image-activite"><img src={a.image} alt="" />
              <button type="button" className="btn-icone" aria-label="Retirer l'image" onClick={() => setA({ ...a, image: '' })}><X size={18} /></button>
            </div>
          ) : null}
          <label className="btn btn-doux"><ImagePlus size={18} /> {a.image ? 'Changer l\'image' : 'Ajouter une image'}
            <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) try { setA({ ...a, image: await lireIllustration(f) }); } catch (er) { notifier(er.message || 'Image illisible', 'erreur'); } }} />
          </label>
        </div>
        <Champ label="Titre"><input value={a.titre} onChange={(e) => setA({ ...a, titre: e.target.value })} placeholder="Ex. Répétition générale" /></Champ>
        <Champ label="Organisée par">
          <select value={a.structure_id || ''} onChange={(e) => setA({ ...a, structure_id: e.target.value, responsables: [] })} disabled={!!activite.id}>
            {can('admin.eglise') && <option value="">L'église (toutes les structures)</option>}
            {structures.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </Champ>
        <Champ label="Type d'activité">
          <input list="types-activites" value={a.type || ''} onChange={(e) => setA({ ...a, type: e.target.value })} placeholder="Réunion, camp, formation…" />
          <datalist id="types-activites">{TYPES_ACTIVITE.map((t) => <option key={t} value={t} />)}</datalist>
        </Champ>
        <div className="deux-col">
          <Champ label="Début"><input type="datetime-local" value={a.debut || ''} onChange={(e) => setA({ ...a, debut: e.target.value })} /></Champ>
          <Champ label="Fin (facultatif)"><input type="datetime-local" value={a.fin || ''} min={a.debut} onChange={(e) => setA({ ...a, fin: e.target.value })} /></Champ>
        </div>
        <Champ label="Lieu"><input value={a.lieu || ''} onChange={(e) => setA({ ...a, lieu: e.target.value })} placeholder="Ex. Temple principal, salle 2" /></Champ>
        <Champ label="Description"><textarea rows={2} value={a.description || ''} onChange={(e) => setA({ ...a, description: e.target.value })} /></Champ>
        <Champ label="Informations pratiques"><textarea rows={2} value={a.infos || ''} onChange={(e) => setA({ ...a, infos: e.target.value })} placeholder="Tenue, participation, transport…" /></Champ>
        {a.structure_id && <Segmente valeur={a.destinataires || 'structure'} onChange={(v) => setA({ ...a, destinataires: v })} options={[{ v: 'structure', l: 'Membres de la structure' }, { v: 'eglise', l: 'Toute l\'église' }]} />}
        <div className="champ"><span className="champ-label">Responsables de l'activité</span>
          <div className="puces enveloppe">{candidats.slice(0, 40).map((f) => <button key={f.id} type="button" className={`puce ${a.responsables.includes(f.id) ? 'active' : ''}`} onClick={() => setA({ ...a, responsables: a.responsables.includes(f.id) ? a.responsables.filter((x) => x !== f.id) : [...a.responsables, f.id] })}>{nomFidele(f)}</button>)}</div>
        </div>
        <div className="champ"><span className="champ-label">Rappels envoyés aux personnes concernées</span>
          <div className="puces enveloppe">{RAPPELS.map((r) => <button key={r.m} type="button" className={`puce ${a.rappels.includes(r.m) ? 'active' : ''}`} onClick={() => setA({ ...a, rappels: a.rappels.includes(r.m) ? a.rappels.filter((x) => x !== r.m) : [...a.rappels, r.m] })}>{r.l}</button>)}</div>
        </div>
      </div>
    </Feuille>
  );
}

export function FicheActivite() {
  const { id } = useParams();
  const { db, user, can, actions, notifier } = useApp();
  const nav = useNavigate();
  const [edition, setEdition] = useState(null);
  const [annuler, setAnnuler] = useState(false);
  const [motif, setMotif] = useState('');
  const a = (db.activites || []).find((x) => x.id === id);
  if (!a) return <><EnTete titre="Activité" /><Vide icone="CalendarDays" titre="Activité introuvable" texte="Elle n'est peut-être pas encore synchronisée ou ne vous concerne pas." /></>;
  const st = statutActivite(a);
  const structure = a.structure_id && (db.structures || []).find((s) => s.id === a.structure_id);
  const gere = a.structure_id ? droitStructure(db, user, can, a.structure_id, 'activites') : can('admin.eglise');
  const resp = (a.responsables || []).map((fid) => (db.fideles || []).find((f) => f.id === fid)).filter(Boolean);
  const auteurAnnul = a.annulation?.par && db.users.find((u) => u.id === a.annulation.par);
  const fin = finDe(a);

  return (
    <div>
      <EnTete titre="Activité" actions={gere && st !== 'annulee' && <button className="btn-icone" aria-label="Modifier" onClick={() => setEdition(a)}><Pencil size={20} /></button>} />
      {a.image && <img className="activite-bandeau" src={a.image} alt="" />}
      <div className={`activite-tete ${st}`}>
        <span className="ca-statut" style={{ color: COULEUR[st], background: `${COULEUR[st]}18` }}>{LIBELLES_STATUT[st]}</span>
        <h2>{a.titre}</h2>
        <p>{structure ? <><Network size={14} /> {structure.nom}</> : 'Activité de l\'église'}{a.type ? ` · ${a.type}` : ''}</p>
      </div>
      <dl className="fiche">
        <div><dt><CalendarDays size={16} /> Début</dt><dd>{formatDebut(a)}</dd></div>
        {a.fin && <div><dt><Clock size={16} /> Fin</dt><dd>{fin.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd></div>}
        {a.lieu && <div><dt><MapPin size={16} /> Lieu</dt><dd>{a.lieu}</dd></div>}
        {resp.length > 0 && <div><dt><Users size={16} /> Responsables</dt><dd>{resp.map(nomFidele).join(', ')}</dd></div>}
        <div><dt><Bell size={16} /> Rappels</dt><dd>{(a.rappels || []).length ? RAPPELS.filter((r) => a.rappels.includes(r.m)).map((r) => r.l).join(', ') : 'Aucun'}</dd></div>
        {a.description && <div className="bloc-texte"><dt>Description</dt><dd>{a.description}</dd></div>}
        {a.infos && <div className="bloc-texte"><dt><Info size={16} /> Informations pratiques</dt><dd>{a.infos}</dd></div>}
        {st === 'annulee' && a.annulation && <div className="bloc-texte"><dt><Ban size={16} /> Annulation</dt><dd>{a.annulation.motif || 'Sans motif'}{auteurAnnul ? ` — par ${auteurAnnul.prenom} ${auteurAnnul.nom}` : ''}, le {dateFr(a.annulation.le.slice(0, 10))}</dd></div>}
      </dl>
      {gere && (
        <div className="pile marge-haut">
          {(st === 'a_venir' || st === 'en_cours') && <button className="btn btn-danger-doux" onClick={() => { setMotif(''); setAnnuler(true); }}><Ban size={18} /> Annuler l'activité</button>}
          {st === 'realisee' && <button className="btn btn-doux" onClick={() => { actions.marquerActivite(a.id, 'non_tenue'); notifier('Activité marquée comme non tenue'); }}><XCircle size={18} /> Elle n'a finalement pas eu lieu</button>}
          <button className="btn btn-danger-doux" onClick={() => { const r = actions.supprimerActivite(a.id); notifier('Activité supprimée', 'ok', 'depense', { annuler: () => actions.restaurer(r.corbeille) }); nav(-1); }}><Trash2 size={18} /> Supprimer (saisie par erreur)</button>
          {st === 'non_tenue' && <button className="btn btn-doux" onClick={() => { actions.marquerActivite(a.id, 'realisee'); notifier('Activité marquée comme réalisée'); }}><CheckCircle2 size={18} /> Elle a bien eu lieu</button>}
        </div>
      )}
      {edition && <EditeurActivite activite={edition} onFermer={() => setEdition(null)} />}
      <Feuille ouverte={annuler} onFermer={() => setAnnuler(false)} titre="Annuler l'activité"
        pied={<><button className="btn btn-doux" onClick={() => setAnnuler(false)}>Retour</button><button className="btn btn-danger" onClick={() => { actions.annulerActivite(a.id, motif.trim()); notifier('Activité annulée : les personnes concernées sont prévenues'); setAnnuler(false); }}>Confirmer l'annulation</button></>}>
        <p className="texte-doux">L'activité restera dans l'historique comme « annulée » : elle ne sera jamais comptée comme réalisée.</p>
        <Champ label="Motif (facultatif)"><input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. Intempéries, indisponibilité de la salle" /></Champ>
      </Feuille>
    </div>
  );
}
