// Import Excel / CSV : lecture du fichier, détection de la ligne de titres,
// correspondance automatique des colonnes, conversion des dates et montants.

export const CHAMPS = [
  { cle: 'date', label: 'Date', requis: true, mots: ['date', 'jour', 'le '] },
  { cle: 'libelle', label: 'Libellé', requis: true, mots: ['libelle', 'libellé', 'designation', 'désignation', 'intitule', 'intitulé', 'objet', 'motif', 'nature', 'detail', 'détail'] },
  { cle: 'montant', label: 'Montant', mots: ['montant', 'somme', 'valeur', 'total f', 'prix'] },
  { cle: 'entree', label: 'Entrées (recettes)', mots: ['entree', 'entrée', 'recette', 'credit', 'crédit', 'encaissement', 'recu', 'reçu'] },
  { cle: 'sortie', label: 'Sorties (dépenses)', mots: ['sortie', 'depense', 'dépense', 'debit', 'débit', 'decaissement', 'décaissement', 'paye', 'payé'] },
  { cle: 'type', label: 'Type (recette / dépense)', mots: ['type', 'sens', 'mouvement'] },
  { cle: 'categorie', label: 'Catégorie', mots: ['categorie', 'catégorie', 'rubrique', 'poste', 'compte'] },
  { cle: 'description', label: 'Description', mots: ['description', 'commentaire', 'precision', 'précision'] },
  { cle: 'observations', label: 'Observations', mots: ['observation', 'remarque', 'note', 'reference', 'référence', 'piece', 'pièce', 'n° reçu'] },
];

// Sans accents, sans espaces insécables ni caractères invisibles (fréquents dans les fichiers modifiés sur téléphone)
const sansAccent = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00a0\u202f\u200b\ufeff]/g, ' ').toLowerCase().trim();

export async function lireClasseur(fichier) {
  const XLSX = await import('xlsx');
  const tampon = await fichier.arrayBuffer();
  const wb = XLSX.read(tampon, { type: 'array', cellDates: true, raw: false, dateNF: 'yyyy-mm-dd' });
  const infos = wb.Workbook?.Sheets || [];
  const feuilles = wb.SheetNames.map((nom, i) => {
    const lignes = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, raw: true, defval: '', blankrows: false });
    const pleines = lignes.filter((l) => l.some((c) => String(c ?? '').trim() !== ''));
    const e = devinerEntete(pleines);
    // Score : nombre de colonnes reconnues sur la ligne de titres (les feuilles masquées passent après)
    const score = Object.keys(devinerMappage((pleines[e] || []).map((h) => String(h ?? '')))).length - (infos[i]?.Hidden ? 100 : 0);
    return { nom, lignes: pleines, masquee: !!infos[i]?.Hidden, score };
  }).filter((f) => f.lignes.length);
  // La feuille la plus probable d'abord (certaines applications ajoutent des feuilles masquées ou vides)
  return feuilles.sort((a, b) => b.score - a.score);
}

// Ligne de titres : la première qui contient au moins deux mots connus (sinon la première ligne)
export function devinerEntete(lignes) {
  let meilleur = 0, score = 0;
  for (let i = 0; i < Math.min(lignes.length, 20); i++) {
    const textes = lignes[i].map(sansAccent);
    const reconnus = CHAMPS.filter((c) => textes.some((t) => t && c.mots.some((m) => t.includes(sansAccent(m))))).length;
    if (reconnus > score) { score = reconnus; meilleur = i; }
    if (reconnus >= 4) break;
  }
  return score >= 2 ? meilleur : 0;
}

export function devinerMappage(entetes) {
  const m = {};
  const pris = new Set();
  const textes = entetes.map(sansAccent);
  for (const c of CHAMPS) {
    const i = textes.findIndex((t, j) => !pris.has(j) && t && c.mots.some((mot) => t.includes(sansAccent(mot))));
    if (i >= 0) { m[c.cle] = i; pris.add(i); }
  }
  return m;
}

export const signature = (entetes) => entetes.map(sansAccent).join('|');

