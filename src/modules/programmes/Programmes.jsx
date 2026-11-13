import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Plus, Pencil, Search, Check, X, Users, Clock, MapPin, Ban, ChevronRight } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { JOURS, listesEglise, programmesEglise, prochainesDates, seanceDe, dernierService } from '../../lib/programmes';
import { fidelesEglise, nomFidele } from '../../lib/structures';
import { dateFr } from '../../lib/format';
import { Avatar, Champ, EnTete, Feuille, Interrupteur, Segmente, Vide } from '../../components/ui';

const jourCourt = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Programmes() {
  const { db, egliseId, can, actions, notifier } = useApp();
  const [params, setParams] = useSearchParams();
  const onglet = params.get('onglet') || 'planning';
  const gere = can('prog.gerer');
  const vide = listesEglise(db, egliseId).length === 0 && programmesEglise(db, egliseId).length === 0;
  return (
    <div>
      <EnTete titre="Programmes et services" sousTitre="Cultes, prières et équipes de service" />
      {vide ? (
        <div className="carte-bientot">
          <CalendarDays size={26} /><strong>Aucun programme pour l'instant</strong>
          {gere ? (
            <>
              <p>Créez les listes (chantres, prédicateurs, coordonnateurs, interprètes, enseignants, accueil, parking, nettoyage, sonorisation) et les programmes de départ (prière de cellule le mardi, intercession le vendredi, culte le dimanche). Tout reste modifiable.</p>
              <button className="btn btn-primaire" onClick={() => { actions.initialiserProgrammes(); notifier('Listes et programmes créés'); }}>Créer les listes et programmes de départ</button>
            </>
          ) : <p>Les responsables de l'église n'ont pas encore créé les programmes.</p>}
        </div>
      ) : (
        <>
          <div className="onglets-msg">
            {[['planning', 'Planning'], ['programmes', 'Programmes'], ['listes', 'Listes']].map(([v, l]) => (
              <button key={v} className={onglet === v ? 'actif' : ''} onClick={() => setParams({ onglet: v }, { replace: true })}><span>{l}</span></button>
            ))}
          </div>
          {onglet === 'planning' && <Planning gere={gere} />}
          {onglet === 'programmes' && <ListeProgrammes gere={gere} />}
          {onglet === 'listes' && <Listes gere={gere} />}
        </>
      )}
    </div>
  );
}

