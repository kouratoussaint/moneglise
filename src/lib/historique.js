// Traçabilité : chaque modification faite par un utilisateur est comparée à l'état précédent.
// On en déduit automatiquement l'action (ajout, modification, suppression, validation, clôture…),
// avec l'auteur, la date et l'heure, les anciennes et nouvelles valeurs.
// Les éléments supprimés partent dans la corbeille et peuvent être restaurés.
import { uid, fcfa } from './format';

const SUIVIES = ['conversations', 'operations', 'caisses', 'categories', 'structures', 'clotures', 'users', 'eglises', 'demandes', 'fideles', 'appartenances', 'postes', 'cotisations', 'paiements', 'activites'];
const EN_CORBEILLE = ['operations', 'caisses', 'categories', 'structures', 'fideles', 'activites', 'cotisations', 'appartenances', 'postes', 'users', 'conversations', 'demandes', 'eglises'];
const IGNORES = new Set(['modifie_le', 'modifie_par', 'cree_le', 'mdp', 'le', 'photo', 'vu_le']);

export const ACTIONS = {
  creation: 'Ajout', modification: 'Modification', suppression: 'Suppression', restauration: 'Restauration',
  validation: 'Validation', refus: 'Refus', cloture: 'Clôture', reouverture: 'Réouverture', import: 'Import Excel',
  annulation_import: 'Import annulé', demande_reouverture: 'Demande de réouverture', changement_role: 'Changement de rôle',
  archivage: 'Archivage', contre_passation: 'Contre-passation', connexion: 'Connexion', annulation: 'Annulation',
};
export const TABLES_LIBELLES = {
  conversations: 'Discussion', operations: 'Opération', caisses: 'Caisse', categories: 'Catégorie', structures: 'Structure', clotures: 'Clôture',
  users: 'Utilisateur', eglises: 'Église', demandes: 'Demande', fideles: 'Fidèle', appartenances: 'Appartenance', postes: 'Poste du bureau', cotisations: 'Cotisation', paiements: 'Paiement de cotisation', activites: 'Activité',
};

const court = (v) => {
  if (typeof v === 'string' && v.startsWith('data:image')) return '[image]';
  if (v && typeof v === 'object') return Array.isArray(v) ? `[${v.length} élément(s)]` : '{…}';
  return v;
};

export function libelleObjet(db, table, o) {
  switch (table) {
    case 'operations': return `${o.libelle} (${o.type === 'depense' ? '−' : '+'}${fcfa(o.montant)})`;
    case 'users': return `${o.prenom || ''} ${o.nom || ''}`.trim() || o.email;
    case 'clotures': return `${db.caisses.find((c) => c.id === o.caisse_id)?.nom || 'Caisse'} · ${o.mois}`;
    case 'demandes': return `Réouverture ${o.mois} · ${db.caisses.find((c) => c.id === o.caisse_id)?.nom || ''}`;
    case 'fideles': return `${o.prenom || ''} ${o.nom || ''}`.trim();
    case 'appartenances': { const f = (db.fideles || []).find((x) => x.id === o.fidele_id); const s = (db.structures || []).find((x) => x.id === o.structure_id); return `${f ? `${f.prenom} ${f.nom || ''}`.trim() : 'Fidèle'} · ${s?.nom || 'structure'}`; }
    case 'postes': { const f = (db.fideles || []).find((x) => x.id === o.fidele_id); const s = (db.structures || []).find((x) => x.id === o.structure_id); return `${o.intitule} ${s?.nom || ''}${f ? ` : ${f.prenom} ${f.nom || ''}` : ''}`.trim(); }
    case 'activites': return o.titre;
    default: return o.nom || o.titre || o.id;
  }
}

