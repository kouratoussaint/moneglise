import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Users, Crown, Pencil, Search, UserMinus, Check, History, Power, ChevronRight, X, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { dateFr } from '../../lib/format';
import { membresStructure, appartenancesStructure, postesStructure, nomFidele, ficheDuCompte, droitStructure, estMembreDe, fidelesEglise, DROITS_POSTE, droitsParDefaut, POSTES_MODELE } from '../../lib/structures';
import { Avatar, Champ, Confirmation, EnTete, Feuille, Interrupteur, Vide } from '../../components/ui';
import { OngletCaisse } from './CaisseStructure';
import { ListeActivites } from '../activites/Activites';
import { demandesStructure } from '../../lib/structures';

const avatarFidele = (db, f) => { const u = f?.user_id && db.users.find((x) => x.id === f.user_id); return { prenom: f?.prenom, nom: f?.nom, photo: u?.photo, role: u?.role || 'fidele' }; };

export function ListeStructures() {
  const { db, user, can, egliseId } = useApp();
  const nav = useNavigate();
  const [edition, setEdition] = useState(null);
  const [inactives, setInactives] = useState(false);
  const fiche = ficheDuCompte(db, user.id);
  const toutes = (db.structures || []).filter((s) => s.eglise_id === egliseId);
  const liste = toutes.filter((s) => inactives || s.actif !== false);
  const miennes = new Set((db.appartenances || []).filter((a) => a.fidele_id === fiche?.id && !a.jusqu_au).map((a) => a.structure_id));
  liste.sort((a, b) => (miennes.has(b.id) - miennes.has(a.id)) || a.nom.localeCompare(b.nom, 'fr'));

  return (
    <div>
      <EnTete titre="Structures" sousTitre="Groupes, bureaux et membres de l'église"
        actions={can('admin.eglise') && <button className="btn-icone" aria-label="Nouvelle structure" onClick={() => setEdition({ nom: '', description: '' })}><Plus size={22} /></button>} />
      {liste.length === 0 ? <Vide icone="Network" titre="Aucune structure" texte="Les structures (JAD, ASC, chorale…) se créent depuis ce menu ou l'assistant de configuration." /> : (
        <div className="liste-structures">
          {liste.map((s) => {
            const membres = appartenancesStructure(db, s.id).length;
            const postes = postesStructure(db, s.id);
            const tete = postes.find((p) => p.fidele_id);
            const f = tete && (db.fideles || []).find((x) => x.id === tete.fidele_id);
            return (
              <button key={s.id} className={`carte-structure ${s.actif === false ? 'inactive' : ''}`} onClick={() => nav(`/structures/${s.id}`)}>
                <span className="cs-sigle">{s.nom.slice(0, 4)}</span>
                <span className="cs-texte">
                  <strong>{s.nom}{miennes.has(s.id) && <em>Vous êtes membre</em>}{s.actif === false && <em className="off">Désactivée</em>}</strong>
                  <small>{s.description || 'Sans description'}</small>
                  <small className="cs-meta"><Users size={13} /> {membres} membre{membres > 1 ? 's' : ''}{f ? <> · <Crown size={13} /> {tete.intitule} : {nomFidele(f)}</> : ''}</small>
                </span>
                <ChevronRight size={18} className="chevron" />
              </button>
            );
          })}
        </div>
      )}
      {can('admin.eglise') && toutes.some((s) => s.actif === false) && <button className="lien centre bloc-lien" onClick={() => setInactives(!inactives)}>{inactives ? 'Masquer' : 'Afficher'} les structures désactivées</button>}
      {edition && <EditeurStructure structure={edition} onFermer={() => setEdition(null)} />}
    </div>
  );
}