// ---------- Planning des prochaines semaines ----------
function Planning({ gere }) {
  const { db, egliseId } = useApp();
  const nav = useNavigate();
  const [semaines, setSemaines] = useState(4);
  const [edition, setEdition] = useState(null);
  const programmes = programmesEglise(db, egliseId);
  const seances = useMemo(() => programmes.flatMap((p) => prochainesDates(p, semaines).map((date) => ({ p, date, s: seanceDe(db, p.id, date) })))
    .sort((a, b) => `${a.date}${a.p.heure}`.localeCompare(`${b.date}${b.p.heure}`)), [db, programmes, semaines]);
  const nomListe = (id) => (db.listes || []).find((l) => l.id === id)?.nom || 'Liste supprimée';
  const nomDe = (fid) => nomFidele(fidelesEglise(db, egliseId).find((f) => f.id === fid));
  let precedent = '';
  return (
    <div className="pile">
      <Segmente valeur={String(semaines)} onChange={(v) => setSemaines(Number(v))} options={[{ v: '2', l: '2 semaines' }, { v: '4', l: '4 semaines' }, { v: '8', l: '8 semaines' }]} />
      {seances.length === 0 && <Vide icone="CalendarDays" titre="Aucun programme actif" />}
      {seances.map(({ p, date, s }) => {
        const sem = date.slice(0, 10); const titreJour = sem !== precedent; precedent = sem;
        const requis = (p.besoins || []).reduce((t, b) => t + Number(b.nombre || 0), 0);
        const pourvus = s ? (p.besoins || []).reduce((t, b) => t + Math.min(Number(b.nombre || 0), (s.affectations?.[b.liste_id] || []).filter(Boolean).length), 0) : 0;
        return (
          <div key={`${p.id}_${date}`}>
            {titreJour && <div className="fil-jour"><span>{jourCourt(date)}</span></div>}
            <div className={`carte-seance ${s ? 'planifiee' : ''}`}>
              <div className="cs-entete">
                <span><strong>{p.nom}</strong><small><Clock size={12} /> {p.heure}{p.fin ? ` – ${p.fin}` : ''}{p.lieu ? <> · <MapPin size={12} /> {p.lieu}</> : ''}</small></span>
                <span className={`cs-etat ${!s ? 'a-planifier' : pourvus < requis ? 'incomplete' : 'complete'}`}>{!s ? 'À planifier' : `${pourvus}/${requis}`}</span>
              </div>
              {s?.theme && <p className="cs-theme">« {s.theme} »</p>}
              {s && (
                <div className="cs-affectations">
                  {(p.besoins || []).map((b) => {
                    const noms = (s.affectations?.[b.liste_id] || []).filter(Boolean).map(nomDe);
                    return <div key={b.liste_id}><small>{nomListe(b.liste_id)}</small><span className={noms.length < b.nombre ? 'manque' : ''}>{noms.length ? noms.join(', ') : '—'}</span></div>;
                  })}
                </div>
              )}
              <div className="cs-actions">
                {gere && <button className="btn btn-doux petit" onClick={() => setEdition({ p, date, s })}><Pencil size={15} /> {s ? 'Modifier' : 'Désigner les personnes'}</button>}
                {s && <button className="lien" onClick={() => nav(`/activites/${s.id}`)}>Voir l'activité <ChevronRight size={14} /></button>}
              </div>
            </div>
          </div>
        );
      })}
      {edition && <EditeurSeance {...edition} onFermer={() => setEdition(null)} />}
    </div>
  );
}

function EditeurSeance({ p, date, s, onFermer }) {
  const { db, egliseId, actions, notifier } = useApp();
  const [aff, setAff] = useState(() => {
    const init = {};
    for (const b of p.besoins || []) init[b.liste_id] = Array.from({ length: Number(b.nombre || 1) }, (_, i) => s?.affectations?.[b.liste_id]?.[i] || '');
    return init;
  });
  const [theme, setTheme] = useState(s?.theme || '');
  const fideles = fidelesEglise(db, egliseId);
  const choisis = Object.values(aff).flat().filter(Boolean);
  const enregistrer = () => {
    const nettoye = Object.fromEntries(Object.entries(aff).map(([k, v]) => [k, v.filter(Boolean)]));
    actions.planifierSeance(p, date, { affectations: nettoye, theme: theme.trim(), id: s?.id });
    notifier(s ? 'Séance mise à jour : les personnes désignées sont prévenues' : 'Séance planifiée : les personnes désignées sont prévenues');
    onFermer();
  };
  return (
    <Feuille ouverte onFermer={onFermer} titre={`${p.nom} · ${jourCourt(date)}`}
      pied={<>{s && <button className="btn btn-danger-doux" aria-label="Annuler la séance" onClick={() => { actions.annulerActivite(s.id, 'Séance annulée'); notifier('Séance annulée'); onFermer(); }}><Ban size={18} /></button>}
        <button className="btn btn-doux" onClick={onFermer}>Fermer</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button></>}>
      <div className="pile">
        <Champ label="Thème ou texte (facultatif)"><input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Ex. La fidélité de Dieu — Psaume 23" /></Champ>
        {(p.besoins || []).map((b) => {
          const liste = (db.listes || []).find((l) => l.id === b.liste_id);
          const membres = (liste?.fideles || []).map((id) => fideles.find((f) => f.id === id)).filter(Boolean).sort((x, y) => nomFidele(x).localeCompare(nomFidele(y), 'fr'));
          return (
            <div key={b.liste_id} className="champ">
              <span className="champ-label">{liste?.nom || 'Liste supprimée'} ({b.nombre})</span>
              {membres.length === 0 && <p className="texte-doux petit">Cette liste est vide : ajoutez-y des fidèles dans l'onglet Listes.</p>}
              {aff[b.liste_id].map((val, i) => (
                <select key={i} className="select-simple marge-bas" value={val} onChange={(e) => setAff({ ...aff, [b.liste_id]: aff[b.liste_id].map((x, j) => (j === i ? e.target.value : x)) })}>
                  <option value="">— Personne désignée —</option>
                  {membres.map((f) => {
                    const dernier = dernierService(db, b.liste_id, f.id);
                    const ailleurs = choisis.includes(f.id) && val !== f.id;
                    return <option key={f.id} value={f.id}>{nomFidele(f)}{dernier ? ` — dernier service le ${dateFr(dernier)}` : ' — jamais servi'}{ailleurs ? ' (déjà désigné)' : ''}</option>;
                  })}
                </select>
              ))}
            </div>
          );
        })}
      </div>
    </Feuille>
  );
}

// ---------- Programmes réguliers ----------
function ListeProgrammes({ gere }) {
  const { db, egliseId } = useApp();
  const [edition, setEdition] = useState(null);
  const programmes = programmesEglise(db, egliseId);
  const nomListe = (id) => (db.listes || []).find((l) => l.id === id)?.nom || '?';
  return (
    <div className="pile">
      {gere && <button className="btn btn-doux" onClick={() => setEdition({ nom: '', jour: 0, heure: '08:00', fin: '', lieu: 'Temple', besoins: [] })}><Plus size={18} /> Nouveau programme</button>}
      <div className="bloc bloc-liste">
        {programmes.map((p) => (
          <button key={p.id} className="ligne-user" onClick={() => gere && setEdition(p)}>
            <span className="pastille" style={{ background: '#C98A0614', color: '#C98A06' }}><CalendarDays size={18} /></span>
            <span className="ligne-user-texte"><strong>{p.nom}</strong><small>Chaque {JOURS[p.jour].toLowerCase()} à {p.heure} · {(p.besoins || []).map((b) => `${b.nombre} ${nomListe(b.liste_id).toLowerCase()}`).join(', ') || 'aucun besoin défini'}</small></span>
            {gere && <Pencil size={16} className="texte-doux" />}
          </button>
        ))}
      </div>
      {edition && <EditeurProgramme programme={edition} onFermer={() => setEdition(null)} />}
    </div>
  );
}

function EditeurProgramme({ programme, onFermer }) {
  const { db, egliseId, actions, notifier } = useApp();
  const [p, setP] = useState(() => ({ ...programme, besoins: (programme.besoins || []).map((b) => ({ ...b })) }));
  const listes = listesEglise(db, egliseId);
  const enregistrer = () => {
    if (!p.nom.trim()) return notifier('Donnez un nom au programme.', 'erreur');
    actions.enregistrerProgramme({ ...p, nom: p.nom.trim(), jour: Number(p.jour), besoins: p.besoins.filter((b) => b.liste_id && Number(b.nombre) > 0).map((b) => ({ liste_id: b.liste_id, nombre: Number(b.nombre) })) });
    notifier(programme.id ? 'Programme modifié' : 'Programme créé'); onFermer();
  };
  return (
    <Feuille ouverte onFermer={onFermer} titre={programme.id ? programme.nom : 'Nouveau programme'}
      pied={<>{programme.id && <button className="btn btn-danger-doux" aria-label="Désactiver" onClick={() => { actions.enregistrerProgramme({ id: programme.id, actif: false }); notifier('Programme désactivé (séances passées conservées)'); onFermer(); }}><X size={18} /></button>}
        <button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button></>}>
      <div className="pile">
        <Champ label="Nom"><input value={p.nom} onChange={(e) => setP({ ...p, nom: e.target.value })} placeholder="Ex. Culte du dimanche" /></Champ>
        <div className="deux-col">
          <Champ label="Jour"><select value={p.jour} onChange={(e) => setP({ ...p, jour: e.target.value })}>{JOURS.map((j, i) => <option key={j} value={i}>{j}</option>)}</select></Champ>
          <Champ label="Lieu"><input value={p.lieu || ''} onChange={(e) => setP({ ...p, lieu: e.target.value })} /></Champ>
        </div>
        <div className="deux-col">
          <Champ label="Début"><input type="time" value={p.heure || ''} onChange={(e) => setP({ ...p, heure: e.target.value })} /></Champ>
          <Champ label="Fin (facultatif)"><input type="time" value={p.fin || ''} onChange={(e) => setP({ ...p, fin: e.target.value })} /></Champ>
        </div>
        <div className="champ"><span className="champ-label">Besoins par séance</span>
          {p.besoins.map((b, i) => (
            <div key={i} className="ligne-besoin">
              <select className="select-simple" value={b.liste_id} onChange={(e) => setP({ ...p, besoins: p.besoins.map((x, j) => (j === i ? { ...x, liste_id: e.target.value } : x)) })}>
                <option value="">— Liste —</option>{listes.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
              <input type="number" min="1" max="20" value={b.nombre} onChange={(e) => setP({ ...p, besoins: p.besoins.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} />
              <button className="btn-icone petit" aria-label="Retirer" onClick={() => setP({ ...p, besoins: p.besoins.filter((_, j) => j !== i) })}><X size={16} /></button>
            </div>
          ))}
          <button className="lien" onClick={() => setP({ ...p, besoins: [...p.besoins, { liste_id: '', nombre: 1 }] })}><Plus size={14} /> Ajouter un besoin</button>
        </div>
      </div>
    </Feuille>
  );
}

// ---------- Listes de fidèles (rôles et services) ----------
function Listes({ gere }) {
  const { db, egliseId } = useApp();
  const [ouverte, setOuverte] = useState(null);
  const listes = listesEglise(db, egliseId);
  const groupe = (type, titre) => (
    <section className="bloc bloc-liste">
      <div className="bloc-tete"><h2>{titre}</h2>{gere && <button className="lien" onClick={() => setOuverte({ nom: '', type, fideles: [] })}><Plus size={16} /> Liste</button>}</div>
      {listes.filter((l) => l.type === type).map((l) => (
        <button key={l.id} className="ligne-user" onClick={() => setOuverte(l)}>
          <span className="pastille" style={{ background: type === 'role' ? '#7A4FD614' : '#0E9F6E14', color: type === 'role' ? '#7A4FD6' : '#0E9F6E' }}><Users size={18} /></span>
          <span className="ligne-user-texte"><strong>{l.nom}</strong><small>{(l.fideles || []).length} fidèle{(l.fideles || []).length > 1 ? 's' : ''}</small></span>
          <ChevronRight size={18} className="chevron" />
        </button>
      ))}
    </section>
  );
  return (
    <div className="pile">
      {groupe('role', 'Rôles des programmes')}
      {groupe('service', 'Services')}
      {ouverte && <EditeurListe liste={ouverte} gere={gere} onFermer={() => setOuverte(null)} />}
    </div>
  );
}

function EditeurListe({ liste, gere, onFermer }) {
  const { db, egliseId, actions, notifier } = useApp();
  const [l, setL] = useState(() => ({ ...liste, fideles: [...(liste.fideles || [])] }));
  const [q, setQ] = useState('');
  const tous = fidelesEglise(db, egliseId).filter((f) => f.actif !== false).sort((a, b) => nomFidele(a).localeCompare(nomFidele(b), 'fr'));
  const visibles = tous.filter((f) => (gere ? !q || nomFidele(f).toLowerCase().includes(q.toLowerCase()) : l.fideles.includes(f.id)));
  const enregistrer = () => {
    if (!l.nom.trim()) return notifier('Donnez un nom à la liste.', 'erreur');
    actions.enregistrerListe({ ...l, nom: l.nom.trim() }); notifier('Liste enregistrée'); onFermer();
  };
  return (
    <Feuille ouverte onFermer={onFermer} titre={liste.id ? liste.nom : 'Nouvelle liste'}
      pied={gere ? <>{liste.id && <button className="btn btn-danger-doux" aria-label="Désactiver" onClick={() => { actions.enregistrerListe({ id: liste.id, actif: false }); notifier('Liste désactivée'); onFermer(); }}><X size={18} /></button>}
        <button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer ({l.fideles.length})</button></> : null}>
      <div className="pile">
        {gere && <Champ label="Nom de la liste"><input value={l.nom} onChange={(e) => setL({ ...l, nom: e.target.value })} /></Champ>}
        {gere && <Segmente valeur={l.type} onChange={(v) => setL({ ...l, type: v })} options={[{ v: 'role', l: 'Rôle des programmes' }, { v: 'service', l: 'Service' }]} />}
        {gere && <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un fidèle" /></div>}
        <div className="liste-contacts">
          {visibles.map((f) => {
            const dedans = l.fideles.includes(f.id);
            return (
              <button key={f.id} className={`contact ${dedans ? 'choisi' : ''}`} disabled={!gere} onClick={() => setL({ ...l, fideles: dedans ? l.fideles.filter((x) => x !== f.id) : [...l.fideles, f.id] })}>
                <Avatar user={{ prenom: f.prenom, nom: f.nom }} taille={36} /><span><strong>{nomFidele(f)}</strong></span>
                {gere && <i className="case">{dedans && <Check size={14} />}</i>}
              </button>
            );
          })}
          {visibles.length === 0 && <p className="texte-doux petit centre">{gere ? 'Aucun fidèle trouvé.' : 'Cette liste est vide.'}</p>}
        </div>
      </div>
    </Feuille>
  );
}