const lienObjet = (table, o) => ({
  operations: `/operations/${o.id}`, caisses: `/caisses/${o.id}`, users: '/admin/utilisateurs', clotures: `/clotures?caisse=${o.caisse_id}`,
  eglises: '/admin/eglise', categories: '/admin/categories', structures: `/structures/${o.id}`, demandes: '/clotures', activites: `/activites/${o.id}`, fideles: `/fideles/${o.id}`, appartenances: `/structures/${o.structure_id}`, postes: `/structures/${o.structure_id}`,
}[table] || '/historique');

function actionModif(table, a, b) {
  if ((table === 'users' || table === 'eglises') && a.statut !== b.statut) {
    if (b.statut === 'actif' && a.statut === 'en_attente') return 'validation';
    if (b.statut === 'refuse') return 'refus';
  }
  if (table === 'users' && a.role !== b.role) return 'changement_role';
  if (table === 'caisses' && a.actif !== false && b.actif === false) return 'archivage';
  if (table === 'eglises' && a.statut !== b.statut && b.statut === 'suspendue') return 'archivage';
  if (table === 'demandes' && a.statut !== b.statut) return b.statut === 'acceptee' ? 'validation' : 'refus';
  if (table === 'activites' && a.statut !== b.statut && b.statut === 'annulee') return 'annulation';
  return 'modification';
}

// Compare deux états et renvoie les entrées d'historique et de corbeille à ajouter
export function tracer(avant, apres, user, egliseId, trace) {
  const le = new Date().toISOString();
  const entree = (x) => ({ id: uid('h'), user_id: user.id, le, ...x });
  const historique = [], corbeille = [];
  for (const t of SUIVIES) {
    const garder = (o) => t !== 'conversations' || o.type === 'groupe';
    const a = new Map((avant[t] || []).filter(garder).map((o) => [o.id, o]));
    const b = new Map((apres[t] || []).filter(garder).map((o) => [o.id, o]));
    const supprimes = [];
    for (const [id, o] of b) {
      const ancien = a.get(id);
      const eg = t === 'eglises' ? id : o.eglise_id || egliseId;
      if (!ancien) {
        if (!trace) historique.push(entree({ eglise_id: eg, action: t === 'clotures' ? 'cloture' : t === 'demandes' ? 'demande_reouverture' : 'creation', table: t, objet_id: id, libelle: libelleObjet(apres, t, o), lien: lienObjet(t, o) }));
        continue;
      }
      if (JSON.stringify(ancien) === JSON.stringify(o)) continue;
      const champs = [...new Set([...Object.keys(ancien), ...Object.keys(o)])].filter((k) => !IGNORES.has(k) && JSON.stringify(ancien[k]) !== JSON.stringify(o[k]));
      if (!champs.length || trace) continue;
      historique.push(entree({ eglise_id: eg, action: actionModif(t, ancien, o), table: t, objet_id: id, libelle: libelleObjet(apres, t, o), lien: lienObjet(t, o),
        avant: Object.fromEntries(champs.map((k) => [k, court(ancien[k])])), apres: Object.fromEntries(champs.map((k) => [k, court(o[k])])) }));
    }
    for (const [id, o] of a) {
      if (b.has(id)) continue;
      const eg = t === 'eglises' ? id : o.eglise_id || egliseId;
      if (!trace) historique.push(entree({ eglise_id: eg, action: t === 'clotures' ? 'reouverture' : 'suppression', table: t, objet_id: id, libelle: libelleObjet(avant, t, o), lien: t === 'clotures' ? lienObjet(t, o) : '/corbeille' }));
      if (EN_CORBEILLE.includes(t)) supprimes.push(o);
    }
    if (supprimes.length) {
      corbeille.push({ id: uid('cb'), eglise_id: supprimes[0].eglise_id || egliseId, table: t, objets: supprimes, supprime_par: user.id, le,
        libelle: supprimes.length === 1 ? libelleObjet(avant, t, supprimes[0]) : `${supprimes.length} ${TABLES_LIBELLES[t].toLowerCase()}s` });
    }
  }
  if (trace) historique.push(entree({ eglise_id: egliseId, lien: '/historique', ...trace }));
  return { historique, corbeille };
}
