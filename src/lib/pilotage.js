// Pilotage : indicateurs annuels de l'église et de ses structures
// (finances consolidées, évolution des fidèles, taux de cotisation, activités et assiduité).
// Tout est calculé à partir des données existantes : aucune table supplémentaire.
import { totaux, parMois, parCategorie } from './finance';
import { fidelesEglise, membresStructure, droitStructure, appartenancesStructure } from './structures';
import { periodes, finPeriode, fidelesConcernes, paiementsDe, situation } from './cotisations';
import { statutActivite } from './activites';
import { today } from './format';

export const moisDeLAnnee = (annee) => Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}`);
const finAnnee = (annee) => `${annee}-12-31`;
// Arrêt des calculs : fin d'année, ou aujourd'hui pour l'année en cours
export const arret = (annee) => { const t = today(); return finAnnee(annee) < t ? finAnnee(annee) : t; };

// Périmètres consultables : l'église entière (responsables qui voient les rapports financiers)
// et chaque structure dont on fait partie du bureau ou que l'on voit en entier
export function perimetres(db, user, can, egliseId) {
  if (!db || !user || !egliseId) return [];
  const general = user.role === 'super_admin' || (can('fin.rapports') && can('fin.voir_details'));
  const toutes = general || can('acc.toutes_structures');
  const out = [];
  if (general) out.push({ id: 'eglise', nom: "Toute l'église", eglise: true });
  for (const s of (db.structures || []).filter((x) => x.eglise_id === egliseId && x.actif !== false).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
    if (toutes || ['voir_details', 'membres', 'activites', 'cotisations'].some((k) => droitStructure(db, user, can, s.id, k))) out.push({ id: s.id, nom: s.nom, structure: s });
  }
  return out;
}

// ---------- Finances ----------
export function finances(db, ops, caisses, annee) {
  const mois = moisDeLAnnee(annee);
  const d1 = `${annee}-01-01`, d2 = finAnnee(annee);
  const ids = new Set(caisses.map((c) => c.id));
  const dans = ops.filter((o) => ids.has(o.caisse_id) && o.date >= d1 && o.date <= d2);
  const parCaisse = caisses.map((c) => {
    const ouverture = totaux(ops.filter((o) => o.caisse_id === c.id && o.date < d1)).solde;
    const t = totaux(dans.filter((o) => o.caisse_id === c.id));
    return { c, ouverture, ...t, cloture: ouverture + t.solde };
  });
  // Les transferts entre caisses s'annulent dans le consolidé : ils ne sont comptés ni en recette ni en dépense
  const consolide = caisses.length > 1;
  return {
    parCaisse,
    t: totaux(dans, { sansTransferts: consolide }),
    mois: parMois(dans, mois, { sansTransferts: consolide }),
    rec: parCategorie(db, dans, 'recette'),
    dep: parCategorie(db, dans, 'depense'),
    ouverture: parCaisse.reduce((s, x) => s + x.ouverture, 0),
    cloture: parCaisse.reduce((s, x) => s + x.cloture, 0),
    nb: dans.length,
  };
}

// ---------- Fidèles ----------
const fin = (ym) => { const [a, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`; };
export function fideles(db, egliseId, structureId, annee) {
  const mois = moisDeLAnnee(annee);
  const limite = arret(annee);
  if (structureId) {
    // Membres d'une structure : entrées (depuis) et sorties (jusqu'au)
    const app = appartenancesStructure(db, structureId, true).filter((a) => !['refuse', 'en_attente'].includes(a.statut));
    const present = (a, j) => (!a.depuis || a.depuis <= j) && (!a.jusqu_au || a.jusqu_au > j);
    const courbe = mois.filter((m) => `${m}-01` <= limite).map((ym) => ({ ym, n: app.filter((a) => present(a, fin(ym) < limite ? fin(ym) : limite)).length }));
    return {
      total: membresStructure(db, structureId).length,
      debut: app.filter((a) => present(a, `${annee - 1}-12-31`)).length,
      entrees: app.filter((a) => a.depuis && a.depuis.startsWith(String(annee))).length,
      sorties: app.filter((a) => a.jusqu_au && a.jusqu_au.startsWith(String(annee))).length,
      courbe,
      repartition: repartitionSexe(membresStructure(db, structureId)),
    };
  }
  const tous = fidelesEglise(db, egliseId);
  const actifs = tous.filter((f) => f.actif !== false);
  const date = (f) => f.date_enregistrement || '';
  const courbe = mois.filter((m) => `${m}-01` <= limite).map((ym) => ({ ym, n: actifs.filter((f) => !date(f) || date(f) <= fin(ym)).length }));
  const structures = (db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false)
    .map((s) => ({ s, n: membresStructure(db, s.id).length })).sort((a, b) => b.n - a.n);
  const dansUne = new Set((db.appartenances || []).filter((a) => !a.jusqu_au && (a.statut || 'actif') === 'actif').map((a) => a.fidele_id));
  return {
    total: actifs.length,
    debut: actifs.filter((f) => date(f) && date(f) < `${annee}-01-01`).length,
    entrees: actifs.filter((f) => date(f).startsWith(String(annee))).length,
    sorties: tous.filter((f) => f.actif === false).length,
    avecCompte: actifs.filter((f) => f.user_id).length,
    sansStructure: actifs.filter((f) => !dansUne.has(f.id)).length,
    courbe,
    structures,
    repartition: repartitionSexe(actifs),
  };
}
const repartitionSexe = (l) => ({ F: l.filter((f) => f.sexe === 'F').length, M: l.filter((f) => f.sexe === 'M').length, nc: l.filter((f) => !f.sexe).length });

