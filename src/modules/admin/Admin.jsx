import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Plus as PlusIcon, Pencil, Trash2, Archive, ArchiveRestore, Search, Eye, EyeOff, Building2, Check, X, Hourglass } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { caissesEglise, soldeCaisse } from '../../lib/finance';
import { DROITS, MATRICE_DEFAUT, ROLES, ROLES_EGLISE } from '../../lib/permissions';
import { fcfa } from '../../lib/format';
import { Avatar, BadgeRole, Champ, Confirmation, EnTete, Feuille, IMAGES, Interrupteur, LogoEglise, PastilleCaisse, Segmente, Vide } from '../../components/ui';
import EditeurCaisse, { nouvelleCaisse } from '../../components/EditeurCaisse';


export function AdminCaisses() {
  const { db, egliseId, actions, notifier } = useApp();
  const [edition, setEdition] = useState(null);
  const [suppr, setSuppr] = useState(null);
  const toutes = caissesEglise(db, egliseId, true);

  return (
    <div>
      <EnTete titre="Caisses" actions={<button className="btn-icone" aria-label="Nouvelle caisse" onClick={() => setEdition(nouvelleCaisse())}><PlusIcon size={22} /></button>} />
      <div className="liste-admin">
        {toutes.map((c) => (
          <div key={c.id} className={`admin-carte ${c.actif === false ? 'archivee' : ''}`}>
            <div className="admin-carte-image" style={{ backgroundImage: `url(${IMAGES[c.image] || IMAGES.communaute})` }} />
            <div className="admin-carte-corps">
              <div className="admin-carte-ligne">
                <PastilleCaisse caisse={c} taille={36} />
                <span className="admin-carte-titre"><strong>{c.nom}</strong><small>{c.actif === false ? 'Archivée' : fcfa(soldeCaisse(db, c.id))}</small></span>
                {c.visible_fideles !== false ? <Eye size={16} className="texte-doux" aria-label="Visible par les fidèles" /> : <EyeOff size={16} className="texte-doux" aria-label="Masquée aux fidèles" />}
              </div>
              <p className="texte-doux petit">{c.description}</p>
              <div className="admin-carte-actions">
                {c.actif === false ? (
                  <button className="btn btn-doux petit" onClick={() => { actions.restaurerCaisse(c.id); notifier('Caisse restaurée'); }}><ArchiveRestore size={16} /> Restaurer</button>
                ) : (
                  <>
                    <button className="btn btn-doux petit" onClick={() => setEdition({ ...c })}><Pencil size={16} /> Modifier</button>
                    <button className="btn btn-danger-doux petit" onClick={() => setSuppr(c)}><Trash2 size={16} /> Supprimer</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <EditeurCaisse caisse={edition} setCaisse={setEdition} onFermer={() => setEdition(null)} />
      <Confirmation ouverte={!!suppr} onFermer={() => setSuppr(null)} danger libelle="Supprimer" titre={`Supprimer ${suppr?.nom} ?`}
        message="Si la caisse contient des opérations, elle sera archivée pour conserver l'historique. Sinon, elle sera supprimée avec ses catégories."
        onConfirmer={() => { const id = suppr.id; const r = actions.supprimerCaisse(id); if (r === 'archivee') notifier('Caisse archivée (elle contient des opérations)', 'ok', 'tic', { annuler: () => actions.restaurerCaisse(id) }); else notifier('Caisse supprimée', 'ok', 'depense', { annuler: () => actions.restaurer(r?.corbeille || []) }); }} />
    </div>
  );
}

export function AdminCategories() {
  const { db, egliseId, actions, notifier } = useApp();
  const [type, setType] = useState('recette');
  const [edition, setEdition] = useState(null);
  const [suppr, setSuppr] = useState(null);
  const caisses = caissesEglise(db, egliseId);
  const cats = db.categories.filter((c) => c.eglise_id === egliseId && c.type === type && !c.transfert);
  const groupes = [{ id: null, nom: 'Toutes les caisses' }, ...caisses].map((c) => ({ c, items: cats.filter((x) => (x.caisse_id || null) === c.id) })).filter((g) => g.items.length || g.c.id);
  const nbOps = (id) => db.operations.filter((o) => o.categorie_id === id).length;

  return (
    <div>
      <EnTete titre="Catégories" actions={<button className="btn-icone" aria-label="Nouvelle catégorie" onClick={() => setEdition({ nom: '', type, caisse_id: caisses[0]?.id || null })}><PlusIcon size={22} /></button>} />
      <div className="outils"><Segmente valeur={type} onChange={setType} options={[{ v: 'recette', l: 'Recettes' }, { v: 'depense', l: 'Dépenses' }]} /></div>
      {groupes.map((g) => (
        <section key={g.c.id || 'tout'} className="bloc bloc-liste">
          <div className="bloc-tete"><h2>{g.c.nom}</h2><span className="texte-doux petit">{g.items.length}</span></div>
          {g.items.length === 0 && <p className="texte-doux petit">Aucune catégorie propre à cette caisse.</p>}
          {g.items.map((c) => (
            <div key={c.id} className="ligne-cat">
              <span><strong>{c.nom}</strong><small>{nbOps(c.id)} opération(s){c.systeme ? ' · catégorie de base' : ''}</small></span>
              {!c.systeme && <>
                <button className="btn-icone petit" aria-label="Modifier" onClick={() => setEdition({ ...c })}><Pencil size={17} /></button>
                <button className="btn-icone petit" aria-label="Supprimer" onClick={() => setSuppr(c)}><Trash2 size={17} /></button>
              </>}
            </div>
          ))}
        </section>
      ))}
      <Feuille ouverte={!!edition} onFermer={() => setEdition(null)} titre={edition?.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        pied={<><button className="btn btn-doux" onClick={() => setEdition(null)}>Annuler</button><button className="btn btn-primaire" onClick={() => { if (!edition.nom.trim()) return; actions.enregistrerCategorie({ ...edition, nom: edition.nom.trim() }); notifier('Catégorie enregistrée'); setEdition(null); }}>Enregistrer</button></>}>
        {edition && (
          <div className="pile">
            <Segmente valeur={edition.type} onChange={(v) => setEdition({ ...edition, type: v })} options={[{ v: 'recette', l: 'Recette' }, { v: 'depense', l: 'Dépense' }]} />
            <Champ label="Nom"><input value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} placeholder="Ex. Offrandes de mariage" /></Champ>
            <Champ label="Caisse concernée">
              <select value={edition.caisse_id || ''} onChange={(e) => setEdition({ ...edition, caisse_id: e.target.value || null })}>
                <option value="">Toutes les caisses</option>
                {caisses.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </Champ>
          </div>
        )}
      </Feuille>
      <Confirmation ouverte={!!suppr} onFermer={() => setSuppr(null)} danger libelle="Supprimer" titre={`Supprimer « ${suppr?.nom} » ?`}
        message={`${suppr ? nbOps(suppr.id) : 0} opération(s) seront reclassées dans « Autre / N.P. ».`}
        onConfirmer={() => { const r = actions.supprimerCategorie(suppr.id); notifier('Catégorie supprimée', 'ok', 'depense', { annuler: () => { actions.restaurer(r?.corbeille || []); notifier('Catégorie restaurée', 'ok', 'tic'); } }); }} />
    </div>
  );
}

export function AdminUtilisateurs() {
  const nav = useNavigate();
  const { db, egliseId, actions, notifier, user: moi, online } = useApp();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('tous');
  const [edition, setEdition] = useState(null);
  const [mdpTemp, setMdpTemp] = useState(null);
  const caisses = caissesEglise(db, egliseId);
  // Les demandes des pasteurs sont validées par le administrateur de l’application
  const attente = db.users.filter((u) => u.eglise_id === egliseId && u.statut === 'en_attente' && (moi.role === 'super_admin' || u.role !== 'pasteur'));
  const users = useMemo(() => db.users
    .filter((u) => u.eglise_id === egliseId && !['en_attente', 'refuse'].includes(u.statut) && (role === 'tous' || u.role === role) && `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => ROLES_EGLISE.indexOf(a.role) - ROLES_EGLISE.indexOf(b.role) || a.nom.localeCompare(b.nom)), [db, egliseId, role, q]);

  const enregistrer = () => {
    if (!edition.prenom?.trim() || !edition.email?.includes('@')) return notifier('Renseignez au moins le prénom et une adresse e-mail valide.', 'erreur');
    const err = actions.enregistrerUtilisateur({ ...edition, caisses: edition.role === 'gestionnaire' ? edition.caisses : [] });
    if (err) return notifier(err, 'erreur');
    notifier(edition.id ? 'Utilisateur modifié' : online ? 'Utilisateur ajouté. Il crée son compte avec cette adresse e-mail.' : 'Compte créé. Mot de passe provisoire : eglise360');
    setEdition(null);
  };
  const basculer = (id) => setEdition((e) => ({ ...e, caisses: e.caisses.includes(id) ? e.caisses.filter((x) => x !== id) : [...e.caisses, id] }));

  return (
    <div>
      <EnTete titre="Utilisateurs" actions={<button className="btn-icone" aria-label="Ajouter un utilisateur" onClick={() => setEdition({ prenom: '', nom: '', email: '', role: 'fidele', caisses: [], actif: true })}><PlusIcon size={22} /></button>} />
      <div className="outils">
        <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une personne" /></div>
        <div className="puces defile">
          <button className={`puce ${role === 'tous' ? 'active' : ''}`} onClick={() => setRole('tous')}>Tous</button>
          {ROLES_EGLISE.map((r) => <button key={r} className={`puce ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>{ROLES[r].court}</button>)}
        </div>
      </div>
      {attente.length > 0 && (
        <section className="bloc bloc-liste bloc-attente">
          <div className="bloc-tete"><h2><Hourglass size={16} /> Demandes d'adhésion</h2><span className="badge">{attente.length}</span></div>
          {attente.map((u) => (
            <div key={u.id} className="ligne-user">
              <Avatar user={u} taille={42} />
              <span className="ligne-user-texte"><strong>{u.prenom} {u.nom}</strong><small>{u.email}</small></span>
              <button className="btn-rond refuser" aria-label={`Refuser ${u.prenom}`} onClick={() => { actions.validerMembre(u.id, false); notifier('Demande refusée'); }}><X size={18} /></button>
              <button className="btn-rond accepter" aria-label={`Accepter ${u.prenom}`} onClick={() => { actions.validerMembre(u.id, true); notifier(`${u.prenom} a rejoint l'église`); }}><Check size={18} /></button>
            </div>
          ))}
        </section>
      )}
      <div className="bloc bloc-liste">
        {users.length === 0 && <Vide icone="Users" titre="Personne ne correspond" />}
        {users.map((u) => (
          <button key={u.id} className={`ligne-user ${u.actif ? '' : 'inactif'}`} onClick={() => setEdition({ ...u, caisses: u.caisses || [] })}>
            <Avatar user={u} taille={42} />
            <span className="ligne-user-texte">
              <strong>{u.prenom} {u.nom}{u.id === moi.id ? ' (vous)' : ''}</strong>
              <small>{u.role === 'gestionnaire' ? (caisses.filter((c) => u.caisses?.includes(c.id)).map((c) => c.nom).join(', ') || 'Aucune caisse attribuée') : u.email}</small>
            </span>
            {u.actif ? <BadgeRole role={u.role} /> : <span className="badge">Désactivé</span>}
          </button>
        ))}
      </div>

      <Feuille ouverte={!!edition} onFermer={() => setEdition(null)} titre={edition?.id ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
        pied={<><button className="btn btn-doux" onClick={() => setEdition(null)}>Annuler</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button></>}>
        {edition && (
          <div className="pile">
            <div className="deux-col">
              <Champ label="Prénom"><input value={edition.prenom} onChange={(e) => setEdition({ ...edition, prenom: e.target.value })} /></Champ>
              <Champ label="Nom"><input value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} /></Champ>
            </div>
            <Champ label="Adresse e-mail"><input type="email" value={edition.email} disabled={!!edition.id} onChange={(e) => setEdition({ ...edition, email: e.target.value })} /></Champ>
            <div className="champ"><span className="champ-label">Rôle</span>
              <div className="liste-choix">
                {ROLES_EGLISE.map((r) => (
                  <button key={r} className={edition.role === r ? 'actif' : ''} disabled={edition.id === moi.id} onClick={() => setEdition({ ...edition, role: r })}>{ROLES[r].label}</button>
                ))}
              </div>
            </div>
            {edition.role === 'gestionnaire' && (
              <div className="champ"><span className="champ-label">Caisses gérées</span>
                <div className="choix-caisses multi">
                  {caisses.map((c) => (
                    <button type="button" key={c.id} className={edition.caisses.includes(c.id) ? 'actif' : ''} onClick={() => basculer(c.id)}>
                      <PastilleCaisse caisse={c} taille={28} /><span>{c.nom}</span>
                    </button>
                  ))}
                </div>
                <span className="champ-aide">Il pourra consulter les autres caisses sans les modifier.</span>
              </div>
            )}
            {edition.id && edition.id !== moi.id && !edition.auth_id && (
              <button type="button" className="btn btn-danger-doux" onClick={() => { const r = actions.supprimerInvitation(edition.id); setEdition(null); if (typeof r === 'string') notifier(r, 'erreur'); else notifier('Accès supprimé (la fiche de fidèle est conservée)', 'ok', 'depense', { annuler: () => actions.restaurer(r.corbeille) }); }}>Supprimer cet accès (jamais utilisé)</button>
            )}
            {edition.id && (db.fideles || []).some((f) => f.user_id === edition.id) && (
              <button type="button" className="btn btn-doux" onClick={() => { const f = db.fideles.find((x) => x.user_id === edition.id); setEdition(null); nav(`/fideles/${f.id}`); }}>Fiche de fidèle : structures et postes</button>
            )}
            {edition.id && edition.id !== moi.id && <Interrupteur label="Compte actif" aide="Un compte désactivé ne peut plus se connecter." actif={edition.actif} onChange={(v) => setEdition({ ...edition, actif: v })} />}
            {edition.id && edition.id !== moi.id && (
              <div className="carte-form mdp-temp">
                <span className="champ-label">Mot de passe oublié ?</span>
                {mdpTemp?.id === edition.id ? (
                  <p>Mot de passe temporaire : <b className="mdp-affiche">{mdpTemp.mdp}</b><br /><small className="texte-doux">Transmettez-le à la personne : elle devra le changer à sa prochaine connexion.</small></p>
                ) : (
                  <button type="button" className="btn btn-doux petit" onClick={async () => { const r = await actions.motDePasseTemporaire(edition.id); if (r.erreur) notifier(r.erreur, 'erreur'); else setMdpTemp({ id: edition.id, mdp: r.mdp }); }}>Donner un mot de passe temporaire</button>
                )}
              </div>
            )}
          </div>
        )}
      </Feuille>
    </div>
  );
}

export function AdminDroits() {
  const { eglise, actions } = useApp();
  const [role, setRole] = useState('gestionnaire');
  const matrice = { ...MATRICE_DEFAUT[role], ...(eglise.droits[role] || {}) };
  return (
    <div>
      <EnTete titre="Droits d'accès" sousTitre="Les changements s'appliquent immédiatement" />
      <div className="outils">
        <div className="puces defile">
          {ROLES_EGLISE.map((r) => <button key={r} className={`puce ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>{ROLES[r].label}</button>)}
        </div>
      </div>
      {DROITS.map((g) => (
        <section key={g.groupe} className="bloc">
          <h2>{g.groupe}</h2>
          {g.items.map((d) => (
            <Interrupteur key={d.cle} label={d.label} actif={!!matrice[d.cle]}
              desactive={role === 'admin' && d.cle === 'admin.droits'}
              aide={role === 'admin' && d.cle === 'admin.droits' ? 'Toujours actif pour l\'administrateur' : undefined}
              onChange={(v) => actions.majDroits(role, d.cle, v)} />
          ))}
        </section>
      ))}
    </div>
  );
}

export function SuperEglises() {
  const { db, actions, notifier, online } = useApp();
  const [f, setF] = useState(null);
  return (
    <div>
      <EnTete titre="Toutes les églises" actions={<button className="btn-icone" aria-label="Nouvelle église" onClick={() => setF({ nom: '', ville: '', adminPrenom: '', adminNom: '', adminEmail: '' })}><PlusIcon size={22} /></button>} />
      {db.eglises.some((e) => e.statut === 'en_attente') && (
        <section className="bloc bloc-liste bloc-attente">
          <div className="bloc-tete"><h2><Hourglass size={16} /> Inscriptions à valider</h2></div>
          {db.eglises.filter((e) => e.statut === 'en_attente').map((e) => {
            const adm = db.users.find((u) => u.eglise_id === e.id && u.role === 'admin');
            return (
              <div key={e.id} className="ligne-user">
                <LogoEglise eglise={e} taille={42} />
                <span className="ligne-user-texte"><strong>{e.nom}</strong><small>{e.ville || 'Ville non précisée'}{adm ? ` · ${adm.prenom} ${adm.nom}` : ''}</small></span>
                <button className="btn-rond refuser" aria-label={`Refuser ${e.nom}`} onClick={() => { actions.validerEglise(e.id, false); notifier('Inscription refusée'); }}><X size={18} /></button>
                <button className="btn-rond accepter" aria-label={`Valider ${e.nom}`} onClick={() => { actions.validerEglise(e.id, true); notifier(`${e.nom} est validée`); }}><Check size={18} /></button>
              </div>
            );
          })}
        </section>
      )}
      {db.users.some((u) => u.statut === 'en_attente' && u.role === 'pasteur') && (
        <section className="bloc bloc-liste bloc-attente">
          <div className="bloc-tete"><h2><Hourglass size={16} /> Pasteurs à valider</h2></div>
          {db.users.filter((u) => u.statut === 'en_attente' && u.role === 'pasteur').map((u) => (
            <div key={u.id} className="ligne-user">
              <Avatar user={u} taille={42} />
              <span className="ligne-user-texte"><strong>{u.prenom} {u.nom}</strong><small>Demande à rejoindre {db.eglises.find((e) => e.id === u.eglise_id)?.nom || 'une église'}</small></span>
              <button className="btn-rond refuser" aria-label={`Refuser ${u.prenom}`} onClick={() => { actions.validerMembre(u.id, false); notifier('Demande refusée'); }}><X size={18} /></button>
              <button className="btn-rond accepter" aria-label={`Accepter ${u.prenom}`} onClick={() => { actions.validerMembre(u.id, true); notifier(`${u.prenom} est désormais pasteur de cette église`); }}><Check size={18} /></button>
            </div>
          ))}
        </section>
      )}
      <div className="bloc bloc-liste">
        {db.eglises.filter((e) => e.statut !== 'en_attente').map((e) => {
          const nbU = db.users.filter((u) => u.eglise_id === e.id).length;
          const solde = caissesEglise(db, e.id).reduce((s, c) => s + soldeCaisse(db, c.id), 0);
          return (
            <button key={e.id} className="ligne-user" onClick={() => { actions.changerEglise(e.id); notifier(`Vous consultez ${e.nom}`); }}>
              <LogoEglise eglise={e} taille={42} />
              <span className="ligne-user-texte"><strong>{e.nom}</strong><small>{e.statut === 'refuse' ? 'Refusée · ' : ''}{e.ville} · {nbU} utilisateur(s) · {fcfa(solde)}</small></span>
            </button>
          );
        })}
      </div>
      <Feuille ouverte={!!f} onFermer={() => setF(null)} titre="Nouvelle église"
        pied={<><button className="btn btn-doux" onClick={() => setF(null)}>Annuler</button><button className="btn btn-primaire" onClick={() => {
          if (!f.nom || !f.adminEmail) return notifier('Nom de l\'église et e-mail de l\'administrateur requis.', 'erreur');
          const e = actions.creerEglise(f); if (e) return notifier(e, 'erreur');
          notifier(online ? 'Église créée. L\'administrateur crée son compte avec cette adresse e-mail.' : 'Église créée. Mot de passe provisoire de l\'admin : eglise360'); setF(null);
        }}>Créer</button></>}>
        {f && (
          <div className="pile">
            <Champ label="Nom de l'église"><input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
            <Champ label="Ville"><input value={f.ville} onChange={(e) => setF({ ...f, ville: e.target.value })} /></Champ>
            <h3 className="menu-titre">Administrateur de l'église</h3>
            <div className="deux-col">
              <Champ label="Prénom"><input value={f.adminPrenom} onChange={(e) => setF({ ...f, adminPrenom: e.target.value })} /></Champ>
              <Champ label="Nom"><input value={f.adminNom} onChange={(e) => setF({ ...f, adminNom: e.target.value })} /></Champ>
            </div>
            <Champ label="Adresse e-mail"><input type="email" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></Champ>
          </div>
        )}
      </Feuille>
    </div>
  );
}
