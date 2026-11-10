import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, UserPlus, Phone, MapPin, Pencil, Network, Plus, LogOut, KeyRound, CalendarDays, Briefcase, Mail, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { ROLES } from '../../lib/permissions';
import { dateFr } from '../../lib/format';
import { fidelesEglise, nomFidele, structuresDuFidele, postesDuFidele, ficheDuCompte, droitStructure } from '../../lib/structures';
import { Avatar, BadgeRole, Champ, EnTete, Feuille, Segmente, Vide } from '../../components/ui';

// Qui peut voir l'ensemble des fidèles et les gérer
export function useDroitsFideles() {
  const { db, user, can, egliseId } = useApp();
  const tous = can('admin.eglise') || can('admin.utilisateurs') || can('fin.voir_details');
  const fiche = ficheDuCompte(db, user?.id);
  const postesMembres = (db.postes || []).filter((p) => p.fidele_id && p.fidele_id === fiche?.id && p.actif !== false && p.droits?.membres);
  return { tous, gerer: can('admin.eglise') || can('admin.utilisateurs') || postesMembres.length > 0, fiche, egliseId };
}

const compteDe = (db, f) => f?.user_id && db.users.find((u) => u.id === f.user_id);
const avatarDe = (db, f) => { const u = compteDe(db, f); return { prenom: f?.prenom, nom: f?.nom, photo: u?.photo || f?.photo, role: u?.role || 'fidele' }; };

