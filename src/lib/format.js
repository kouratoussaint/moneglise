// Formatage F CFA et dates (fr-FR)
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export const fcfa = (n) => `${nf.format(Math.round(n || 0)).replace(/\u202f|\u00a0/g, ' ')} F CFA`;
export const num = (n) => nf.format(Math.round(n || 0)).replace(/\u202f|\u00a0/g, ' ');
export const compact = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  if (a >= 1_000) return `${Math.round(n / 1_000)} k`;
  return `${Math.round(n || 0)}`;
};

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const dateFr = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MOIS_COURT[m - 1]} ${y}`;
};
export const dateCourte = (iso) => {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};
export const moisLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MOIS[m - 1].charAt(0).toUpperCase()}${MOIS[m - 1].slice(1)} ${y}`;
};
export const moisCourt = (ym) => {
  const [, m] = ym.split('-').map(Number);
  return MOIS_COURT[m - 1];
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const ymOf = (iso) => iso.slice(0, 7);
export const addMonths = (ym, k) => {
  let [y, m] = ym.split('-').map(Number);
  m += k;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
};
export const lastMonths = (n, endYm = ymOf(today())) => {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(endYm, -i));
  return out;
};
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const initiales = (u) => `${(u?.prenom || '?')[0]}${(u?.nom || '')[0] || ''}`.toUpperCase();
export const parseMontant = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;
