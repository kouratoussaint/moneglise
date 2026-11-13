// Console d'administration de l'application (réservée à l'administrateur de l'application)
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Users, UserRound, Wallet, CalendarDays, Hourglass, Check, X, Search, LogIn, PauseCircle, PlayCircle, Pencil, Trash2, KeyRound, Activity, ShieldAlert } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { ROLES, ROLES_EGLISE } from '../../lib/permissions';
import { totaux } from '../../lib/finance';
import { statutActivite } from '../../lib/activites';
import { fcfa, num, ymOf, dateFr } from '../../lib/format';
import { Avatar, BadgeRole, Champ, Confirmation, EnTete, Feuille, LogoEglise, Interrupteur, Vide } from '../../components/ui';

const STATUTS = { actif: ['Active', '#0E9F6E'], en_attente: ['En attente', '#C98A06'], suspendue: ['Suspendue', '#D9475A'], refuse: ['Refusée', '#5B6B86'] };
const statutEglise = (e) => STATUTS[e.statut || 'actif'] || STATUTS.actif;
const ilYa = (iso) => {
  if (!iso) return '—';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 3) return 'en ligne';
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
};

export default function Console() {
  const [params, setParams] = useSearchParams();
  const onglet = params.get('onglet') || 'tableau';
  const { db } = useApp();
  const aValider = db.eglises.filter((e) => e.statut === 'en_attente').length + db.users.filter((u) => u.statut === 'en_attente' && u.role === 'pasteur').length;
  const ONGLETS = [['tableau', 'Tableau de bord'], ['eglises', 'Églises'], ['comptes', 'Comptes'], ['validations', 'Validations']];
  return (
    <div>
      <EnTete titre="Console d'administration" sousTitre="Administration de l'application Mon Église" />
      <div className="onglets-msg onglets-console">
        {ONGLETS.map(([v, l]) => (
          <button key={v} className={onglet === v ? 'actif' : ''} onClick={() => setParams({ onglet: v }, { replace: true })}>
            <span>{l}</span>{v === 'validations' && aValider > 0 && <b className="compte">{aValider}</b>}
          </button>
        ))}
      </div>
      {onglet === 'tableau' && <TableauDeBord />}
      {onglet === 'eglises' && <Eglises />}
      {onglet === 'comptes' && <Comptes />}
      {onglet === 'validations' && <Validations />}
    </div>
  );
}

