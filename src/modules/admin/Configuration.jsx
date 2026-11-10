import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Plus, X, Check, ChevronLeft, ChevronRight, Church, Network, Wallet, Tags, Scale, Users, PartyPopper } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { caissesEglise } from '../../lib/finance';
import { MATRICE_DEFAUT, ROLES } from '../../lib/permissions';
import { STRUCTURES_MODELE } from '../../data/seed';
import { uid } from '../../lib/format';
import { Champ, Interrupteur, LogoEglise, PastilleCaisse, Segmente, lireImage } from '../../components/ui';
import { COULEURS } from '../../components/EditeurCaisse';

const ETAPES = [
  { t: 'Identité', icone: Church, aide: 'Le nom, le logo et les coordonnées de votre église.' },
  { t: 'Structures', icone: Network, aide: 'Les groupes qui composent votre église.' },
  { t: 'Caisses', icone: Wallet, aide: 'Les caisses dans lesquelles l\'argent est suivi.' },
  { t: 'Catégories', icone: Tags, aide: 'Les types de recettes et de dépenses de chaque caisse.' },
  { t: 'Règles', icone: Scale, aide: 'Le fonctionnement de l\'église dans l\'application.' },
  { t: 'Équipe', icone: Users, aide: 'Les responsables à inviter dès maintenant.' },
];
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const ICONES_CAISSE = ['Church', 'Users', 'HardHat', 'HandHeart', 'Wallet', 'PiggyBank', 'Music', 'BookOpen', 'Heart', 'Gift'];

