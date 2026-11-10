import { ymOf } from './format';

export const SIGNE = { recette: 1, depense: -1 };

export const opsEglise = (db, egliseId) => db.operations.filter((o) => o.eglise_id === egliseId);
export const caissesEglise = (db, egliseId, inclureInactives = false) =>
  db.caisses.filter((c) => c.eglise_id === egliseId && (inclureInactives || c.actif !== false)).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

export const soldeCaisse = (db, caisseId, jusqua) =>
  db.operations
    .filter((o) => o.caisse_id === caisseId && (!jusqua || o.date <= jusqua))
    .reduce((s, o) => s + SIGNE[o.type] * o.montant, 0);

export const totaux = (ops, { sansTransferts = false } = {}) => {
  let recettes = 0, depenses = 0;
  for (const o of ops) {
    if (sansTransferts && o.transfert_id) continue;
    if (o.type === 'recette') recettes += o.montant; else depenses += o.montant;
  }
  return { recettes, depenses, solde: recettes - depenses };
};

export const parMois = (ops, mois, opts) => mois.map((ym) => ({ ym, ...totaux(ops.filter((o) => ymOf(o.date) === ym), opts) }));

export const parCategorie = (db, ops, type) => {
  const map = new Map();
  for (const o of ops) {
    if (o.type !== type || o.transfert_id) continue;
    map.set(o.categorie_id, (map.get(o.categorie_id) || 0) + o.montant);
  }
  return [...map.entries()]
    .map(([id, total]) => ({ categorie: db.categories.find((c) => c.id === id), total }))
    .sort((a, b) => b.total - a.total);
};

export const clotureDe = (db, caisseId, ym) => db.clotures.find((c) => c.caisse_id === caisseId && c.mois === ym);
export const estVerrouille = (db, caisseId, dateIso) => !!clotureDe(db, caisseId, ymOf(dateIso));

// Résumé d'un mois pour une caisse (base des clôtures et rapports)
export const resumeMois = (db, caisseId, ym) => {
  const ops = db.operations.filter((o) => o.caisse_id === caisseId && ymOf(o.date) === ym);
  const t = totaux(ops);
  const ouverture = db.operations
    .filter((o) => o.caisse_id === caisseId && o.date < `${ym}-01`)
    .reduce((s, o) => s + SIGNE[o.type] * o.montant, 0);
  return { ym, ouverture, ...t, cloture: ouverture + t.solde, nb: ops.length };
};

// Mois "visibles" pour les fidèles si l'église limite l'affichage aux mois clôturés
export const moisVisibleFidele = (db, eglise, caisseId, ym) => !eglise?.parametres?.fideles_mois_clotures || !!clotureDe(db, caisseId, ym);

// Une opération est « validée » quand son mois est clôturé, ou quand le pasteur l'a validée
export const estValidee = (db, o) => o.statut === 'validee' || estVerrouille(db, o.caisse_id, o.date);

// Réouverture : délai réglable par l'administrateur (3 mois par défaut) ; au-delà, seul le administrateur de l’application peut rouvrir
export function reouverturePossible(eglise, cloture, estSuper) {
  if (estSuper) return true;
  const delai = Number(eglise?.parametres?.delai_reouverture ?? 3);
  if (!cloture?.le) return true;
  const limite = new Date(cloture.le); limite.setMonth(limite.getMonth() + delai);
  return new Date() <= limite;
}