function EditeurStructure({ structure, onFermer }) {
  const { actions, notifier, db, egliseId } = useApp();
  const nav = useNavigate();
  const [s, setS] = useState(() => ({ ...structure }));
  const membres = s.id ? membresStructure(db, s.id) : [];
  const enregistrer = () => {
    if (!s.nom?.trim()) return notifier('Donnez un nom à la structure.', 'erreur');
    const id = actions.enregistrerStructure({ ...s, nom: s.nom.trim() });
    notifier(structure.id ? 'Structure modifiée' : 'Structure créée');
    onFermer();
    if (!structure.id) nav(`/structures/${id}`);
  };
  return (
    <Feuille ouverte onFermer={onFermer} titre={structure.id ? 'Modifier la structure' : 'Nouvelle structure'}
      pied={<><button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button></>}>
      <div className="pile">
        <Champ label="Nom (ou sigle)"><input value={s.nom} onChange={(e) => setS({ ...s, nom: e.target.value })} placeholder="Ex. JAD, Chorale, Groupe de prière" /></Champ>
        <Champ label="Description ou mission"><textarea rows={2} value={s.description || ''} onChange={(e) => setS({ ...s, description: e.target.value })} /></Champ>
        <Champ label="Date de création (si connue)"><input type="date" value={s.date_creation || ''} onChange={(e) => setS({ ...s, date_creation: e.target.value })} /></Champ>
        {s.id && membres.length > 0 && (
          <Champ label="Responsable principal">
            <select value={s.responsable_id || ''} onChange={(e) => setS({ ...s, responsable_id: e.target.value })}><option value="">— Selon le bureau —</option>{membres.map((f) => <option key={f.id} value={f.id}>{nomFidele(f)}</option>)}</select>
          </Champ>
        )}
        <Champ label="Informations complémentaires"><textarea rows={2} value={s.infos || ''} onChange={(e) => setS({ ...s, infos: e.target.value })} placeholder="Jour de réunion, lieu, contacts…" /></Champ>
      </div>
    </Feuille>
  );
}