// ---------- 1. Tableau de bord de la plateforme ----------
function TableauDeBord() {
  const { db, sync, online } = useApp();
  const nav = useNavigate();
  const [, setParams] = useSearchParams();
  const ym = ymOf(new Date().toISOString().slice(0, 10));
  const d = useMemo(() => {
    const eglises = db.eglises.filter((e) => e.id !== '_global');
    const comptes = db.users.filter((u) => u.role !== 'super_admin');
    const fideles = (db.fideles || []).filter((f) => f.actif !== false);
    const opsMois = db.operations.filter((o) => ymOf(o.date) === ym && !o.transfert_id);
    const sem = Date.now() - 7 * 86400000;
    const presences = (db.presences || []).filter((p) => p.vu_le).sort((a, b) => b.vu_le.localeCompare(a.vu_le));
    const actifs7 = new Set(presences.filter((p) => Date.parse(p.vu_le) > sem).map((p) => p.user_id));
    const parEglise = eglises.map((e) => ({
      e,
      fideles: fideles.filter((f) => f.eglise_id === e.id).length,
      comptes: comptes.filter((u) => u.eglise_id === e.id).length,
      ops: opsMois.filter((o) => o.eglise_id === e.id).length,
      vu: presences.find((p) => comptes.some((u) => u.id === p.user_id && u.eglise_id === e.id))?.vu_le,
    })).sort((a, b) => b.fideles - a.fideles);
    return {
      eglises, parEglise, comptes, fideles, actifs7: actifs7.size, opsMois, t: totaux(opsMois),
      activites: (db.activites || []).filter((a) => ['a_venir', 'en_cours'].includes(statutActivite(a))).length,
      attente: eglises.filter((e) => e.statut === 'en_attente').length + db.users.filter((u) => u.statut === 'en_attente' && u.role === 'pasteur').length,
      desactives: comptes.filter((u) => u.actif === false).length,
      connexions: presences.slice(0, 6).map((p) => ({ p, u: db.users.find((u) => u.id === p.user_id) })).filter((x) => x.u),
    };
  }, [db, ym]);
  const parStatut = (s) => d.eglises.filter((e) => (e.statut || 'actif') === s).length;
  return (
    <div className="pile">
      {d.attente > 0 && <button className="alerte bouton-alerte" onClick={() => setParams({ onglet: 'validations' })}><Hourglass size={18} /> {d.attente} validation{d.attente > 1 ? 's' : ''} en attente</button>}
      <div className="console-kpis">
        <Kpi icone={Building2} c="#1F5FD6" v={d.eglises.length} l="églises" s={`${parStatut('actif')} actives · ${parStatut('en_attente')} en attente${parStatut('suspendue') ? ` · ${parStatut('suspendue')} suspendue(s)` : ''}`} />
        <Kpi icone={Users} c="#0E9F6E" v={d.fideles.length} l="fidèles" s="toutes églises" />
        <Kpi icone={UserRound} c="#7A4FD6" v={d.comptes.length} l="comptes" s={`${d.actifs7} actif(s) sur 7 jours${d.desactives ? ` · ${d.desactives} désactivé(s)` : ''}`} />
        <Kpi icone={Wallet} c="#C98A06" v={num(d.opsMois.length)} l="opérations ce mois" s={`+ ${fcfa(d.t.recettes)} · − ${fcfa(d.t.depenses)}`} />
        <Kpi icone={CalendarDays} c="#D9475A" v={d.activites} l="activités à venir ou en cours" />
        <Kpi icone={Activity} c="#0B2A66" v={online ? 'En ligne' : 'Démo'} l="serveur" s={sync?.derniere ? `synchronisé ${ilYa(sync.derniere)}` : 'pas encore synchronisé'} />
      </div>

      <section className="bloc bloc-liste">
        <div className="bloc-tete"><h2>Par église</h2></div>
        {d.parEglise.map(({ e, fideles, comptes, ops, vu }) => (
          <button key={e.id} className="ligne-user" onClick={() => setParams({ onglet: 'eglises', eglise: e.id })}>
            <LogoEglise eglise={e} taille={38} />
            <span className="ligne-user-texte"><strong>{e.nom}</strong><small>{fideles} fidèles · {comptes} comptes · {ops} opération(s) ce mois · activité {ilYa(vu)}</small></span>
            <span className="badge" style={{ color: statutEglise(e)[1], background: `${statutEglise(e)[1]}14` }}>{statutEglise(e)[0]}</span>
          </button>
        ))}
      </section>

      <section className="bloc bloc-liste">
        <div className="bloc-tete"><h2>Dernières connexions</h2></div>
        {d.connexions.length === 0 && <p className="texte-doux petit">Aucune connexion enregistrée.</p>}
        {d.connexions.map(({ p, u }) => (
          <div key={p.id} className="ligne-user">
            <Avatar user={u} taille={36} />
            <span className="ligne-user-texte"><strong>{u.prenom} {u.nom}</strong><small>{ROLES[u.role]?.label} · {db.eglises.find((e) => e.id === u.eglise_id)?.nom || '—'}</small></span>
            <small className="texte-doux">{ilYa(p.vu_le)}</small>
          </div>
        ))}
      </section>
      <button className="btn btn-doux" onClick={() => nav('/historique')}>Historique des actions</button>
    </div>
  );
}
const Kpi = ({ icone: I, c, v, l, s }) => (
  <div className="console-kpi" style={{ '--c': c }}><span><I size={18} /></span><strong>{v}</strong><small>{l}</small>{s && <em>{s}</em>}</div>
);

