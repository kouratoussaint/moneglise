import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, RotateCcw, Camera, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { MODULES } from '../registre';
import { ROLES } from '../../lib/permissions';
import { Avatar, BadgeRole, Champ, Confirmation, EnTete, Feuille, Icone, Interrupteur, LigneMenu, LogoEglise, SYMBOLE, lireImage } from '../../components/ui';
import { sonActif, activerSon, jouer } from '../../lib/son';
import { notifActives, activerNotif, demanderPermission } from '../../lib/notifications';
import { MenuPlus } from '../../components/Menu';
import { ficheDuCompte, structuresDuFidele, postesDuFidele } from '../../lib/structures';

export function Plus() {
  const { user, eglise, can, actions, online, sync } = useApp();
  const nav = useNavigate();
  const [deco, setDeco] = useState(false);
  const admin = ['admin.caisses', 'admin.categories', 'admin.utilisateurs', 'admin.droits', 'admin.eglise'].some((d) => can(d));

  return (
    <div>
      <EnTete titre="Plus" retour={false} />
      <button className="carte-profil" onClick={() => nav('/profil')}>
        <Avatar user={user} taille={52} />
        <span><strong>{user.prenom} {user.nom}</strong><small>{user.email}</small></span>
        <BadgeRole role={user.role} />
      </button>

      <MenuPlus aller={(to) => nav(to)} ouvrirEglises={() => window.dispatchEvent(new Event('e360:mes-eglises'))} deconnexion={() => setDeco(true)} />

      <Confirmation ouverte={deco} onFermer={() => setDeco(false)} titre="Se déconnecter ?" libelle="Se déconnecter" danger={!!(online && sync.attente)}
        message={online ? (sync.attente ? `${sync.attente} modification(s) n'ont pas encore été envoyées. Connectez-vous à internet avant de vous déconnecter pour ne rien perdre.` : 'Les données seront retirées de ce téléphone. Elles restent en sécurité sur le serveur.') : 'Vos données restent enregistrées sur l\'appareil.'}
        onConfirmer={async () => { await actions.deconnexion(); nav('/connexion', { replace: true }); }} />
    </div>
  );
}

export function Profil() {
  const { user, eglise, db, actions, notifier } = useApp();
  const [f, setF] = useState({ prenom: user.prenom, nom: user.nom });
  const [m, setM] = useState({ ancien: '', nouveau: '' });
  const caisses = db.caisses.filter((c) => user.caisses?.includes(c.id));
  const [son, setSon] = useState(sonActif());
  const [notif, setNotif] = useState(notifActives());
  return (
    <div className="formulaire">
      <EnTete titre="Mon profil" />
      <div className="profil-tete">
        <div className="photo-profil">
          <Avatar user={user} taille={96} />
          <label className="photo-bouton" aria-label="Changer la photo de profil"><Camera size={18} />
            <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { actions.majPhoto(await lireImage(f, 160)); notifier('Photo de profil mise à jour'); } catch { notifier('Image illisible', 'erreur'); } }} />
          </label>
        </div>
        {user.photo && <button className="lien" onClick={() => { actions.majPhoto(''); notifier('Photo retirée'); }}><Trash2 size={14} /> Retirer la photo</button>}
        <h2>{user.prenom} {user.nom}</h2>
        <p className="texte-doux">{ROLES[user.role].label}{eglise ? ` · ${eglise.nom}` : ''}</p>
        {caisses.length > 0 && <p className="texte-doux petit">Caisses gérées : {caisses.map((c) => c.nom).join(', ')}</p>}
      </div>
      <div className="pile carte-form">
        <div className="deux-col">
          <Champ label="Prénom"><input value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} /></Champ>
          <Champ label="Nom"><input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
        </div>
        <Champ label="Adresse e-mail" aide="Identifiant de connexion"><input value={user.email} disabled /></Champ>
        <button className="btn btn-primaire" onClick={() => { actions.enregistrerUtilisateur({ id: user.id, ...f }); notifier('Profil mis à jour'); }}>Enregistrer</button>
      </div>
      <MesStructuresProfil />
      <h3 className="menu-titre">Préférences</h3>
      <div className="carte-form">
        <Interrupteur label="Sons et vibrations" aide="Petits sons lors des enregistrements et des notifications" actif={son} onChange={(v) => { activerSon(v); setSon(v); if (v) jouer('succes'); }} />
        <Interrupteur label="Notifications du téléphone" aide="Nouvelles opérations des gestionnaires, rappels de clôture" actif={notif} onChange={(v) => { activerNotif(v); setNotif(v); if (v) demanderPermission(); }} />
      </div>
      <h3 className="menu-titre">Mot de passe</h3>
      <div className="pile carte-form">
        <Champ label="Mot de passe actuel"><input type="password" value={m.ancien} onChange={(e) => setM({ ...m, ancien: e.target.value })} /></Champ>
        <Champ label="Nouveau mot de passe" aide="6 caractères minimum"><input type="password" value={m.nouveau} onChange={(e) => setM({ ...m, nouveau: e.target.value })} /></Champ>
        <button className="btn btn-doux" disabled={m.nouveau.length < 6} onClick={async () => { const e = await actions.changerMotDePasse(m.ancien, m.nouveau); if (e) notifier(e, 'erreur'); else { notifier('Mot de passe modifié'); setM({ ancien: '', nouveau: '' }); } }}>Changer le mot de passe</button>
      </div>
    </div>
  );
}

