// Rôles et droits d'accès. Chaque église possède sa propre matrice, modifiable par son administrateur.
export const ROLES = {
  super_admin: { label: 'Administrateur de l\'application', court: 'Admin. appli', couleur: '#0B2A66' },
  admin: { label: 'Administrateur', court: 'Admin', couleur: '#1F5FD6' },
  pasteur: { label: 'Pasteur', court: 'Pasteur', couleur: '#7A4FD6' },
  gestionnaire: { label: 'Gestionnaire financier', court: 'Gestionnaire', couleur: '#C98A06' },
  fidele: { label: 'Fidèle', court: 'Fidèle', couleur: '#0E9F6E' },
};
export const ROLES_EGLISE = ['admin', 'pasteur', 'gestionnaire', 'fidele'];

// Droits regroupés par domaine : la structure permet d'ajouter facilement les futurs modules
export const DROITS = [
  {
    groupe: 'Finances — consultation',
    items: [
      { cle: 'fin.voir_totaux', label: 'Voir les soldes et totaux des caisses' },
      { cle: 'fin.voir_details', label: 'Voir le détail des opérations' },
      { cle: 'fin.voir_graphiques', label: 'Voir les graphiques' },
      { cle: 'fin.rapports', label: 'Consulter les rapports' },
      { cle: 'fin.exporter', label: 'Exporter, imprimer et partager' },
    ],
  },
  {
    groupe: 'Finances — gestion',
    items: [
      { cle: 'fin.saisir', label: 'Saisir des recettes et dépenses (caisses attribuées)' },
      { cle: 'fin.saisir_toutes', label: 'Saisir dans toutes les caisses' },
      { cle: 'fin.modifier', label: 'Modifier une opération' },
      { cle: 'fin.supprimer', label: 'Supprimer une opération' },
      { cle: 'fin.transferer', label: 'Faire des transferts entre caisses' },
      { cle: 'fin.cloturer', label: 'Clôturer un mois' },
      { cle: 'fin.rouvrir', label: 'Rouvrir un mois clôturé' },
      { cle: 'fin.valider', label: 'Valider les opérations (si la validation est activée)' },
    ],
  },
  {
    groupe: 'Accueil et structures',
    items: [
      { cle: 'acc.toutes_structures', label: 'Voir les données de toutes les structures (accueil, activités)' },
    ],
  },
  {
    groupe: 'Messagerie',
    items: [
      { cle: 'msg.utiliser', label: 'Utiliser la messagerie (discussion de l\'église)' },
      { cle: 'msg.prive', label: 'Envoyer des messages privés' },
      { cle: 'msg.groupes', label: 'Créer des groupes de discussion' },
      { cle: 'msg.annonces', label: 'Publier des annonces' },
    ],
  },
  {
    groupe: 'Notifications reçues',
    items: [
      { cle: 'notif.eglises', label: 'Inscriptions et validations d\'églises' },
      { cle: 'notif.adhesions', label: 'Demandes et validations d\'adhésion' },
      { cle: 'notif.membres', label: 'Membres : ajouts, rôles, modifications' },
      { cle: 'notif.operations', label: 'Nouvelles recettes et dépenses' },
      { cle: 'notif.modifications', label: 'Modifications, suppressions et restaurations d\'opérations' },
      { cle: 'notif.imports', label: 'Imports Excel' },
      { cle: 'notif.clotures', label: 'Clôtures, réouvertures et demandes' },
      { cle: 'notif.configuration', label: 'Caisses, catégories, droits et paramètres' },
      { cle: 'notif.messages', label: 'Messages privés et groupes' },
      { cle: 'notif.annonces', label: 'Annonces de l\'église' },
      { cle: 'notif.activites', label: 'Activités : nouvelles, modifiées, annulées, rappels' },
    ],
  },
  {
    groupe: 'Administration',
    items: [
      { cle: 'admin.caisses', label: 'Gérer les caisses' },
      { cle: 'admin.categories', label: 'Gérer les catégories' },
      { cle: 'admin.utilisateurs', label: 'Gérer les utilisateurs et rôles' },
      { cle: 'admin.droits', label: 'Configurer les droits d\'accès' },
      { cle: 'admin.eglise', label: 'Paramètres de l\'église' },
    ],
  },
];
export const TOUS_DROITS = DROITS.flatMap((g) => g.items.map((i) => i.cle));