// ---------- 2. Églises ----------
function Eglises() {
  const { db, actions, notifier } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('');
  const [edition, setEdition] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const ouverte = db.eglises.find((e) => e.id === params.get('eglise'));
  const liste = db.eglises.filter((e) => e.id !== '_global' && (!filtre || (e.statut || 'actif') === filtre) && (!q || `${e.nom} ${e.ville || ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const fermer = () => setParams({ onglet: 'eglises' }, { replace: true });
  const entrer = (e) => { actions.changerEglise(e.id); notifier(`Vous administrez maintenant ${e.nom}`); nav('/'); };

  return (
    <div className="pile">
      <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou ville" /></div>
      <div className="puces defile">
        {[['', 'Toutes'], ['actif', 'Actives'], ['en_attente', 'En attente'], ['suspendue', 'Suspendues'], ['refuse', 'Refusées']].map(([v, l]) => (
          <button key={v} className={`puce ${filtre === v ? 'active' : ''}`} onClick={() => setFiltre(v)}>{l}</button>
        ))}
      </div>
      {liste.length === 0 ? <Vide icone="Building2" titre="Aucune église" /> : (
        <div className="bloc bloc-liste">
          {liste.map((e) => (
            <button key={e.id} className="ligne-user" onClick={() => setParams({ onglet: 'eglises', eglise: e.id })}>
              <LogoEglise eglise={e} taille={40} />
              <span className="ligne-user-texte"><strong>{e.nom}</strong><small>{e.ville || '—'} · {db.users.filter((u) => u.eglise_id === e.id).length} comptes</small></span>
              <span className="badge" style={{ color: statutEglise(e)[1], background: `${statutEglise(e)[1]}14` }}>{statutEglise(e)[0]}</span>
            </button>
          ))}
        </div>
      )}

      <Feuille ouverte={!!ouverte} onFermer={fermer} titre={ouverte?.nom || ''}>
        {ouverte && (() => {
          const comptes = db.users.filter((u) => u.eglise_id === ouverte.id);
          const fideles = (db.fideles || []).filter((f) => f.eglise_id === ouverte.id && f.actif !== false).length;
          const admins = comptes.filter((u) => u.role === 'admin');
          const st = ouverte.statut || 'actif';
          const vide = !db.operations.some((o) => o.eglise_id === ouverte.id) && comptes.filter((u) => u.role !== 'super_admin').length <= 1;
          return (
            <div className="pile">
              <dl className="fiche">
                <div><dt>Statut</dt><dd style={{ color: statutEglise(ouverte)[1], fontWeight: 700 }}>{statutEglise(ouverte)[0]}</dd></div>
                <div><dt>Ville</dt><dd>{ouverte.ville || '—'}</dd></div>
                <div><dt>Fidèles</dt><dd>{fideles}</dd></div>
                <div><dt>Comptes</dt><dd>{comptes.length}</dd></div>
                <div><dt>Administrateur(s)</dt><dd>{admins.map((u) => `${u.prenom} ${u.nom}`).join(', ') || '—'}</dd></div>
                {ouverte.coordonnees?.telephone && <div><dt>Téléphone</dt><dd>{ouverte.coordonnees.telephone}</dd></div>}
                {ouverte.cree_le && <div><dt>Inscrite le</dt><dd>{dateFr(ouverte.cree_le.slice(0, 10))}</dd></div>}
              </dl>
              {st === 'en_attente' && (
                <div className="deux-col">
                  <button className="btn btn-danger-doux" onClick={() => { actions.validerEglise(ouverte.id, false); notifier('Inscription refusée'); }}><X size={18} /> Refuser</button>
                  <button className="btn btn-primaire" onClick={() => { actions.validerEglise(ouverte.id, true); notifier(`${ouverte.nom} est validée`); }}><Check size={18} /> Valider</button>
                </div>
              )}
              <button className="btn btn-primaire" onClick={() => entrer(ouverte)}><LogIn size={18} /> Entrer dans l'église et l'administrer</button>
              <button className="btn btn-doux" onClick={() => setEdition({ id: ouverte.id, nom: ouverte.nom, ville: ouverte.ville || '' })}><Pencil size={18} /> Modifier le nom et la ville</button>
              {st === 'actif' && <button className="btn btn-doux" onClick={() => setConfirm({ type: 'suspendre', e: ouverte })}><PauseCircle size={18} /> Suspendre l'accès</button>}
              {(st === 'suspendue' || st === 'refuse') && <button className="btn btn-doux" onClick={() => { actions.statutEglise(ouverte.id, 'actif'); notifier(`${ouverte.nom} est de nouveau active`); }}><PlayCircle size={18} /> Réactiver</button>}
              {vide && st !== 'actif' && <button className="btn btn-danger-doux" onClick={() => setConfirm({ type: 'supprimer', e: ouverte })}><Trash2 size={18} /> Supprimer l'église</button>}
              {!vide && <p className="texte-doux petit">Une église qui a des opérations ou des membres ne se supprime pas : suspendez-la (ses données sont conservées).</p>}
            </div>
          );
        })()}
      </Feuille>
      <Feuille ouverte={!!edition} onFermer={() => setEdition(null)} titre="Modifier l'église"
        pied={<><button className="btn btn-doux" onClick={() => setEdition(null)}>Annuler</button><button className="btn btn-primaire" disabled={!edition?.nom.trim()} onClick={() => { actions.modifierEgliseApp(edition.id, { nom: edition.nom.trim(), ville: edition.ville.trim() }); notifier('Église modifiée'); setEdition(null); }}>Enregistrer</button></>}>
        {edition && <div className="pile">
          <Champ label="Nom"><input value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} /></Champ>
          <Champ label="Ville"><input value={edition.ville} onChange={(e) => setEdition({ ...edition, ville: e.target.value })} /></Champ>
        </div>}
      </Feuille>
      <Confirmation ouverte={!!confirm} onFermer={() => setConfirm(null)} danger
        titre={confirm?.type === 'supprimer' ? `Supprimer ${confirm?.e.nom} ?` : `Suspendre ${confirm?.e.nom} ?`}
        message={confirm?.type === 'supprimer' ? 'L\'église est retirée (restaurable depuis la corbeille).' : 'Ses membres ne pourront plus utiliser l\'application pour cette église. Les données sont conservées et l\'église peut être réactivée à tout moment.'}
        libelle={confirm?.type === 'supprimer' ? 'Supprimer' : 'Suspendre'}
        onConfirmer={() => {
          if (confirm.type === 'supprimer') { const r = actions.supprimerEglise(confirm.e.id); notifier('Église supprimée', 'ok', 'depense', { annuler: () => actions.restaurer(r.corbeille) }); fermer(); }
          else { actions.statutEglise(confirm.e.id, 'suspendue'); notifier(`${confirm.e.nom} est suspendue`); }
        }} />
    </div>
  );
}

// ---------- 3. Comptes (toutes églises) ----------
function Comptes() {
  const { db, actions, notifier, online } = useApp();
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('');
  const [ouvert, setOuvert] = useState(null);
  const [mdp, setMdp] = useState(null);
  const liste = db.users.filter((u) => u.role !== 'super_admin'
    && (!q || `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(q.toLowerCase()))
    && (!filtre || (filtre === 'desactives' ? u.actif === false : filtre === 'attente' ? u.statut === 'en_attente' : filtre === 'invitations' ? !u.auth_id : u.role === filtre)))
    .sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr'));
  const anomalies = db.users.filter((u) => u.role !== 'super_admin' && (u.actif === false || u.statut === 'en_attente')).length;
  const u = ouvert && db.users.find((x) => x.id === ouvert);
  return (
    <div className="pile">
      <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom ou e-mail" /></div>
      <div className="puces defile">
        {[['', 'Tous'], ['admin', 'Administrateurs'], ['pasteur', 'Pasteurs'], ['gestionnaire', 'Gestionnaires'], ['fidele', 'Fidèles'], ['desactives', 'Désactivés'], ['attente', 'En attente'], ...(online ? [['invitations', 'Jamais connectés']] : [])].map(([v, l]) => (
          <button key={v} className={`puce ${filtre === v ? 'active' : ''}`} onClick={() => setFiltre(v)}>{l}</button>
        ))}
      </div>
      {anomalies > 0 && !filtre && <p className="note"><ShieldAlert size={16} /><span>{anomalies} compte(s) désactivé(s) ou en attente : utilisez les filtres pour les retrouver.</span></p>}
      <div className="bloc bloc-liste">
        {liste.length === 0 && <p className="texte-doux petit">Aucun compte.</p>}
        {liste.map((x) => (
          <button key={x.id} className="ligne-user" onClick={() => { setOuvert(x.id); setMdp(null); }}>
            <Avatar user={x} taille={38} />
            <span className="ligne-user-texte"><strong>{x.prenom} {x.nom}</strong>
              <small>{x.role === 'fidele' ? 'Fidèle' : `Fidèle · ${ROLES[x.role]?.label}`} · {db.eglises.find((e) => e.id === x.eglise_id)?.nom || '—'}</small></span>
            {x.actif === false ? <span className="badge">Désactivé</span> : x.statut === 'en_attente' ? <span className="badge">En attente</span> : online && !x.auth_id ? <span className="badge">Jamais connecté</span> : null}
          </button>
        ))}
      </div>
      <Feuille ouverte={!!u} onFermer={() => setOuvert(null)} titre={u ? `${u.prenom} ${u.nom}` : ''}>
        {u && <div className="pile">
          <dl className="fiche">
            <div><dt>E-mail</dt><dd>{u.email}</dd></div>
            <div><dt>Église</dt><dd>{db.eglises.find((e) => e.id === u.eglise_id)?.nom || '—'}</dd></div>
            <div><dt>Statut</dt><dd>{u.statut === 'en_attente' ? 'En attente' : u.statut === 'refuse' ? 'Refusé' : 'Validé'}{u.auth_id || !online ? '' : ' · jamais connecté'}</dd></div>
            <div><dt>Dernière activité</dt><dd>{ilYa((db.presences || []).find((p) => p.user_id === u.id)?.vu_le)}</dd></div>
            <div><dt>Autres églises</dt><dd>{db.users.filter((x) => x.id !== u.id && u.auth_id && x.auth_id === u.auth_id).map((x) => `${db.eglises.find((e) => e.id === x.eglise_id)?.nom} (${ROLES[x.role]?.court})`).join(', ') || '—'}</dd></div>
          </dl>
          <Champ label="Responsabilité dans cette église">
            <select value={u.role} onChange={(e) => { actions.enregistrerUtilisateur({ id: u.id, role: e.target.value }); notifier('Responsabilité modifiée'); }}>
              {ROLES_EGLISE.map((r) => <option key={r} value={r}>{r === 'fidele' ? 'Fidèle (sans responsabilité)' : `Fidèle · ${ROLES[r].label}`}</option>)}
            </select>
          </Champ>
          <Interrupteur label="Compte actif" aide="Un compte désactivé ne peut plus se connecter à cette église." actif={u.actif !== false} onChange={(v) => { actions.enregistrerUtilisateur({ id: u.id, actif: v }); notifier(v ? 'Compte réactivé' : 'Compte désactivé'); }} />
          {u.auth_id && (mdp ? <p>Mot de passe temporaire : <b className="mdp-affiche">{mdp}</b><br /><small className="texte-doux">À transmettre à la personne ; elle le changera à sa prochaine connexion.</small></p>
            : <button className="btn btn-doux" onClick={async () => { const r = await actions.motDePasseTemporaire(u.id); if (r.erreur) notifier(r.erreur, 'erreur'); else setMdp(r.mdp); }}><KeyRound size={18} /> Donner un mot de passe temporaire</button>)}
        </div>}
      </Feuille>
    </div>
  );
}