const pad = (n) => String(n).padStart(2, '0');
export function lireDate(v) {
  if (v === '' || v == null) return null;
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Numéro de série Excel (jours depuis le 30/12/1899)
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (r) return valide(+r[1], +r[2], +r[3]);
  r = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
  if (r) { let a = +r[3]; if (a < 100) a += 2000; return valide(a, +r[2], +r[1]); }
  const MOIS = ['janv', 'fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'];
  r = sansAccent(s).match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{2,4})/);
  if (r) { const m = MOIS.findIndex((x) => r[2].startsWith(x.slice(0, 3))); let a = +r[3]; if (a < 100) a += 2000; if (m >= 0) return valide(a, m + 1, +r[1]); }
  return null;
}
function valide(a, m, j) {
  if (m < 1 || m > 12 || j < 1 || j > 31 || a < 1990 || a > 2100) return null;
  const d = new Date(a, m - 1, j);
  return d.getMonth() === m - 1 ? `${a}-${pad(m)}-${pad(j)}` : null;
}

// « 150 000 », « 150.000 F CFA », « (25 000) », « -25000 », 150000
export function lireMontant(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return Math.round(v);
  let s = String(v).trim();
  const negatif = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s.replace(/f\s*cfa|fcfa|xof|cfa|f$/i, '').replace(/[\s\u00a0\u202f]/g, '').replace(/[()+-]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d+)$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!isFinite(n) || s === '') return null;
  return Math.round(negatif ? -n : n);
}

export function lireType(v) {
  const s = sansAccent(v);
  if (!s) return null;
  if (/^(r|e|\+|c)$/.test(s) || /recette|entree|credit|encaiss|don|offrande|dime|contribution/.test(s)) return 'recette';
  if (/^(d|s|-)$/.test(s) || /depense|sortie|debit|decaiss|achat|paiement|facture/.test(s)) return 'depense';
  return null;
}

const LIGNE_TOTAL = /^(sous[- ]?)?(total|totaux|totals)\b|^report|^solde|^a reporter|^cumul/;

// Convertit les lignes du fichier en opérations, avec les erreurs de chaque ligne
export function convertir(lignes, entete, m, { modeType, typeFixe }) {
  const val = (l, cle) => (m[cle] != null && m[cle] !== '' ? l[m[cle]] : '');
  const out = [];
  for (let i = entete + 1; i < lignes.length; i++) {
    const l = lignes[i];
    const libelle = String(val(l, 'libelle') ?? '').trim();
    const ligne = { num: i + 1, libelle, date: lireDate(val(l, 'date')), categorieNom: String(val(l, 'categorie') ?? '').trim(),
      description: String(val(l, 'description') ?? '').trim(), observations: String(val(l, 'observations') ?? '').trim(), erreurs: [] };
    if (LIGNE_TOTAL.test(sansAccent(libelle)) || (!libelle && !val(l, 'date'))) { ligne.ignoree = 'Ligne de total ou vide'; out.push(ligne); continue; }
    let montant = null, type = null;
    if (modeType === 'deux') {
      const e = lireMontant(val(l, 'entree')), s = lireMontant(val(l, 'sortie'));
      if (e && Math.abs(e) > 0) { montant = Math.abs(e); type = 'recette'; } else if (s && Math.abs(s) > 0) { montant = Math.abs(s); type = 'depense'; }
    } else {
      const n = lireMontant(val(l, 'montant'));
      if (n != null) montant = Math.abs(n);
      if (modeType === 'fixe') type = typeFixe;
      else if (modeType === 'colonne') type = lireType(val(l, 'type'));
      else if (modeType === 'signe' && n != null) type = n < 0 ? 'depense' : 'recette';
    }
    ligne.montant = montant; ligne.type = type;
    if (!ligne.date) ligne.erreurs.push('Date illisible');
    if (montant === 0) { ligne.ignoree = 'Montant nul'; out.push(ligne); continue; }
    if (!montant) ligne.erreurs.push('Montant manquant');
    if (!type) ligne.erreurs.push('Type inconnu');
    if (!libelle) ligne.libelle = ligne.categorieNom || 'Opération importée';
    out.push(ligne);
  }
  return out;
}

export const cleDoublon = (date, montant, libelle) => `${date}|${montant}|${sansAccent(libelle).replace(/\s+/g, ' ')}`;
export const normaliser = sansAccent;
