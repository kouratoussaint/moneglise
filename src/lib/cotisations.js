// Cotisations : occurrences (échéances) entre la date de début et la date de fin, paiements par fidèle.
import { appartenancesStructure } from './structures';
import { today, moisLabel } from './format';

export const PERIODICITES = { unique: 'Paiement unique', hebdomadaire: 'Hebdomadaire', mensuelle: 'Mensuelle', trimestrielle: 'Trimestrielle', annuelle: 'Annuelle' };

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const debutDe = (cot) => cot.debut_date || (cot.debut ? `${cot.debut}-01` : today());
const finDe = (cot) => cot.fin_date || (cot.fin ? `${cot.fin}-28` : null);

function cle(cot, d) {
  const a = d.getFullYear(), m = d.getMonth() + 1;
  switch (cot.periodicite) {
    case 'hebdomadaire': return `S:${iso(d)}`;
    case 'mensuelle': return `${a}-${String(m).padStart(2, '0')}`;
    case 'trimestrielle': return `${a}-T${Math.floor((m - 1) / 3) + 1}`;
    case 'annuelle': return `${a}`;
    default: return 'unique';
  }
}
function suivante(cot, d) {
  const n = new Date(d);
  if (cot.periodicite === 'hebdomadaire') n.setDate(n.getDate() + 7);
  else if (cot.periodicite === 'mensuelle') n.setMonth(n.getMonth() + 1);
  else if (cot.periodicite === 'trimestrielle') n.setMonth(n.getMonth() + 3);
  else n.setFullYear(n.getFullYear() + 1);
  return n;
}

// Occurrences entre la date de début et aujourd'hui (ou la date de fin) ; « avecFutures » en ajoute d'avance
export function periodes(cot, avecFutures = 0) {
  if (!cot.periodicite || cot.periodicite === 'unique') return ['unique'];
  const out = [];
  const limite = finDe(cot);
  let d = new Date(`${debutDe(cot)}T00:00:00`);
  const aujourdhui = today();
  let futures = 0;
  for (let i = 0; i < 520; i++) {
    const j = iso(d);
    if (limite && j > limite) break;
    if (j > aujourdhui) { if (futures >= avecFutures) break; futures++; }
    out.push(cle(cot, d));
    d = suivante(cot, d);
  }
  return out.length ? out : [cle(cot, new Date(`${debutDe(cot)}T00:00:00`))];
}

export function libellePeriode(p) {
  if (p === 'unique') return 'Paiement unique';
  if (p.startsWith('S:')) return `Semaine du ${p.slice(2).split('-').reverse().join('/')}`;
  if (/^\d{4}-\d{2}$/.test(p)) return moisLabel(p);
  if (/T\d$/.test(p)) return `${p.slice(6) === '1' ? '1er' : `${p.slice(6)}e`} trimestre ${p.slice(0, 4)}`;
  return `Année ${p}`;
}

// Dernier jour d'une échéance
export function finPeriode(p) {
  if (p === 'unique') return '9999-12-31';
  if (p.startsWith('S:')) { const d = new Date(`${p.slice(2)}T00:00:00`); d.setDate(d.getDate() + 6); return iso(d); }
  if (/^\d{4}-\d{2}$/.test(p)) { const [a, m] = p.split('-').map(Number); return iso(new Date(a, m, 0)); }
  if (/T\d$/.test(p)) { const a = Number(p.slice(0, 4)), t = Number(p.slice(6)); return iso(new Date(a, t * 3, 0)); }
  return `${p}-12-31`;
}

export const fidelesConcernes = (db, cot) => (cot.concerne === 'liste'
  ? (cot.fideles || []).map((id) => (db.fideles || []).find((f) => f.id === id)).filter(Boolean)
  : appartenancesStructure(db, cot.structure_id).map((a) => (db.fideles || []).find((f) => f.id === a.fidele_id)).filter(Boolean));

export const paiementsDe = (db, cotId) => (db.paiements || []).filter((p) => p.cotisation_id === cotId && !p.annule);

// Situation d'un fidèle : dû, payé, reste, par occurrence (+ occurrences créées par des paiements d'avance)
export function situation(db, cot, fideleId, avecFutures = 0) {
  const ps = paiementsDe(db, cot.id).filter((p) => p.fidele_id === fideleId);
  // Pour « tous les membres », les échéances commencent à l'entrée du fidèle dans la structure
  // (les échéances restent alignées sur le calendrier de la cotisation)
  const entree = cot.concerne !== 'liste' && (db.appartenances || []).filter((a) => a.structure_id === cot.structure_id && a.fidele_id === fideleId && !a.jusqu_au).map((a) => a.depuis).sort()[0];
  const pers = periodes(cot, avecFutures).filter((p) => !entree || finPeriode(p) >= entree);
  for (const p of ps) if (!pers.includes(p.periode)) pers.push(p.periode);
  return pers.map((per) => {
    const paye = ps.filter((p) => p.periode === per).reduce((s, p) => s + p.montant, 0);
    return { periode: per, du: Number(cot.montant) || 0, paye, reste: Math.max(0, (Number(cot.montant) || 0) - paye) };
  });
}

// Répartit un paiement sur les prochaines occurrences dues (et crée les suivantes si tout est déjà payé)
export function repartir(db, cot, fideleId, montant) {
  const parts = [];
  let reste = montant;
  const occ = situation(db, cot, fideleId, 104);
  for (const o of occ) {
    if (reste <= 0) break;
    if (o.reste <= 0) continue;
    const part = Math.min(o.reste, reste);
    parts.push({ periode: o.periode, montant: part });
    reste -= part;
  }
  if (reste > 0) parts.push({ periode: occ[occ.length - 1]?.periode || 'unique', montant: reste, excedent: true });
  return parts;
}

export function bilan(db, cot) {
  const fideles = fidelesConcernes(db, cot);
  let attendu = 0, paye = 0, enRetard = 0;
  const pers = new Set(periodes(cot));
  for (const f of fideles) {
    const s = situation(db, cot, f.id).filter((x) => pers.has(x.periode));
    attendu += s.reduce((t, x) => t + x.du, 0);
    paye += s.reduce((t, x) => t + Math.min(x.du, x.paye), 0);
    if (s.some((x) => x.reste > 0)) enRetard++;
  }
  return { fideles: fideles.length, attendu, paye, reste: attendu - paye, enRetard, taux: attendu ? Math.round((paye / attendu) * 100) : 0 };
}