export function AdminEglise() {
  const { eglise, actions, notifier, user, online, db } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ nom: eglise.nom, ville: eglise.ville || '', logo: eglise.logo || '', ...(eglise.coordonnees || {}) });
  const [reset, setReset] = useState(false);
  const p = eglise.parametres || {};
  return (
    <div className="formulaire">
      <EnTete titre="Paramètres de l'église" />
      <div className="pile carte-form">
        <div className="logo-choix">
          <LogoEglise eglise={{ logo: f.logo }} taille={72} />
          <label className="btn btn-doux"><Camera size={18} /> {f.logo ? 'Changer le logo' : 'Ajouter le logo'}
            <input type="file" accept="image/*" hidden onChange={async (e) => { const fi = e.target.files?.[0]; if (fi) setF({ ...f, logo: await lireImage(fi, 256) }); }} />
          </label>
        </div>
        <Champ label="Nom de l'église"><input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
        <Champ label="Dénomination"><input value={f.denomination || ''} onChange={(e) => setF({ ...f, denomination: e.target.value })} /></Champ>
        <div className="deux-col">
          <Champ label="Ville"><input value={f.ville} onChange={(e) => setF({ ...f, ville: e.target.value })} /></Champ>
          <Champ label="Téléphone"><input inputMode="tel" value={f.telephone || ''} onChange={(e) => setF({ ...f, telephone: e.target.value })} /></Champ>
        </div>
        <Champ label="Adresse"><input value={f.adresse || ''} onChange={(e) => setF({ ...f, adresse: e.target.value })} /></Champ>
        <Champ label="E-mail"><input type="email" value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></Champ>
        <button className="btn btn-primaire" disabled={!f.nom.trim()} onClick={() => { actions.majEglise({ nom: f.nom.trim(), ville: f.ville, logo: f.logo, coordonnees: { adresse: f.adresse || '', telephone: f.telephone || '', email: f.email || '', denomination: f.denomination || '' } }); notifier('Paramètres enregistrés'); }}>Enregistrer</button>
      </div>
      <div className="menu">
        <LigneMenu icone="Settings2" titre="Relancer l'assistant de configuration" texte="Structures, caisses, catégories, règles, équipe" onClick={() => nav('/configuration')} />
        <LigneMenu icone="Network" titre="Structures" texte={`${(db.structures || []).filter((x) => x.eglise_id === eglise.id).length} structure(s)`} couleur="#7A4FD6" onClick={() => nav('/configuration')} />
      </div>
      <h3 className="menu-titre">Contrôle des opérations</h3>
      <div className="carte-form">
        <Interrupteur label="Validation des opérations par le pasteur" aide="Les saisies restent « à valider » jusqu'à la validation. Une opération validée ne se supprime plus : elle s'annule par contre-passation." actif={!!p.validation_pasteur} onChange={(v) => actions.majParametres({ validation_pasteur: v })} />
        <Champ label="Réouverture d'un mois clôturé possible pendant" aide="Au-delà, seul l’administrateur de l’application peut rouvrir.">
          <select value={p.delai_reouverture ?? 3} onChange={(e) => actions.majParametres({ delai_reouverture: Number(e.target.value) })}>
            {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n} mois après la clôture</option>)}
          </select>
        </Champ>
      </div>
      <h3 className="menu-titre">Ce que voient les fidèles</h3>
      <div className="carte-form">
        <Interrupteur label="Uniquement les mois clôturés" aide="Les totaux du mois en cours restent masqués jusqu'à la clôture." actif={!!p.fideles_mois_clotures} onChange={(v) => actions.majParametres({ fideles_mois_clotures: v })} />
        <p className="texte-doux petit">Les caisses visibles se choisissent dans Caisses. Les autres réglages (graphiques, détail) sont dans Droits d'accès.</p>
      </div>
      {!online && (user.role === 'super_admin' || user.role === 'admin') ? (
        <>
          <h3 className="menu-titre">Données de démonstration</h3>
          <div className="carte-form">
            <p className="texte-doux petit">Remet l'application dans son état de départ avec les données d'exemple. Toutes les saisies seront effacées.</p>
            <button className="btn btn-danger-doux" onClick={() => setReset(true)}><RotateCcw size={18} /> Réinitialiser la démo</button>
          </div>
        </>
      ) : null}
      <Confirmation ouverte={reset} onFermer={() => setReset(false)} danger titre="Réinitialiser toutes les données ?" message="Cette action efface toutes les saisies de l'appareil et recharge les données d'exemple." libelle="Réinitialiser"
        onConfirmer={async () => { await actions.reinitialiserDemo(); notifier('Démo réinitialisée'); }} />
    </div>
  );
}

