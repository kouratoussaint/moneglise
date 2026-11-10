// Fidèles, structures, appartenances et bureaux.
// Le rôle général (administrateur, pasteur…) est distinct du poste occupé dans une structure :
// un poste ne donne que les droits définis pour lui, dans sa structure uniquement.
export const DROITS_POSTE = [
  { cle: 'voir_details', label: 'Voir le détail des opérations de la caisse' },
  { cle: 'membres', label: 'Gérer les membres et les informations de la structure' },
  { cle: 'bureau', label: 'Gérer le bureau (postes et titulaires)' },
  { cle: 'saisir', label: 'Saisir des recettes et des dépenses dans la caisse' },
  { cle: 'valider', label: 'Valider les opérations de la caisse' },
  { cle: 'cotisations', label: 'Gérer les cotisations' },
  { cle: 'categories', label: 'Gérer les catégories de la caisse' },
  { cle: 'activites', label: 'Gérer les activités' },
];

// Droits proposés par défaut selon l'intitulé du poste (modifiables ensuite)
export function droitsParDefaut(intitule = '') {
  const t = intitule.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/adjoint/.test(t)) return { voir_details: true };
  if (/president|responsable|coordonn/.test(t)) return { voir_details: true, membres: true, bureau: true, activites: true };
  if (/secretaire/.test(t)) return { voir_details: true, membres: true, activites: true };
  if (/tresor|caiss|financ/.test(t)) return { voir_details: true, saisir: true, cotisations: true, categories: true };
  return {};
}

export const POSTES_MODELE = ['Président', 'Vice-président', 'Secrétaire général', 'Secrétaire général adjoint', 'Trésorier général', 'Trésorier général adjoint', 'Membre conseiller'];

const actif = (x) => x && x.actif !== false;
// Tous les fidèles d'une église : les fiches, plus toute personne inscrite (sauf l'administrateur de l'application)
// dont la fiche n'est pas encore arrivée sur le téléphone — tout le monde est d'abord fidèle
export const fidelesEglise = (db, eid) => {
  const fiches = (db.fideles || []).filter((f) => f.eglise_id === eid);
  const liees = new Set(fiches.map((f) => f.user_id).filter(Boolean));
  const sansFiche = (db.users || []).filter((u) => u.eglise_id === eid && u.role !== 'super_admin' && !liees.has(u.id) && !fiches.some((f) => f.id === `f_${u.id}`))
    .map((u) => ({ id: `f_${u.id}`, eglise_id: eid, prenom: u.prenom, nom: u.nom, email: u.email, user_id: u.id, date_enregistrement: (u.le || '').slice(0, 10), actif: true, _provisoire: true }));
  return [...fiches, ...sansFiche];
};
export const ficheDuCompte = (db, userId) => (db.fideles || []).find((f) => f.user_id === userId);
export const nomFidele = (f) => (f ? `${f.prenom || ''} ${f.nom || ''}`.trim() || 'Sans nom' : '—');

const validee = (a) => !a.jusqu_au && (a.statut || 'actif') === 'actif';
export const appartenancesStructure = (db, sid, toutes = false) => (db.appartenances || []).filter((a) => a.structure_id === sid && (toutes || validee(a)));
export const demandesStructure = (db, sid) => (db.appartenances || []).filter((a) => a.structure_id === sid && a.statut === 'en_attente');
export const membresStructure = (db, sid) => appartenancesStructure(db, sid).map((a) => (db.fideles || []).find((f) => f.id === a.fidele_id)).filter(Boolean);
export const postesStructure = (db, sid) => (db.postes || []).filter((p) => p.structure_id === sid && actif(p)).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));
export const structuresDuFidele = (db, fid) => (db.appartenances || []).filter((a) => a.fidele_id === fid && validee(a)).map((a) => (db.structures || []).find((s) => s.id === a.structure_id)).filter(Boolean);
export const postesDuFidele = (db, fid) => (db.postes || []).filter((p) => p.fidele_id === fid && actif(p));

// Droit d'un utilisateur dans une structure : responsables de l'église (configuration) ou poste du bureau
export function droitStructure(db, user, can, sid, cle) {
  if (!user) return false;
  if (user.role === 'super_admin' || can('admin.eglise')) return true;
  if (cle === 'voir_details' && estMembreDe(db, user, sid) && (db.structures || []).find((s) => s.id === sid)?.membres_voient_details) return true;
  if (cle === 'voir_details' && can('fin.voir_details')) return true;
  const fiche = ficheDuCompte(db, user.id);
  if (!fiche) return false;
  return postesStructure(db, sid).some((p) => p.fidele_id === fiche.id && p.droits?.[cle]);
}
export const estMembreDe = (db, user, sid) => { const f = user && ficheDuCompte(db, user.id); return !!f && appartenancesStructure(db, sid).some((a) => a.fidele_id === f.id); };

// Caisse d'une structure et catégories proposées à sa création
export const caisseDeStructure = (db, sid) => (db.caisses || []).find((c) => c.structure_id === sid && c.actif !== false);
export const CATEGORIES_STRUCTURE = {
  recette: ['Cotisations ordinaires', 'Cotisations exceptionnelles', 'Dons', 'Contributions des membres', 'Recettes des activités', 'Collectes spéciales'],
  depense: ['Transport', 'Restauration', 'Organisation d\'activités', 'Achat de matériel', 'Communication', 'Soutien aux membres'],
};
// Droit sur une caisse de structure, d'après le poste occupé (saisir, valider, voir_details, categories)
const CLE_CAISSE = { 'fin.saisir': 'saisir', 'fin.modifier': 'saisir', 'fin.supprimer': 'saisir', 'fin.transferer': 'saisir', 'fin.cloturer': 'saisir', 'fin.valider': 'valider', 'fin.voir_details': 'voir_details', 'fin.exporter': 'voir_details', 'fin.rapports': 'voir_details', 'admin.categories': 'categories' };
export function droitCaisseStructure(db, user, caisse, cle) {
  const k = CLE_CAISSE[cle];
  if (!k || !caisse?.structure_id) return false;
  const fiche = ficheDuCompte(db, user?.id);
  if (!fiche) return false;
  if (k === 'voir_details' && estMembreDe(db, user, caisse.structure_id) && (db.structures || []).find((s) => s.id === caisse.structure_id)?.membres_voient_details) return true;
  return postesStructure(db, caisse.structure_id).some((p) => p.fidele_id === fiche.id && p.droits?.[k]);
}