export function DetailStructure() {
  const { id } = useParams();
  const { db, user, can, actions, notifier, egliseId } = useApp();
  const nav = useNavigate();
  const [onglet, setOnglet] = useState('apercu');
  const [edition, setEdition] = useState(null);
  const [ajout, setAjout] = useState(false);
  const [retrait, setRetrait] = useState(null);
  const [motif, setMotif] = useState('');
  const [poste, setPoste] = useState(null);
  const [desactiver, setDesactiver] = useState(false);
  const s = (db.structures || []).find((x) => x.id === id);
  const membres = useMemo(() => (s ? appartenancesStructure(db, s.id).map((a) => ({ a, f: (db.fideles || []).find((x) => x.id === a.fidele_id) })).filter((x) => x.f) : []), [db, s]);
  if (!s) return <><EnTete titre="Structure" /><Vide icone="Network" titre="Structure introuvable" /></>;
  const peut = (cle) => droitStructure(db, user, can, s.id, cle);
  // Un fidèle qui n'est pas membre ne voit que l'aperçu (membres, bureau, caisse et activités réservés
  // aux membres, au bureau et aux responsables de l'église — règle aussi appliquée par le serveur)
  const ficheMoi = ficheDuCompte(db, user.id);
  const accesComplet = user.role === 'super_admin' || can('admin.eglise') || can('acc.toutes_structures') || can('fin.voir_details')
    || estMembreDe(db, user, s.id) || (db.postes || []).some((p) => p.structure_id === s.id && p.fidele_id && p.fidele_id === ficheMoi?.id);
  const demandeEnCours = (db.appartenances || []).some((a) => a.structure_id === s.id && a.fidele_id === ficheMoi?.id && a.statut === 'en_attente');
  const postes = postesStructure(db, s.id);
  const anciens = appartenancesStructure(db, s.id, true).filter((a) => a.jusqu_au);
  const fiche = ficheDuCompte(db, user.id);
  const mesPostes = postes.filter((p) => p.fidele_id && p.fidele_id === fiche?.id);
  const responsable = (db.fideles || []).find((f) => f.id === s.responsable_id) || (postes[0]?.fidele_id && (db.fideles || []).find((f) => f.id === postes[0].fidele_id));
  const histoBureau = postes.flatMap((p) => (p.historique || []).map((h) => ({ ...h, intitule: p.intitule }))).sort((a, b) => (b.jusqu_au || '').localeCompare(a.jusqu_au || ''));

  return (
    <div>
      <EnTete titre={s.nom} sousTitre={s.actif === false ? 'Structure désactivée' : s.description}
        actions={peut('membres') && <button className="btn-icone" aria-label="Modifier" onClick={() => setEdition(s)}><Pencil size={20} /></button>} />
      {accesComplet && (
        <div className="structure-tete">
          <div><b>{membres.length}{peut('membres') && demandesStructure(db, s.id).length ? <em className="pastille-nonlu petit">{demandesStructure(db, s.id).length}</em> : null}</b><small>membres</small></div>
          <div><b>{postes.filter((p) => p.fidele_id).length}/{postes.length}</b><small>postes pourvus</small></div>
          <div><b>{mesPostes.length ? mesPostes.map((p) => p.intitule).join(', ') : estMembreDe(db, user, s.id) ? 'Membre' : '—'}</b><small>votre place</small></div>
        </div>
      )}
      <div className="onglets-msg">
        {(accesComplet ? [['apercu', 'Aperçu'], ['membres', 'Membres'], ['bureau', 'Bureau'], ['caisse', 'Caisse'], ['activites', 'Activités']] : [['apercu', 'Aperçu']]).map(([v, l]) => (
          <button key={v} className={onglet === v ? 'actif' : ''} onClick={() => setOnglet(v)}><span>{l}</span></button>
        ))}
      </div>

      {onglet === 'apercu' && (
        <div className="pile">
          {!accesComplet && (
            <div className="note"><span>Vous n'êtes pas membre de {s.nom} : ses membres, son bureau, sa caisse et ses activités sont réservés à ses membres.</span></div>
          )}
          {!accesComplet && ficheMoi && s.actif !== false && (demandeEnCours
            ? <p className="alerte">Votre demande d'adhésion est en attente de validation.</p>
            : <button className="btn btn-primaire" onClick={() => { const r = actions.demanderStructure(s.id); if (typeof r === 'string') notifier(r, 'erreur'); else notifier(`Demande envoyée à ${s.nom}`, 'ok', 'succes', { annuler: () => actions.retirerAppartenances([r.id]) }); }}>Demander à rejoindre {s.nom}</button>)}
          <dl className="fiche">
            <div className="bloc-texte"><dt>Mission</dt><dd>{s.description || '—'}</dd></div>
            {s.date_creation && <div><dt>Créée le</dt><dd>{dateFr(s.date_creation)}</dd></div>}
            <div><dt>Responsable principal</dt><dd>{responsable ? nomFidele(responsable) : '—'}</dd></div>
            {s.infos && <div className="bloc-texte"><dt>Informations</dt><dd>{s.infos}</dd></div>}
          </dl>
          {peut('membres') && <Interrupteur label="Les membres voient le détail de la caisse" aide="Sinon, ils voient seulement le solde et les totaux" actif={!!s.membres_voient_details} onChange={(v) => actions.enregistrerStructure({ id: s.id, membres_voient_details: v })} />}
          {can('admin.eglise') && <button className="btn btn-danger-doux" onClick={() => { const r = actions.supprimerStructure(s.id); if (typeof r === 'string') notifier(r, 'erreur'); else { notifier('Structure supprimée', 'ok', 'depense', { annuler: () => actions.restaurer(r.corbeille) }); nav('/structures', { replace: true }); } }}><Trash2 size={18} /> Supprimer la structure</button>}
          {can('admin.eglise') && <button className="btn btn-doux" onClick={() => setDesactiver(true)}><Power size={18} /> {s.actif === false ? 'Réactiver la structure' : 'Désactiver la structure'}</button>}
        </div>
      )}

      {accesComplet && onglet === 'membres' && peut('membres') && demandesStructure(db, s.id).length > 0 && (
        <section className="bloc bloc-liste bloc-attente">
          <div className="bloc-tete"><h2>Demandes d'adhésion</h2><span className="badge">{demandesStructure(db, s.id).length}</span></div>
          {demandesStructure(db, s.id).map((a) => {
            const f = (db.fideles || []).find((x) => x.id === a.fidele_id);
            const enAttenteEglise = f?.user_id && db.users.find((u) => u.id === f.user_id)?.statut === 'en_attente';
            return (
              <div key={a.id} className="ligne-user">
                <Avatar user={avatarFidele(db, f)} taille={40} />
                <span className="ligne-user-texte"><strong>{nomFidele(f)}</strong><small>{enAttenteEglise ? 'Inscription à l\'église pas encore validée' : `Demande du ${dateFr(a.depuis)}`}</small></span>
                <button className="btn-rond refuser" aria-label="Refuser" onClick={() => { actions.validerAppartenance(a.id, false); notifier('Demande refusée', 'ok', 'tic', { annuler: () => actions.remettreEnAttente(a.id) }); }}><X size={18} /></button>
                <button className="btn-rond accepter" aria-label="Accepter" onClick={() => { actions.validerAppartenance(a.id, true); notifier(`${f?.prenom || 'Le fidèle'} a rejoint ${s.nom}`, 'ok', 'succes', { annuler: () => actions.remettreEnAttente(a.id) }); }}><Check size={18} /></button>
              </div>
            );
          })}
        </section>
      )}
      {accesComplet && onglet === 'membres' && (
        <section className="bloc bloc-liste">
          <div className="bloc-tete"><h2>{membres.length} membre{membres.length > 1 ? 's' : ''}</h2>{peut('membres') && <button className="lien" onClick={() => setAjout(true)}><Plus size={16} /> Ajouter</button>}</div>
          {membres.length === 0 && <p className="texte-doux petit">Aucun membre pour l'instant.</p>}
          {membres.sort((x, y) => nomFidele(x.f).localeCompare(nomFidele(y.f), 'fr')).map(({ a, f }) => {
            const ps = postes.filter((p) => p.fidele_id === f.id);
            return (
              <div key={a.id} className="ligne-user">
                <button className="ligne-user-ouvrir" onClick={() => nav(`/fideles/${f.id}`)}>
                  <Avatar user={avatarFidele(db, f)} taille={40} />
                  <span className="ligne-user-texte"><strong>{nomFidele(f)}</strong><small>{ps.length ? ps.map((p) => p.intitule).join(', ') : `Membre depuis le ${dateFr(a.depuis)}`}</small></span>
                </button>
                {peut('membres') && <button className="btn-icone petit" aria-label={`Retirer ${f.prenom}`} onClick={() => { setRetrait(a); setMotif(''); }}><UserMinus size={18} /></button>}
              </div>
            );
          })}
          {anciens.length > 0 && <details className="historique-repli"><summary>Anciens membres ({anciens.length})</summary>
            {anciens.map((a) => <p key={a.id} className="texte-doux petit">{nomFidele((db.fideles || []).find((f) => f.id === a.fidele_id))} : du {dateFr(a.depuis)} au {dateFr(a.jusqu_au)}{a.motif_sortie ? ` (${a.motif_sortie})` : ''}</p>)}
          </details>}
        </section>
      )}

      {accesComplet && onglet === 'bureau' && (
        <section className="bloc bloc-liste">
          <div className="bloc-tete"><h2>Bureau</h2>{peut('bureau') && <button className="lien" onClick={() => setPoste({ intitule: '', structure_id: s.id, droits: {} })}><Plus size={16} /> Poste</button>}</div>
          {postes.length === 0 && (
            <div className="pile">
              <p className="texte-doux petit">Aucun poste défini. Chaque structure compose librement son bureau.</p>
              {peut('bureau') && <button className="btn btn-doux" onClick={() => { POSTES_MODELE.forEach((t, i) => actions.enregistrerPoste({ structure_id: s.id, intitule: t, ordre: i, droits: droitsParDefaut(t) })); notifier('Postes proposés ajoutés : modifiez-les librement'); }}>Utiliser un bureau type (7 postes)</button>}
            </div>
          )}
          {postes.map((p) => {
            const f = p.fidele_id && (db.fideles || []).find((x) => x.id === p.fidele_id);
            return (
              <button key={p.id} className="ligne-user" onClick={() => peut('bureau') ? setPoste(p) : f && nav(`/fideles/${f.id}`)}>
                {f ? <Avatar user={avatarFidele(db, f)} taille={40} /> : <span className="pastille" style={{ background: '#EEF2F8', color: '#9AA7BD' }}><Crown size={18} /></span>}
                <span className="ligne-user-texte"><strong>{p.intitule}</strong><small>{f ? `${nomFidele(f)}${p.depuis ? ` · depuis le ${dateFr(p.depuis)}` : ''}` : 'Poste vacant'}</small></span>
                {peut('bureau') && <Pencil size={16} className="texte-doux" />}
              </button>
            );
          })}
          {histoBureau.length > 0 && <details className="historique-repli"><summary><History size={14} /> Historique du bureau ({histoBureau.length})</summary>
            {histoBureau.map((h, i) => <p key={i} className="texte-doux petit">{h.intitule} : {nomFidele((db.fideles || []).find((f) => f.id === h.fidele_id))}{h.depuis ? ` du ${dateFr(h.depuis)}` : ''} au {dateFr(h.jusqu_au)}</p>)}
          </details>}
        </section>
      )}

      {accesComplet && onglet === 'caisse' && <OngletCaisse structure={s} />}
      {accesComplet && onglet === 'activites' && <ListeActivites structureId={s.id} integre />}

      {edition && <EditeurStructure structure={edition} onFermer={() => setEdition(null)} />}
      {ajout && <AjoutMembres structure={s} onFermer={() => setAjout(false)} />}
      {poste && <EditeurPoste poste={poste} structure={s} onFermer={() => setPoste(null)} />}
      <Feuille ouverte={!!retrait} onFermer={() => setRetrait(null)} titre="Retirer de la structure"
        pied={<><button className="btn btn-doux" onClick={() => setRetrait(null)}>Annuler</button><button className="btn btn-danger" onClick={() => { const id = retrait.id; actions.retirerMembre(id, motif.trim()); notifier('Membre retiré (historique conservé)', 'ok', 'tic', { annuler: () => { actions.retablirMembre(id); notifier('Retrait annulé', 'ok', 'tic'); } }); setRetrait(null); }}>Retirer</button></>}>
        <p className="texte-doux">La personne quitte {s.nom}. Son historique d'appartenance est conservé ; si elle occupe un poste, celui-ci devient vacant.</p>
        <Champ label="Motif (facultatif)"><input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. Déménagement, changement de structure" /></Champ>
      </Feuille>
      <Confirmation ouverte={desactiver} onFermer={() => setDesactiver(false)} titre={s.actif === false ? 'Réactiver la structure ?' : 'Désactiver la structure ?'}
        message={s.actif === false ? 'Elle réapparaîtra dans les listes.' : 'Elle n\'apparaîtra plus dans les listes, mais ses membres, son bureau et son historique sont conservés.'}
        libelle={s.actif === false ? 'Réactiver' : 'Désactiver'} onConfirmer={() => { actions.enregistrerStructure({ id: s.id, actif: s.actif === false }); notifier(s.actif === false ? 'Structure réactivée' : 'Structure désactivée'); }} />
    </div>
  );
}

function AjoutMembres({ structure, onFermer }) {
  const { db, actions, notifier, egliseId } = useApp();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState([]);
  const deja = new Set(appartenancesStructure(db, structure.id).map((a) => a.fidele_id));
  const candidats = fidelesEglise(db, egliseId).filter((f) => f.actif !== false && !deja.has(f.id) && (!q || nomFidele(f).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => nomFidele(a).localeCompare(nomFidele(b), 'fr'));
  return (
    <Feuille ouverte onFermer={onFermer} titre={`Ajouter à ${structure.nom}`}
      pied={<><button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" disabled={!sel.length} onClick={() => { const ids = actions.ajouterMembres(structure.id, sel); notifier(`${sel.length} membre(s) ajouté(s)`, 'ok', 'succes', { annuler: () => { actions.retirerAppartenances(ids); notifier('Ajout annulé', 'ok', 'tic'); } }); onFermer(); }}>Ajouter {sel.length || ''}</button></>}>
      <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un fidèle" /></div>
      <div className="liste-contacts">
        {candidats.map((f) => (
          <button key={f.id} className={`contact ${sel.includes(f.id) ? 'choisi' : ''}`} onClick={() => setSel(sel.includes(f.id) ? sel.filter((x) => x !== f.id) : [...sel, f.id])}>
            <Avatar user={avatarFidele(db, f)} taille={38} /><span><strong>{nomFidele(f)}</strong><small>{f.telephone || (f.user_id ? 'A un compte' : 'Sans compte')}</small></span>
            <i className="case">{sel.includes(f.id) && <Check size={14} />}</i>
          </button>
        ))}
        {candidats.length === 0 && <p className="texte-doux petit centre">Tous les fidèles en font déjà partie, ou aucun ne correspond.</p>}
      </div>
    </Feuille>
  );
}

function EditeurPoste({ poste, structure, onFermer }) {
  const { db, actions, notifier, egliseId } = useApp();
  const [p, setP] = useState(() => ({ ...poste, droits: { ...(poste.droits || {}) } }));
  const [suppr, setSuppr] = useState(false);
  const membres = membresStructure(db, structure.id);
  const tous = fidelesEglise(db, egliseId).filter((f) => f.actif !== false);
  const enregistrer = () => {
    if (!p.intitule.trim()) return notifier('Indiquez l\'intitulé du poste.', 'erreur');
    const id = actions.enregistrerPoste({ id: p.id, structure_id: structure.id, intitule: p.intitule.trim(), droits: p.droits, ...(p.id ? {} : { ordre: postesStructure(db, structure.id).length }) });
    if ((p.fidele_id || null) !== (poste.fidele_id || null)) actions.attribuerPoste(id, p.fidele_id || null);
    notifier('Bureau mis à jour');
    onFermer();
  };
  return (
    <Feuille ouverte onFermer={onFermer} titre={poste.id ? poste.intitule : 'Nouveau poste'}
      pied={<>{poste.id && <button className="btn btn-danger-doux" onClick={() => setSuppr(true)}><Trash2 size={18} /></button>}<button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button></>}>
      <div className="pile">
        <Champ label="Intitulé du poste">
          <input list="postes-types" value={p.intitule} onChange={(e) => setP({ ...p, intitule: e.target.value, droits: poste.id ? p.droits : droitsParDefaut(e.target.value) })} placeholder="Ex. Trésorier général" />
          <datalist id="postes-types">{POSTES_MODELE.map((t) => <option key={t} value={t} />)}</datalist>
        </Champ>
        <Champ label="Titulaire" aide="Un même fidèle peut occuper des postes dans plusieurs structures. Il devient membre de la structure s'il ne l'est pas.">
          <select value={p.fidele_id || ''} onChange={(e) => setP({ ...p, fidele_id: e.target.value || null })}>
            <option value="">— Poste vacant —</option>
            {membres.length > 0 && <optgroup label="Membres de la structure">{membres.map((f) => <option key={f.id} value={f.id}>{nomFidele(f)}</option>)}</optgroup>}
            <optgroup label="Autres fidèles">{tous.filter((f) => !membres.some((m) => m.id === f.id)).map((f) => <option key={f.id} value={f.id}>{nomFidele(f)}</option>)}</optgroup>
          </select>
        </Champ>
        <div className="carte-form">
          <span className="champ-label">Ce que ce poste permet dans {structure.nom}</span>
          {DROITS_POSTE.map((d) => <Interrupteur key={d.cle} label={d.label} actif={!!p.droits[d.cle]} onChange={(v) => setP({ ...p, droits: { ...p.droits, [d.cle]: v } })} />)}
          <p className="texte-doux petit">Ces droits valent uniquement pour cette structure. Ils ne donnent aucun droit d'administration sur l'église.</p>
        </div>
      </div>
      <Confirmation ouverte={suppr} onFermer={() => setSuppr(false)} danger titre="Supprimer ce poste ?" message="Le poste disparaît du bureau ; son historique (anciens titulaires) est conservé." libelle="Supprimer"
        onConfirmer={() => { actions.supprimerPoste(poste.id); notifier('Poste supprimé'); onFermer(); }} />
    </Feuille>
  );
}