// ---------- 4. Validations ----------
function Validations() {
  const { db, actions, notifier } = useApp();
  const eglises = db.eglises.filter((e) => e.statut === 'en_attente');
  const pasteurs = db.users.filter((u) => u.statut === 'en_attente' && u.role === 'pasteur');
  if (!eglises.length && !pasteurs.length) return <Vide icone="CheckCircle2" titre="Rien à valider" texte="Les inscriptions d'églises et les demandes des pasteurs apparaîtront ici." />;
  return (
    <div className="pile">
      {eglises.length > 0 && (
        <section className="bloc bloc-liste bloc-attente">
          <div className="bloc-tete"><h2>Églises à valider</h2><span className="badge">{eglises.length}</span></div>
          {eglises.map((e) => {
            const resp = db.users.find((u) => u.eglise_id === e.id && u.role === 'admin');
            return (
              <div key={e.id} className="ligne-user">
                <LogoEglise eglise={e} taille={40} />
                <span className="ligne-user-texte"><strong>{e.nom}</strong><small>{e.ville || '—'}{resp ? ` · ${resp.prenom} ${resp.nom} (${resp.email})` : ''}</small></span>
                <button className="btn-rond refuser" aria-label={`Refuser ${e.nom}`} onClick={() => { actions.validerEglise(e.id, false); notifier('Inscription refusée'); }}><X size={18} /></button>
                <button className="btn-rond accepter" aria-label={`Valider ${e.nom}`} onClick={() => { actions.validerEglise(e.id, true); notifier(`${e.nom} est validée`); }}><Check size={18} /></button>
              </div>
            );
          })}
        </section>
      )}
      {pasteurs.length > 0 && (
        <section className="bloc bloc-liste bloc-attente">
          <div className="bloc-tete"><h2>Pasteurs rejoignant une autre église</h2><span className="badge">{pasteurs.length}</span></div>
          {pasteurs.map((u) => (
            <div key={u.id} className="ligne-user">
              <Avatar user={u} taille={40} />
              <span className="ligne-user-texte"><strong>{u.prenom} {u.nom}</strong><small>Demande à rejoindre {db.eglises.find((e) => e.id === u.eglise_id)?.nom || 'une église'}</small></span>
              <button className="btn-rond refuser" aria-label={`Refuser ${u.prenom}`} onClick={() => { actions.validerMembre(u.id, false); notifier('Demande refusée'); }}><X size={18} /></button>
              <button className="btn-rond accepter" aria-label={`Accepter ${u.prenom}`} onClick={() => { actions.validerMembre(u.id, true); notifier(`${u.prenom} est désormais pasteur de cette église`); }}><Check size={18} /></button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
