// Institutions financières : comptes de l'église ou d'une structure dans une banque ou une microfinance (ex. MICRO AID).
// Un compte n'est pas une caisse : il a ses propres mouvements. Un versement fait sortir l'argent d'une caisse
// vers le compte, un retrait le fait revenir en caisse ; ni l'un ni l'autre n'est une recette ou une dépense.
import { ficheDuCompte, postesStructure } from './structures';

export const TYPES_COMPTE = { banque: 'Banque', microfinance: 'Microfinance' };

// sens : +1 entrée sur le compte, -1 sortie, 0 sans effet sur le solde ; caisse : mouvement lié à une caisse
export const TYPES_MOUVEMENT = {
  versement: { l: 'Versement', aide: 'Espèces d\'une caisse déposées sur le compte', sens: 1, caisse: 'depense' },
  retrait: { l: 'Retrait', aide: 'Argent retiré du compte et remis dans une caisse', sens: -1, caisse: 'recette' },
  virement_recu: { l: 'Virement reçu', aide: 'Don, subvention ou remboursement versé directement sur le compte', sens: 1 },
  paiement: { l: 'Paiement par le compte', aide: 'Chèque ou virement émis pour régler une dépense', sens: -1 },
  interets: { l: 'Intérêts', aide: 'Intérêts ou rémunération de l\'épargne', sens: 1 },
  frais: { l: 'Frais et agios', aide: 'Frais de tenue de compte, commissions, agios', sens: -1 },
  releve: { l: 'Relevé (contrôle du solde)', aide: 'Solde indiqué sur le relevé de l\'institution à cette date', sens: 0 },
};

export const comptesEglise = (db, eid, inclureInactifs = false) => (db.comptes || [])
  .filter((c) => c.eglise_id === eid && (inclureInactifs || c.actif !== false))
  .sort((a, b) => (a.structure_id ? 1 : 0) - (b.structure_id ? 1 : 0) || (a.institution || '').localeCompare(b.institution || '', 'fr'));

export const mouvementsDe = (db, cid) => (db.mouvements || []).filter((m) => m.compte_id === cid).sort((a, b) => b.date.localeCompare(a.date) || (b.cree_le || '').localeCompare(a.cree_le || ''));

export const signe = (m) => TYPES_MOUVEMENT[m.type]?.sens || 0;
export function soldeCompte(db, compte, jusqua) {
  return (Number(compte.solde_initial) || 0) + (db.mouvements || [])
    .filter((m) => m.compte_id === compte.id && (!jusqua || m.date <= jusqua))
    .reduce((s, m) => s + signe(m) * (Number(m.montant) || 0), 0);
}

// Rapprochement : dernier relevé saisi comparé au solde calculé à la même date
export function rapprochement(db, compte) {
  const r = mouvementsDe(db, compte.id).find((m) => m.type === 'releve');
  if (!r) return null;
  const calcule = soldeCompte(db, compte, r.date);
  return { releve: r, calcule, ecart: (Number(r.montant) || 0) - calcule };
}

// Totaux d'une période (pour les rapports) : entrées, sorties, par type
export function totauxCompte(db, compte, debut, fin) {
  const ms = (db.mouvements || []).filter((m) => m.compte_id === compte.id && m.date >= debut && m.date <= fin);
  const parType = Object.fromEntries(Object.keys(TYPES_MOUVEMENT).map((t) => [t, ms.filter((m) => m.type === t).reduce((s, m) => s + (Number(m.montant) || 0), 0)]));
  const veille = new Date(`${debut}T00:00:00`); veille.setDate(veille.getDate() - 1);
  const ouverture = soldeCompte(db, compte, veille.toISOString().slice(0, 10));
  const entrees = ms.filter((m) => signe(m) > 0).reduce((s, m) => s + Number(m.montant), 0);
  const sorties = ms.filter((m) => signe(m) < 0).reduce((s, m) => s + Number(m.montant), 0);
  return { ouverture, entrees, sorties, cloture: ouverture + entrees - sorties, parType, nb: ms.length };
}

// ---------- Droits ----------
// Ouvrir et paramétrer les comptes : droit « inst.gerer » (administrateur), ou le bureau de la structure (poste « saisir »)
export function peutGererComptes(db, user, can, structureId) {
  if (!user) return false;
  if (user.role === 'super_admin' || can('inst.gerer')) return true;
  return !!structureId && posteAvec(db, user, structureId, 'saisir');
}
const posteAvec = (db, user, sid, cle) => {
  const f = ficheDuCompte(db, user?.id);
  return !!f && postesStructure(db, sid).some((p) => p.fidele_id === f.id && p.droits?.[cle]);
};
// Saisir les mouvements : administrateur, caissiers désignés sur le compte, trésorier de la structure
export function peutSaisirCompte(db, user, can, compte) {
  if (!user || !compte) return false;
  if (user.role === 'super_admin' || can('inst.gerer')) return true;
  if (can('inst.saisir') && (compte.responsables || []).includes(user.id)) return true;
  return !!compte.structure_id && posteAvec(db, user, compte.structure_id, 'saisir');
}
export function peutVoirCompte(db, user, can, compte) {
  if (!user || !compte) return false;
  if (user.role === 'super_admin' || can('inst.voir') || peutSaisirCompte(db, user, can, compte)) return true;
  return !!compte.structure_id && posteAvec(db, user, compte.structure_id, 'voir_details');
}
// Validation d'un mouvement (si l'église a activé la validation) : pasteur, ou poste « valider » de la structure
export const peutValiderCompte = (db, user, can, compte) => user?.role === 'super_admin' || can('fin.valider') || (!!compte?.structure_id && posteAvec(db, user, compte.structure_id, 'valider'));

export const comptesVisibles = (db, user, can, eid) => comptesEglise(db, eid).filter((c) => peutVoirCompte(db, user, can, c));
export const nomCompte = (c) => (c ? `${c.institution}${c.intitule ? ` · ${c.intitule}` : ''}` : '—');
// Numéro partiellement masqué dans les listes
export const numeroMasque = (n = '') => (n.length > 6 ? `•••• ${n.slice(-4)}` : n);