const tout = (v) => Object.fromEntries(TOUS_DROITS.map((k) => [k, v]));
const avec = (cles) => ({ ...tout(false), ...Object.fromEntries(cles.map((k) => [k, true])) });

const MSG = ['msg.utiliser', 'msg.prive', 'notif.messages', 'notif.annonces', 'notif.activites'];
const NOTIF_TOUT = ['notif.eglises', 'notif.adhesions', 'notif.membres', 'notif.operations', 'notif.modifications', 'notif.imports', 'notif.clotures', 'notif.configuration'];
const NOTIF_GESTION = ['notif.operations', 'notif.modifications', 'notif.imports', 'notif.clotures'];
export const MATRICE_DEFAUT = {
  admin: avec([...MSG, ...NOTIF_TOUT, 'msg.groupes', 'msg.annonces', 'fin.voir_totaux', 'fin.voir_details', 'fin.voir_graphiques', 'fin.rapports', 'fin.exporter', 'fin.cloturer', 'fin.rouvrir',
    'admin.caisses', 'admin.categories', 'admin.utilisateurs', 'admin.droits', 'admin.eglise']),
  pasteur: avec([...MSG, ...NOTIF_TOUT, 'acc.toutes_structures', 'fin.valider', 'fin.rouvrir', 'msg.groupes', 'msg.annonces', 'fin.voir_totaux', 'fin.voir_details', 'fin.voir_graphiques', 'fin.rapports', 'fin.exporter']),
  gestionnaire: avec([...MSG, ...NOTIF_GESTION, 'msg.groupes', 'fin.voir_totaux', 'fin.voir_details', 'fin.voir_graphiques', 'fin.rapports', 'fin.exporter',
    'fin.saisir', 'fin.modifier', 'fin.supprimer', 'fin.transferer', 'fin.cloturer']),
  fidele: avec([...MSG, 'fin.voir_totaux', 'fin.voir_graphiques']),
};

// can(user, 'fin.saisir', caisseId?) : vérifie le droit, et pour la saisie l'attribution de la caisse
const CONFIG = ['admin.eglise', 'admin.caisses', 'admin.categories', 'admin.utilisateurs'];

import { droitCaisseStructure } from './structures';

export function makeCan(user, eglise, db) {
  return (cle, caisseId) => {
    if (!user) return false;
    // Caisse d'une structure : le poste occupé dans son bureau donne les droits sur cette caisse
    const caisse = caisseId && db?.caisses?.find((c) => c.id === caisseId);
    if (caisse?.structure_id && user.role !== 'super_admin' && droitCaisseStructure(db, user, caisse, cle)) return true;
    if (user.role === 'super_admin') return true; // le administrateur de l’application a tous les droits
    // Les pasteurs configurent l'église au même titre que l'administrateur
    if (user.role === 'pasteur' && CONFIG.includes(cle)) return true;
    // Les droits absents d'une ancienne matrice prennent leur valeur par défaut
    const base = eglise?.droits || MATRICE_DEFAUT;
    const matrice = { ...base, [user.role]: { ...MATRICE_DEFAUT[user.role], ...base[user.role] } };
    // Les responsables sont aussi des membres : ils ont au minimum les droits d'un fidèle
    const fidele = { ...MATRICE_DEFAUT.fidele, ...(base.fidele || {}) };
    const ok = !!matrice[user.role]?.[cle] || (user.role !== 'fidele' && !!fidele[cle]);
    if (!ok && !(cle === 'fin.saisir' && matrice[user.role]?.['fin.saisir_toutes'])) return false;
    const ecriture = ['fin.saisir', 'fin.modifier', 'fin.supprimer', 'fin.transferer', 'fin.cloturer'];
    // L'attribution des caisses ne concerne que les gestionnaires ; les autres rôles agissent sur toute l'église
    if (caisseId && ecriture.includes(cle) && user.role === 'gestionnaire') {
      if (matrice[user.role]?.['fin.saisir_toutes']) return true;
      return (user.caisses || []).includes(caisseId);
    }
    return true;
  };
}