// ---------- Cotisations ----------
// Taux sur l'année : échéances qui tombent dans l'année (jusqu'à aujourd'hui pour l'année en cours)
export function cotisations(db, egliseId, structureId, annee) {
  const d1 = `${annee}-01-01`, d2 = arret(annee);
  const liste = (db.cotisations || []).filter((c) => c.eglise_id === egliseId && c.actif !== false && (!structureId || c.structure_id === structureId));
  const lignes = liste.map((cot) => {
    const pers = new Set(periodes(cot).filter((p) => (p === 'unique' ? (cot.debut_date || `${cot.debut || annee}-01`).slice(0, 4) <= String(annee) : finPeriode(p) >= d1 && finPeriode(p) <= finAnnee(annee))));
    let attendu = 0, paye = 0, aJour = 0;
    const fs = fidelesConcernes(db, cot);
    for (const f of fs) {
      const s = situation(db, cot, f.id).filter((x) => pers.has(x.periode) && (x.periode === 'unique' || finPeriode(x.periode) <= d2));
      attendu += s.reduce((t, x) => t + x.du, 0);
      paye += s.reduce((t, x) => t + Math.min(x.du, x.paye), 0);
      if (s.every((x) => x.reste <= 0)) aJour++;
    }
    const encaisse = paiementsDe(db, cot.id).filter((p) => (p.date || '').startsWith(String(annee))).reduce((t, p) => t + p.montant, 0);
    return { cot, structure: (db.structures || []).find((s) => s.id === cot.structure_id), fideles: fs.length, aJour, attendu, paye, reste: attendu - paye, encaisse, taux: attendu ? Math.round((paye / attendu) * 100) : 0 };
  });
  const attendu = lignes.reduce((t, l) => t + l.attendu, 0), paye = lignes.reduce((t, l) => t + l.paye, 0);
  return { lignes, attendu, paye, reste: attendu - paye, encaisse: lignes.reduce((t, l) => t + l.encaisse, 0), taux: attendu ? Math.round((paye / attendu) * 100) : 0 };
}

// ---------- Activités et assiduité ----------
// Personnes attendues à une activité : membres de la structure, liste désignée, ou tous les fidèles de l'église
export function attendus(db, a) {
  if (a.destinataires === 'liste' && (a.fideles || []).length) return a.fideles;
  if (a.structure_id && a.destinataires !== 'eglise') return membresStructure(db, a.structure_id).map((f) => f.id);
  return fidelesEglise(db, a.eglise_id).filter((f) => f.actif !== false).map((f) => f.id);
}
export const tauxPresence = (db, a) => {
  if (!Array.isArray(a.presents)) return null;
  const att = attendus(db, a);
  const presents = a.presents.filter((id) => att.includes(id)).length;
  return att.length ? Math.round((presents / att.length) * 100) : 0;
};

export function activites(db, egliseId, structureId, annee) {
  const maintenant = new Date();
  const liste = (db.activites || []).filter((a) => a.eglise_id === egliseId && (a.debut || '').startsWith(String(annee)) && (!structureId || a.structure_id === structureId))
    .map((a) => ({ a, st: statutActivite(a, maintenant) })).sort((x, y) => x.a.debut.localeCompare(y.a.debut));
  const n = (st) => liste.filter((x) => x.st === st).length;
  const terminees = n('realisee') + n('annulee') + n('non_tenue');
  const pointees = liste.filter((x) => x.st === 'realisee' && Array.isArray(x.a.presents));
  const taux = pointees.map((x) => tauxPresence(db, x.a));
  // Assiduité par fidèle : présences / activités pointées où il était attendu
  const parFidele = new Map();
  for (const { a } of pointees) {
    for (const id of attendus(db, a)) {
      const e = parFidele.get(id) || { attendu: 0, present: 0 };
      e.attendu++; if (a.presents.includes(id)) e.present++;
      parFidele.set(id, e);
    }
  }
  const assidus = [...parFidele.entries()].map(([id, e]) => ({ f: (db.fideles || []).find((x) => x.id === id), ...e, taux: Math.round((e.present / e.attendu) * 100) }))
    .filter((x) => x.f).sort((a, b) => b.taux - a.taux || b.present - a.present);
  const parStructure = structureId ? [] : (db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false).map((s) => {
    const l = liste.filter((x) => x.a.structure_id === s.id);
    const p = l.filter((x) => x.st === 'realisee' && Array.isArray(x.a.presents)).map((x) => tauxPresence(db, x.a));
    return { s, total: l.length, realisees: l.filter((x) => x.st === 'realisee').length, annulees: l.filter((x) => x.st === 'annulee' || x.st === 'non_tenue').length, presence: p.length ? Math.round(p.reduce((t, v) => t + v, 0) / p.length) : null };
  }).filter((x) => x.total);
  return {
    liste, total: liste.length, aVenir: n('a_venir') + n('en_cours'), realisees: n('realisee'), annulees: n('annulee'), nonTenues: n('non_tenue'),
    tauxRealisation: terminees ? Math.round((n('realisee') / terminees) * 100) : null,
    pointees: pointees.length, presenceMoyenne: taux.length ? Math.round(taux.reduce((t, v) => t + v, 0) / taux.length) : null,
    assidus, parStructure,
  };
}