export function ListeFideles() {
  const { db } = useApp();
  const nav = useNavigate();
  const { tous, gerer, fiche, egliseId } = useDroitsFideles();
  const [q, setQ] = useState('');
  const [structure, setStructure] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const [edition, setEdition] = useState(null);

  const visibles = useMemo(() => {
    let l = fidelesEglise(db, egliseId).filter((f) => f.actif !== false);
    if (!tous) {
      // Un fidèle voit sa fiche et les membres de ses structures
      const mes = new Set(structuresDuFidele(db, fiche?.id).map((s) => s.id));
      const proches = new Set((db.appartenances || []).filter((a) => !a.jusqu_au && mes.has(a.structure_id)).map((a) => a.fidele_id));
      l = l.filter((f) => f.id === fiche?.id || proches.has(f.id));
    }
    return l;
  }, [db, egliseId, tous, fiche]);
  const liste = visibles
    .filter((f) => !q || `${f.prenom} ${f.nom} ${f.telephone || ''}`.toLowerCase().includes(q.toLowerCase()))
    .filter((f) => !structure || structuresDuFidele(db, f.id).some((s) => s.id === structure))
    .filter((f) => {
      const role = compteDe(db, f)?.role;
      if (filtre === 'responsables') return role && role !== 'fidele';
      if (filtre === 'simples') return !role || role === 'fidele';
      return filtre === 'tous' || (filtre === 'compte' ? !!f.user_id : !f.user_id);
    })
    .sort((a, b) => nomFidele(a).localeCompare(nomFidele(b), 'fr'));
  const structures = (db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false);

  return (
    <div>
      <EnTete titre="Fidèles" sousTitre={`${visibles.length} fidèle${visibles.length > 1 ? 's' : ''}${tous ? ' dans l\'église' : ' dans vos structures'}`}
        actions={gerer && <button className="btn-icone" aria-label="Nouveau fidèle" onClick={() => setEdition({ prenom: '', nom: '' })}><UserPlus size={21} /></button>} />
      <div className="outils">
        <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom ou téléphone" /></div>
        <div className="deux-col">
          <select className="select-simple" value={structure} onChange={(e) => setStructure(e.target.value)}><option value="">Toutes les structures</option>{structures.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select>
          {tous && <select className="select-simple" value={filtre} onChange={(e) => setFiltre(e.target.value)}><option value="tous">Tous les fidèles</option><option value="responsables">Responsables</option><option value="simples">Fidèles sans rôle</option><option value="compte">Avec un compte</option><option value="sans">Sans compte</option></select>}
        </div>
      </div>
      {liste.length === 0 ? <Vide icone="Users" titre="Aucun fidèle" texte={gerer ? 'Touchez le bouton en haut à droite pour enregistrer un fidèle.' : 'Les membres de vos structures apparaîtront ici.'} /> : (
        <div className="bloc bloc-liste">
          {liste.map((f) => {
            const st = structuresDuFidele(db, f.id);
            const u = compteDe(db, f);
            return (
              <button key={f.id} className="ligne-user" onClick={() => nav(`/fideles/${f.id}`)}>
                <Avatar user={avatarDe(db, f)} taille={42} />
                <span className="ligne-user-texte"><strong>{nomFidele(f)}{f.id === fiche?.id ? ' (vous)' : ''}</strong>
                  <small>{st.length ? st.map((s) => s.nom).join(' · ') : 'Aucune structure'}{f.telephone ? ` · ${f.telephone}` : ''}</small></span>
                {u?.statut === 'en_attente' ? <span className="badge">En attente</span> : u && u.role !== 'fidele' ? <BadgeRole role={u.role} /> : !f.user_id && <span className="badge">Sans compte</span>}
              </button>
            );
          })}
        </div>
      )}
      {edition && <EditeurFidele fidele={edition} onFermer={() => setEdition(null)} />}
    </div>
  );
}

export function EditeurFidele({ fidele, onFermer }) {
  const { actions, notifier } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState(() => ({ ...fidele }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const enregistrer = () => {
    if (!f.prenom?.trim() && !f.nom?.trim()) return notifier('Indiquez au moins le nom ou le prénom.', 'erreur');
    const donnees = f;
    const id = actions.enregistrerFidele({ ...donnees, prenom: (donnees.prenom || '').trim(), nom: (donnees.nom || '').trim() });
    notifier(fidele.id ? 'Fiche mise à jour' : 'Fidèle enregistré');
    onFermer();
    if (!fidele.id) nav(`/fideles/${id}`);
  };
  return (
    <Feuille ouverte onFermer={onFermer} titre={fidele.id ? 'Modifier la fiche' : 'Nouveau fidèle'}
      pied={<><button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button></>}>
      <div className="pile">
        <div className="deux-col">
          <Champ label="Prénom(s)"><input value={f.prenom || ''} onChange={set('prenom')} /></Champ>
          <Champ label="Nom"><input value={f.nom || ''} onChange={set('nom')} /></Champ>
        </div>
        <div className="deux-col">
          <Champ label="Sexe"><select value={f.sexe || ''} onChange={set('sexe')}><option value="">—</option><option value="F">Femme</option><option value="M">Homme</option></select></Champ>
          <Champ label="Téléphone"><input inputMode="tel" value={f.telephone || ''} onChange={set('telephone')} /></Champ>
        </div>
        <Champ label="Adresse ou quartier"><input value={f.adresse || ''} onChange={set('adresse')} /></Champ>
        <div className="deux-col">
          <Champ label="Date de naissance"><input type="date" value={f.date_naissance || ''} onChange={set('date_naissance')} /></Champ>
          <Champ label="Profession"><input value={f.profession || ''} onChange={set('profession')} /></Champ>
        </div>
        <Champ label="E-mail"><input type="email" value={f.email || ''} onChange={set('email')} /></Champ>
        <Champ label="Date d'enregistrement"><input type="date" value={f.date_enregistrement || ''} onChange={set('date_enregistrement')} /></Champ>
        <Champ label="Informations complémentaires"><textarea rows={2} value={f.notes || ''} onChange={set('notes')} placeholder="Baptême, situation familiale, remarques utiles…" /></Champ>
        <p className="texte-doux petit">Seuls le nom ou le prénom sont nécessaires : les autres informations peuvent être complétées plus tard.</p>
      </div>
    </Feuille>
  );
}

export function FicheFidele() {
  const { id } = useParams();
  const { db, user, can, actions, notifier, egliseId } = useApp();
  const nav = useNavigate();
  const { gerer, fiche } = useDroitsFideles();
  const [edition, setEdition] = useState(null);
  const [ajout, setAjout] = useState(false);
  const [acces, setAcces] = useState(null);
  const f = fidelesEglise(db, egliseId).find((x) => x.id === id) || (db.fideles || []).find((x) => x.id === id);
  if (!f) return <><EnTete titre="Fidèle" /><Vide icone="Users" titre="Fiche introuvable" texte="Elle n'est peut-être pas encore synchronisée ou n'est pas visible pour votre profil." /></>;
  const u = compteDe(db, f);
  const moi = f.id === fiche?.id;
  const structures = structuresDuFidele(db, f.id);
  const postes = postesDuFidele(db, f.id);
  const anciennes = (db.appartenances || []).filter((a) => a.fidele_id === f.id && a.jusqu_au);
  const autres = (db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false && !structures.some((x) => x.id === s.id) && droitStructure(db, user, can, s.id, 'membres'));
  const peutModifier = gerer || moi;

  return (
    <div>
      <EnTete titre="Fiche du fidèle" actions={peutModifier && <button className="btn-icone" aria-label="Modifier" onClick={() => setEdition(f)}><Pencil size={20} /></button>} />
      <div className="profil-tete">
        <Avatar user={avatarDe(db, f)} taille={84} />
        <h2>{nomFidele(f)}</h2>
        <p className="texte-doux">{u ? ROLES[u.role]?.label : 'Fidèle sans compte dans l\'application'}</p>
      </div>
      <dl className="fiche">
        {f.telephone && <div><dt><Phone size={16} /> Téléphone</dt><dd><a className="lien" href={`tel:${f.telephone.replace(/\s/g, '')}`}>{f.telephone}</a></dd></div>}
        {f.email && <div><dt><Mail size={16} /> E-mail</dt><dd>{f.email}</dd></div>}
        {f.adresse && <div><dt><MapPin size={16} /> Adresse</dt><dd>{f.adresse}</dd></div>}
        {f.profession && <div><dt><Briefcase size={16} /> Profession</dt><dd>{f.profession}</dd></div>}
        {f.date_naissance && <div><dt>Naissance</dt><dd>{dateFr(f.date_naissance)}</dd></div>}
        <div><dt><CalendarDays size={16} /> Enregistré le</dt><dd>{f.date_enregistrement ? dateFr(f.date_enregistrement) : '—'}</dd></div>
        {f.notes && <div className="bloc-texte"><dt>Informations</dt><dd>{f.notes}</dd></div>}
      </dl>

      <section className="bloc bloc-liste">
        <div className="bloc-tete"><h2>Structures</h2>{autres.length > 0 && <button className="lien" onClick={() => setAjout(true)}><Plus size={16} /> Ajouter</button>}</div>
        {structures.length === 0 && <p className="texte-doux petit">N'appartient à aucune structure.</p>}
        {structures.map((s) => {
          const ps = postes.filter((p) => p.structure_id === s.id);
          const ap = (db.appartenances || []).find((a) => a.structure_id === s.id && a.fidele_id === f.id && !a.jusqu_au);
          return (
            <button key={s.id} className="ligne-user" onClick={() => nav(`/structures/${s.id}`)}>
              <span className="pastille" style={{ background: '#7A4FD614', color: '#7A4FD6' }}><Network size={18} /></span>
              <span className="ligne-user-texte"><strong>{s.nom}</strong><small>{ps.length ? ps.map((p) => p.intitule).join(', ') : 'Membre'}{ap?.depuis ? ` · depuis le ${dateFr(ap.depuis)}` : ''}</small></span>
            </button>
          );
        })}
        {anciennes.length > 0 && (
          <details className="historique-repli"><summary>Anciennes appartenances ({anciennes.length})</summary>
            {anciennes.map((a) => <p key={a.id} className="texte-doux petit">{(db.structures || []).find((s) => s.id === a.structure_id)?.nom} : du {dateFr(a.depuis)} au {dateFr(a.jusqu_au)}{a.motif_sortie ? ` (${a.motif_sortie})` : ''}</p>)}
          </details>
        )}
      </section>

      {can('admin.utilisateurs') && (
        <section className="bloc">
          <h2>Accès à l'application</h2>
          {u ? <p className="texte-doux">Compte : {u.email} · {ROLES[u.role]?.label}{u.statut === 'en_attente' ? ' (en attente)' : ''}</p> : (
            <>
              <p className="texte-doux petit">Ce fidèle n'a pas encore de compte. Indiquez son adresse e-mail : il pourra créer son compte avec cette adresse et retrouvera sa fiche.</p>
              <button className="btn btn-doux" onClick={() => setAcces({ email: f.email || '', role: 'fidele' })}><KeyRound size={18} /> Donner un accès</button>
            </>
          )}
        </section>
      )}

      {gerer && !moi && !u && (
        <button className="btn btn-danger-doux btn-plein" onClick={() => { const r = actions.supprimerFidele(f.id); if (typeof r === 'string') notifier(r, 'erreur'); else { notifier('Fiche supprimée', 'ok', 'depense', { annuler: () => actions.restaurer(r.corbeille) }); nav(-1); } }}><Trash2 size={18} /> Supprimer cette fiche</button>
      )}
      {edition && <EditeurFidele fidele={edition} onFermer={() => setEdition(null)} />}
      <Feuille ouverte={ajout} onFermer={() => setAjout(false)} titre="Ajouter à une structure">
        <div className="liste-choix">{autres.map((s) => <button key={s.id} onClick={() => { const ids = actions.ajouterMembres(s.id, [f.id]); notifier(`${f.prenom} a rejoint ${s.nom}`, 'ok', 'succes', { annuler: () => actions.retirerAppartenances(ids) }); setAjout(false); }}>{s.nom}</button>)}</div>
      </Feuille>
      <Feuille ouverte={!!acces} onFermer={() => setAcces(null)} titre="Donner un accès"
        pied={<><button className="btn btn-doux" onClick={() => setAcces(null)}>Annuler</button><button className="btn btn-primaire" disabled={!acces?.email?.includes('@')} onClick={() => {
          const e = actions.enregistrerUtilisateur({ prenom: f.prenom, nom: f.nom, email: acces.email, role: acces.role, caisses: [], fidele_id: f.id });
          if (e) notifier(e, 'erreur'); else { notifier('Accès créé : la personne crée son compte avec cette adresse'); setAcces(null); }
        }}>Créer l'accès</button></>}>
        {acces && <div className="pile">
          <Champ label="Adresse e-mail"><input type="email" value={acces.email} onChange={(e) => setAcces({ ...acces, email: e.target.value })} /></Champ>
          <Champ label="Rôle dans l'application" aide="Le rôle donne des droits sur l'application ; un poste dans une structure se gère dans la structure.">
            <select value={acces.role} onChange={(e) => setAcces({ ...acces, role: e.target.value })}>{['fidele', 'gestionnaire', 'pasteur', 'admin'].map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</select>
          </Champ>
        </div>}
      </Feuille>
    </div>
  );
}