// Tout responsable est aussi un fidèle : ses structures, ses postes et ses demandes d'adhésion
function MesStructuresProfil() {
  const { db, user, egliseId, actions, notifier } = useApp();
  const nav = useNavigate();
  const [choix, setChoix] = useState(false);
  const fiche = ficheDuCompte(db, user.id);
  if (!fiche || user.role === 'super_admin') return null;
  const mes = structuresDuFidele(db, fiche.id);
  const postes = postesDuFidele(db, fiche.id);
  const demandes = (db.appartenances || []).filter((a) => a.fidele_id === fiche.id && a.statut === 'en_attente');
  const autres = (db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false && !mes.some((m) => m.id === s.id) && !demandes.some((d) => d.structure_id === s.id));
  return (
    <>
      <h3 className="menu-titre">Mes structures</h3>
      <div className="menu">
        {mes.map((s) => <LigneMenu key={s.id} icone="Network" titre={s.nom} texte={postes.filter((p) => p.structure_id === s.id).map((p) => p.intitule).join(', ') || 'Membre'} couleur="#7A4FD6" onClick={() => nav(`/structures/${s.id}`)} />)}
        {demandes.map((d) => <LigneMenu key={d.id} icone="Hourglass" titre={(db.structures || []).find((s) => s.id === d.structure_id)?.nom} texte="Demande en attente · touchez pour l'annuler" couleur="#C98A06" onClick={() => { actions.retirerAppartenances([d.id]); notifier('Demande annulée', 'ok', 'tic'); }} />)}
        {mes.length === 0 && demandes.length === 0 && <p className="texte-doux petit menu-vide">Vous n'appartenez à aucune structure.</p>}
        <LigneMenu icone="UserPlus" titre="Rejoindre une structure" texte="Le président de la structure validera" couleur="#0E9F6E" onClick={() => setChoix(true)} />
        <LigneMenu icone="IdCard" titre="Ma fiche de fidèle" texte="Téléphone, adresse, informations" couleur="#1F5FD6" onClick={() => nav(`/fideles/${fiche.id}`)} />
      </div>
      {choix && (
        <Feuille ouverte onFermer={() => setChoix(false)} titre="Rejoindre une structure">
          {autres.length === 0 ? <p className="texte-doux">Vous faites déjà partie de toutes les structures, ou vos demandes sont en cours.</p> : (
            <div className="liste-choix">{autres.map((s) => <button key={s.id} onClick={() => { const r = actions.demanderStructure(s.id); if (typeof r === 'string') notifier(r, 'erreur'); else notifier(`Demande envoyée à ${s.nom}`, 'ok', 'succes', { annuler: () => actions.retirerAppartenances([r.id]) }); setChoix(false); }}>{s.nom}</button>)}</div>
          )}
        </Feuille>
      )}
    </>
  );
}