export default function Configuration() {
  const { db, eglise, egliseId, actions, notifier, user, can } = useApp();
  const nav = useNavigate();
  const [etape, setEtape] = useState(0);
  const d0 = eglise.droits || MATRICE_DEFAUT;
  const dr = (r, k) => ({ ...MATRICE_DEFAUT[r], ...(d0[r] || {}) })[k];

  const [id, setId] = useState({ nom: eglise.nom || '', ville: eglise.ville || '', logo: eglise.logo || '', ...(eglise.coordonnees || {}) });
  const [structures, setStructures] = useState(() => {
    const ex = (db.structures || []).filter((s) => s.eglise_id === egliseId);
    return ex.length ? ex : STRUCTURES_MODELE.map((s, i) => ({ id: `${egliseId}_str_${i}`, ...s, actif: true }));
  });
  // L'assistant gère les caisses de l'église ; celles des structures se gèrent dans chaque structure
  const [caisses, setCaisses] = useState(() => caissesEglise(db, egliseId).filter((c) => !c.structure_id).map((c) => ({ ...c })));
  const [cats, setCats] = useState(() => db.categories.filter((c) => c.eglise_id === egliseId && !c.systeme));
  const [catCaisse, setCatCaisse] = useState(caisses[0]?.id);
  const [catType, setCatType] = useState('recette');
  const [regles, setRegles] = useState({
    cultes: eglise.parametres?.cultes || ['mardi', 'vendredi', 'dimanche'],
    fideles_mois_clotures: !!eglise.parametres?.fideles_mois_clotures,
    fideles_graphiques: dr('fidele', 'fin.voir_graphiques'),
    fideles_prive: dr('fidele', 'msg.prive'),
    gestionnaires_groupes: dr('gestionnaire', 'msg.groupes'),
    admin_saisie: !!dr('admin', 'fin.saisir_toutes'),
    gestionnaire_supprime: dr('gestionnaire', 'fin.supprimer'),
  });
  const [membres, setMembres] = useState([]);
  const [nouveau, setNouveau] = useState({ prenom: '', nom: '', email: '', role: 'pasteur', caisses: [] });
  const [saisie, setSaisie] = useState({ structure: '', caisse: '', cat: '' });

  const catsAffichees = useMemo(() => cats.filter((c) => c.caisse_id === catCaisse && c.type === catType), [cats, catCaisse, catType]);

  const terminer = () => {
    actions.enregistrerConfiguration({
      eglise: { nom: id.nom.trim() || eglise.nom, ville: id.ville, logo: id.logo, coordonnees: { adresse: id.adresse || '', telephone: id.telephone || '', email: id.email || '', denomination: id.denomination || '' }, configuree: true },
      structures,
      caisses,
      categories: cats,
      parametres: { cultes: regles.cultes, fideles_mois_clotures: regles.fideles_mois_clotures },
      droits: !can('admin.droits') ? undefined : {
        fidele: { 'fin.voir_graphiques': regles.fideles_graphiques, 'msg.prive': regles.fideles_prive },
        gestionnaire: { 'msg.groupes': regles.gestionnaires_groupes, 'fin.supprimer': regles.gestionnaire_supprime },
        admin: { 'fin.saisir_toutes': regles.admin_saisie },
      },
      membres,
    });
    notifier('Configuration enregistrée');
    nav('/', { replace: true });
  };

  const E = ETAPES[etape];
  const peutSuivre = etape !== 0 || id.nom.trim();

  return (
    <div className="assistant">
      <header className="entete">
        <button className="btn-icone" aria-label="Quitter l'assistant" onClick={() => nav(-1)}><X size={22} /></button>
        <div className="entete-titres"><h1>Configuration</h1><p>Étape {etape + 1} sur {ETAPES.length} · {E.t}</p></div>
      </header>
      <div className="assistant-progres">{ETAPES.map((x, i) => <button key={x.t} className={i < etape ? 'fait' : i === etape ? 'actif' : ''} onClick={() => i < etape && setEtape(i)} aria-label={x.t}><x.icone size={16} /></button>)}</div>
      <div className="assistant-intro"><E.icone size={22} /><span><strong>{E.t}</strong><small>{E.aide}</small></span></div>

      {etape === 0 && (
        <div className="pile carte-form">
          <div className="logo-choix">
            <LogoEglise eglise={{ logo: id.logo }} taille={84} />
            <label className="btn btn-doux"><Camera size={18} /> {id.logo ? 'Changer le logo' : 'Ajouter le logo'}
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setId({ ...id, logo: await lireImage(f, 256) }); }} />
            </label>
            {id.logo && <button className="lien" onClick={() => setId({ ...id, logo: '' })}>Retirer</button>}
          </div>
          <Champ label="Nom de l'église"><input value={id.nom} onChange={(e) => setId({ ...id, nom: e.target.value })} /></Champ>
          <Champ label="Dénomination" aide="Ex. Église évangélique, Assemblées de Dieu…"><input value={id.denomination || ''} onChange={(e) => setId({ ...id, denomination: e.target.value })} /></Champ>
          <div className="deux-col">
            <Champ label="Ville"><input value={id.ville} onChange={(e) => setId({ ...id, ville: e.target.value })} /></Champ>
            <Champ label="Téléphone"><input inputMode="tel" value={id.telephone || ''} onChange={(e) => setId({ ...id, telephone: e.target.value })} /></Champ>
          </div>
          <Champ label="Adresse"><input value={id.adresse || ''} onChange={(e) => setId({ ...id, adresse: e.target.value })} placeholder="Quartier, secteur, repère" /></Champ>
          <Champ label="E-mail de l'église"><input type="email" value={id.email || ''} onChange={(e) => setId({ ...id, email: e.target.value })} /></Champ>
        </div>
      )}

      {etape === 1 && (
        <div className="carte-form">
          {structures.map((s) => (
            <div key={s.id} className="ligne-config">
              <span><strong>{s.nom}</strong><small>{s.description}</small></span>
              <button className="btn-icone petit" aria-label={`Retirer ${s.nom}`} onClick={() => setStructures(structures.filter((x) => x.id !== s.id))}><X size={18} /></button>
            </div>
          ))}
          <div className="ajout-ligne">
            <input value={saisie.structure} onChange={(e) => setSaisie({ ...saisie, structure: e.target.value })} placeholder="Ajouter une structure (ex. Groupe de prière)" />
            <button className="btn btn-primaire petit" disabled={!saisie.structure.trim()} onClick={() => { setStructures([...structures, { id: uid('str'), nom: saisie.structure.trim(), description: '', actif: true }]); setSaisie({ ...saisie, structure: '' }); }}><Plus size={16} /></button>
          </div>
        </div>
      )}

      {etape === 2 && (
        <div className="carte-form">
          {caisses.map((c, i) => (
            <div key={c.id} className="ligne-config caisse">
              <PastilleCaisse caisse={c} taille={36} />
              <span className="pile-serree">
                <input className="saisie-legere" value={c.nom} onChange={(e) => setCaisses(caisses.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
                <label className="mini-case"><input type="checkbox" checked={c.visible_fideles !== false} onChange={(e) => setCaisses(caisses.map((x, j) => (j === i ? { ...x, visible_fideles: e.target.checked } : x)))} /> Visible par les fidèles</label>
              </span>
              <button className="btn-icone petit" aria-label={`Retirer ${c.nom}`} onClick={() => setCaisses(caisses.filter((x) => x.id !== c.id))}><X size={18} /></button>
            </div>
          ))}
          <div className="ajout-ligne">
            <input value={saisie.caisse} onChange={(e) => setSaisie({ ...saisie, caisse: e.target.value })} placeholder="Nouvelle caisse (ex. Caisse chorale)" />
            <button className="btn btn-primaire petit" disabled={!saisie.caisse.trim()} onClick={() => {
              const n = caisses.length;
              setCaisses([...caisses, { id: uid('c'), nom: saisie.caisse.trim(), description: '', icone: ICONES_CAISSE[n % ICONES_CAISSE.length], couleur: COULEURS[n % COULEURS.length], image: 'communaute', visible_fideles: true }]);
              setSaisie({ ...saisie, caisse: '' });
            }}><Plus size={16} /></button>
          </div>
          <p className="texte-doux petit">Une caisse retirée qui contient déjà des opérations est archivée, pas effacée.</p>
        </div>
      )}

      {etape === 3 && (
        <div className="pile">
          <Champ label="Caisse"><select value={catCaisse} onChange={(e) => setCatCaisse(e.target.value)}>{caisses.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></Champ>
          <Segmente valeur={catType} onChange={setCatType} options={[{ v: 'recette', l: 'Recettes' }, { v: 'depense', l: 'Dépenses' }]} />
          <div className="carte-form">
            <div className="puces enveloppe">
              {catsAffichees.map((c) => <span key={c.id} className="puce supprimable">{c.nom}<button aria-label={`Retirer ${c.nom}`} onClick={() => setCats(cats.filter((x) => x.id !== c.id))}><X size={14} /></button></span>)}
              {catsAffichees.length === 0 && <p className="texte-doux petit">Aucune catégorie pour l'instant. « Autre / N.P. » existe toujours.</p>}
            </div>
            <div className="ajout-ligne">
              <input value={saisie.cat} onChange={(e) => setSaisie({ ...saisie, cat: e.target.value })} placeholder={catType === 'recette' ? 'Ex. Offrandes de mariage' : 'Ex. Location de chaises'} />
              <button className="btn btn-primaire petit" disabled={!saisie.cat.trim() || !catCaisse} onClick={() => { setCats([...cats, { id: uid('cat'), caisse_id: catCaisse, type: catType, nom: saisie.cat.trim() }]); setSaisie({ ...saisie, cat: '' }); }}><Plus size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {etape === 4 && (
        <div className="pile">
          <div className="carte-form">
            <span className="champ-label">Jours de culte</span>
            <div className="puces enveloppe jours">
              {JOURS.map((j) => <button key={j} className={`puce ${regles.cultes.includes(j) ? 'active' : ''}`} onClick={() => setRegles({ ...regles, cultes: regles.cultes.includes(j) ? regles.cultes.filter((x) => x !== j) : [...regles.cultes, j] })}>{j}</button>)}
            </div>
          </div>
          <div className="carte-form">
            <span className="champ-label">Fidèles</span>
            <Interrupteur label="Voir uniquement les mois clôturés" actif={regles.fideles_mois_clotures} onChange={(v) => setRegles({ ...regles, fideles_mois_clotures: v })} />
{can('admin.droits') && <>
            <Interrupteur label="Voir les graphiques" actif={regles.fideles_graphiques} onChange={(v) => setRegles({ ...regles, fideles_graphiques: v })} />
            <Interrupteur label="Envoyer des messages privés" actif={regles.fideles_prive} onChange={(v) => setRegles({ ...regles, fideles_prive: v })} />
            </>}
            <p className="texte-doux petit">Chaque nouvelle adhésion est validée par l'administrateur.</p>
          </div>
          {can('admin.droits') ? (
          <div className="carte-form">
            <span className="champ-label">Responsables</span>
            <Interrupteur label="L'administrateur peut saisir des opérations" aide="Dans toutes les caisses" actif={regles.admin_saisie} onChange={(v) => setRegles({ ...regles, admin_saisie: v })} />
            <Interrupteur label="Les gestionnaires peuvent supprimer une opération" actif={regles.gestionnaire_supprime} onChange={(v) => setRegles({ ...regles, gestionnaire_supprime: v })} />
            <Interrupteur label="Les gestionnaires peuvent créer des groupes" actif={regles.gestionnaires_groupes} onChange={(v) => setRegles({ ...regles, gestionnaires_groupes: v })} />
            <p className="texte-doux petit">Tous les autres droits se règlent ensuite dans Droits d'accès.</p>
          </div>
          ) : (
            <p className="note">Les droits d'accès (fidèles, responsables) sont réglés par l'administrateur dans Droits d'accès.</p>
          )}
        </div>
      )}

      {etape === 5 && (
        <div className="pile">
          <div className="carte-form pile">
            <div className="deux-col">
              <Champ label="Prénom"><input value={nouveau.prenom} onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })} /></Champ>
              <Champ label="Nom"><input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} /></Champ>
            </div>
            <Champ label="Adresse e-mail"><input type="email" value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} /></Champ>
            <Champ label="Rôle"><select value={nouveau.role} onChange={(e) => setNouveau({ ...nouveau, role: e.target.value, caisses: [] })}>{['pasteur', 'gestionnaire', 'admin'].map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</select></Champ>
            {nouveau.role === 'gestionnaire' && (
              <div className="puces enveloppe">{caisses.map((c) => <button key={c.id} className={`puce ${nouveau.caisses.includes(c.id) ? 'active' : ''}`} onClick={() => setNouveau({ ...nouveau, caisses: nouveau.caisses.includes(c.id) ? nouveau.caisses.filter((x) => x !== c.id) : [...nouveau.caisses, c.id] })}>{c.nom}</button>)}</div>
            )}
            <button className="btn btn-doux" disabled={!nouveau.prenom.trim() || !nouveau.email.includes('@')} onClick={() => { setMembres([...membres, nouveau]); setNouveau({ prenom: '', nom: '', email: '', role: 'gestionnaire', caisses: [] }); }}><Plus size={16} /> Ajouter à l'équipe</button>
          </div>
          {membres.length > 0 && (
            <div className="carte-form">
              {membres.map((m, i) => (
                <div key={i} className="ligne-config">
                  <span><strong>{m.prenom} {m.nom}</strong><small>{ROLES[m.role].label} · {m.email}</small></span>
                  <button className="btn-icone petit" aria-label="Retirer" onClick={() => setMembres(membres.filter((_, j) => j !== i))}><X size={18} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="texte-doux petit">Chaque personne crée ensuite son compte avec son adresse e-mail et reçoit automatiquement son rôle.</p>
          {user.role === 'admin' && eglise.statut === 'en_attente' && <p className="note"><PartyPopper size={16} /><span>Votre église est en attente de validation par le administrateur de l’application. Votre configuration sera prête dès la validation.</span></p>}
        </div>
      )}

      <div className="barre-action">
        {etape > 0 ? <button className="btn btn-doux" onClick={() => setEtape(etape - 1)}><ChevronLeft size={18} /> Retour</button> : <button className="btn btn-doux" onClick={() => nav(-1)}>Plus tard</button>}
        {etape < ETAPES.length - 1
          ? <button className="btn btn-primaire" disabled={!peutSuivre} onClick={() => setEtape(etape + 1)}>Suivant <ChevronRight size={18} /></button>
          : <button className="btn btn-primaire" onClick={terminer}><Check size={18} /> Terminer</button>}
      </div>
    </div>
  );
}
