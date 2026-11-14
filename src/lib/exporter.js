import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { num, dateFr, today } from './format';

const natif = () => Capacitor.isNativePlatform();

const blobVersBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

// Enregistre le fichier puis ouvre la feuille de partage Android (WhatsApp, e-mail, Drive, impression…)
async function livrer(blob, nom, { partager = false, titre = 'Mon Église' } = {}) {
  if (natif()) {
    const data = await blobVersBase64(blob);
    const f = await Filesystem.writeFile({ path: nom, data, directory: Directory.Cache });
    await Share.share({ title: titre, files: [f.uri], dialogTitle: partager ? 'Partager' : 'Ouvrir ou imprimer' });
    return;
  }
  const fichier = new File([blob], nom, { type: blob.type });
  if (partager && navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: titre }); return; } catch { /* annulé */ }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nom });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const COLONNES = [
  { cle: 'date', titre: 'Date', val: (o) => dateFr(o.date), pdf: (o) => o.date.split('-').reverse().join('/') },
  { cle: 'caisse', titre: 'Caisse', val: (o) => o._caisse },
  { cle: 'type', titre: 'Type', val: (o) => (o.type === 'recette' ? 'Recette' : 'Dépense') },
  { cle: 'categorie', titre: 'Catégorie', val: (o) => o._categorie },
  { cle: 'libelle', titre: 'Libellé', val: (o) => o.libelle },
  { cle: 'montant', titre: 'Montant (F CFA)', val: (o) => o.montant, pdf: (o) => `${o.type === 'recette' ? '+' : '-'} ${num(o.montant)}` },
  { cle: 'description', titre: 'Description', val: (o) => o.description || '' },
  { cle: 'observations', titre: 'Observations', val: (o) => o.observations || '' },
];

const nomFichier = (base, ext) => `${base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_')}_${today()}.${ext}`;

export async function exporterCSV(lignes, base, opts) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [COLONNES.map((c) => esc(c.titre)).join(';'), ...lignes.map((o) => COLONNES.map((c) => esc(c.val(o))).join(';'))].join('\r\n');
  await livrer(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), nomFichier(base, 'csv'), opts);
}

export async function exporterExcel(lignes, base, opts) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([COLONNES.map((c) => c.titre), ...lignes.map((o) => COLONNES.map((c) => c.val(o)))]);
  ws['!cols'] = [12, 20, 10, 22, 32, 16, 30, 26].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Opérations');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  await livrer(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomFichier(base, 'xlsx'), opts);
}

// PDF générique : titre, sous-titre, blocs de synthèse et tableau
export async function exporterPDF({ titre, sousTitre, eglise, synthese = [], colonnes, lignes, base, caissiers = [], editePar = '', phrase = '', ...opts }) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: colonnes.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(11, 42, 102); doc.rect(0, 0, W, 64, 'F');
  doc.setFillColor(244, 180, 42); doc.rect(0, 64, W, 3, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Mon Église', 36, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(eglise || '', 36, 46);
  doc.text(`Édité le ${dateFr(today())}`, W - 36, 46, { align: 'right' });
  doc.setTextColor(14, 26, 51); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(titre, 36, 96);
  let y = 112;
  if (sousTitre) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(91, 107, 134); doc.text(sousTitre, 36, y); y += 18; }
  if (synthese.length) {
    const bw = (W - 72 - (synthese.length - 1) * 10) / synthese.length;
    synthese.forEach((s, i) => {
      const x = 36 + i * (bw + 10);
      doc.setFillColor(238, 243, 250); doc.roundedRect(x, y, bw, 46, 6, 6, 'F');
      doc.setFontSize(8.5); doc.setTextColor(91, 107, 134); doc.setFont('helvetica', 'normal'); doc.text(s.label, x + 10, y + 17);
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...(s.couleur || [14, 26, 51])); doc.text(s.valeur, x + 10, y + 35);
    });
    y += 62;
  }
  autoTable(doc, {
    startY: y,
    head: [colonnes.map((c) => c.titre)],
    body: lignes,
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, textColor: [14, 26, 51] },
    headStyles: { fillColor: [31, 95, 214], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 249, 253] },
    columnStyles: Object.fromEntries(colonnes.map((c, i) => [i, c.align ? { halign: c.align } : {}])),
    margin: { left: 36, right: 36 },
    didDrawPage: () => {
      doc.setFontSize(8); doc.setTextColor(140);
      doc.text(`Mon Église — Toute votre église à portée de main · page ${doc.getNumberOfPages()}`, 36, doc.internal.pageSize.getHeight() - 20);
    },
  });
  // Traçabilité : caissier(s), auteur de l'édition, zones de signature
  let fy = (doc.lastAutoTable?.finalY || y) + 22;
  const H = doc.internal.pageSize.getHeight();
  if (fy > H - 120) { doc.addPage(); fy = 50; }
  doc.setTextColor(14, 26, 51); doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
  if (phrase) { doc.setFont('helvetica', 'bold'); doc.text(phrase, 36, fy); doc.setFont('helvetica', 'normal'); fy += 16; }
  if (caissiers.length) { doc.text(`Caissier${caissiers.length > 1 ? 's' : ''} : ${caissiers.join(', ')}`, 36, fy); fy += 14; }
  if (editePar) { doc.text(`Édité par : ${editePar}, le ${dateFr(today())} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, 36, fy); fy += 14; }
  if (caissiers.length || editePar) {
    fy += 14;
    const lw = (W - 72 - 30) / 2;
    ['Le caissier', 'Le pasteur'].forEach((t, i) => {
      const x = 36 + i * (lw + 30);
      doc.setFontSize(9); doc.setTextColor(91, 107, 134); doc.text(t, x, fy);
      doc.setDrawColor(200, 210, 225); doc.line(x, fy + 40, x + lw, fy + 40);
    });
  }
  const blob = doc.output('blob');
  if (opts.imprimer && !natif()) {
    const url = URL.createObjectURL(blob);
    const w = window.open(url);
    if (w) { w.addEventListener('load', () => w.print()); return; }
  }
  await livrer(blob, nomFichier(base || titre, 'pdf'), opts);
}

export async function exporterOperationsPDF(lignes, { titre, sousTitre, eglise, synthese, caissiers, editePar, phrase, ...opts }) {
  const cols = COLONNES.filter((c) => !['description', 'observations'].includes(c.cle)).map((c) => ({ ...c, align: c.cle === 'montant' ? 'right' : undefined }));
  await exporterPDF({
    titre, sousTitre, eglise, synthese, base: titre, caissiers, editePar, phrase, ...opts,
    colonnes: cols,
    lignes: lignes.map((o) => cols.map((c) => (c.pdf ? c.pdf(o) : c.val(o)))),
  });
}

export async function partagerTexte(texte, titre = 'Mon Église') {
  if (natif()) { await Share.share({ title: titre, text: texte }); return; }
  if (navigator.share) { try { await navigator.share({ title: titre, text: texte }); return; } catch { return; } }
  await navigator.clipboard?.writeText(texte);
}

// Modèle Excel prêt à remplir pour l'import
export async function exporterModeleImport(caisse, categories = []) {
  const XLSX = await import('xlsx');
  const c1 = categories.find((c) => c.type === 'recette')?.nom || 'Dîmes';
  const c2 = categories.find((c) => c.type === 'depense')?.nom || 'Électricité et eau';
  const ws = XLSX.utils.aoa_to_sheet([
    ['Date', 'Libellé', 'Catégorie', 'Type', 'Montant', 'Description', 'Observations'],
    ['05/10/2026', 'Dîmes du culte dominical', c1, 'Recette', 250000, '', 'Reçu n° 12'],
    ['07/10/2026', 'Facture SONABEL', c2, 'Dépense', 45000, 'Facture de septembre', ''],
  ]);
  ws['!cols'] = [12, 32, 24, 10, 14, 30, 20].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Opérations');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  await livrer(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `modele_import_${(caisse?.nom || 'caisse').replace(/[^\w-]+/g, '_')}.xlsx`, { partager: true });
}

// Livraison d'un fichier quelconque (partage sur téléphone, téléchargement sur ordinateur)
export const livrerFichier = (blob, nom) => livrer(blob, nom, { partager: true });

// Rapport annuel (église ou structure) : page de garde, sections successives (texte, chiffres clés, tableaux),
// puis les signatures. Prêt à être présenté en assemblée.
export async function exporterRapportAnnuel({ titre, sousTitre, eglise, sections = [], signatures = ['Le secrétaire', 'Le trésorier', 'Le pasteur'], editePar = '', base, ...opts }) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const NAVY = [11, 42, 102], TEXTE = [14, 26, 51], DOUX = [91, 107, 134];
  const pied = () => { doc.setFontSize(8); doc.setTextColor(140); doc.setFont('helvetica', 'normal'); doc.text(`${eglise || 'Mon Église'} — ${titre} · page ${doc.getNumberOfPages()}`, 36, H - 20); };
  // Page de garde
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, H * 0.46, 'F');
  doc.setFillColor(244, 180, 42); doc.rect(0, H * 0.46, W, 5, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text('Mon Église', 48, 70);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.text(doc.splitTextToSize(titre, W - 96), 48, H * 0.25);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.text(doc.splitTextToSize(sousTitre || '', W - 96), 48, H * 0.25 + 64);
  doc.setTextColor(...TEXTE); doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(eglise || '', 48, H * 0.46 + 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...DOUX);
  doc.text(`Édité le ${dateFr(today())}${editePar ? ` par ${editePar}` : ''}`, 48, H * 0.46 + 70);
  let ys = H * 0.46 + 110;
  doc.setFontSize(10.5); doc.setTextColor(...TEXTE); doc.setFont('helvetica', 'bold'); doc.text('Sommaire', 48, ys); ys += 18;
  doc.setFont('helvetica', 'normal');
  sections.forEach((s, i) => { doc.text(`${i + 1}. ${s.titre}`, 60, ys); ys += 16; });
  pied();

  let y = 0;
  const place = (h) => { if (y + h > H - 50) { doc.addPage(); pied(); y = 50; } };
  sections.forEach((s, i) => {
    doc.addPage(); pied(); y = 54;
    doc.setFillColor(...NAVY); doc.rect(36, y - 16, 4, 22, 'F');
    doc.setTextColor(...TEXTE); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(`${i + 1}. ${s.titre}`, 48, y);
    y += 22;
    for (const p of s.texte ? [].concat(s.texte) : []) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TEXTE);
      const l = doc.splitTextToSize(p, W - 72); place(l.length * 13 + 6); doc.text(l, 36, y); y += l.length * 13 + 6;
    }
    if (s.chiffres?.length) {
      const n = Math.min(4, s.chiffres.length);
      const bw = (W - 72 - (n - 1) * 10) / n;
      for (let k = 0; k < s.chiffres.length; k += n) {
        place(56); y += 4;
        s.chiffres.slice(k, k + n).forEach((c, j) => {
          const x = 36 + j * (bw + 10);
          doc.setFillColor(238, 243, 250); doc.roundedRect(x, y, bw, 46, 6, 6, 'F');
          doc.setFontSize(8); doc.setTextColor(...DOUX); doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(c.label, bw - 16)[0], x + 8, y + 16);
          doc.setFontSize(11.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...(c.couleur || TEXTE)); doc.text(String(c.valeur), x + 8, y + 35);
        });
        y += 56;
      }
    }
    for (const t of s.tableaux || []) {
      if (!t.lignes?.length) continue;
      place(60);
      if (t.titre) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...NAVY); doc.text(t.titre, 36, y + 6); y += 14; }
      autoTable(doc, {
        startY: y, head: [t.colonnes.map((c) => c.titre)], body: t.lignes,
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4.5, textColor: TEXTE },
        headStyles: { fillColor: [31, 95, 214], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [246, 249, 253] },
        columnStyles: Object.fromEntries(t.colonnes.map((c, k) => [k, c.align ? { halign: c.align } : {}])),
        didParseCell: (d) => { if (d.section === 'head' && t.colonnes[d.column.index]?.align) d.cell.styles.halign = t.colonnes[d.column.index].align; if (d.section === 'body' && t.totalDerniere && d.row.index === t.lignes.length - 1) d.cell.styles.fontStyle = 'bold'; },
        margin: { left: 36, right: 36, top: 50 },
        didDrawPage: pied,
      });
      y = (doc.lastAutoTable?.finalY || y) + 18;
    }
  });
  // Adoption et signatures
  place(130); y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TEXTE);
  doc.text(`Fait à ......................................, le ${dateFr(today())}`, 36, y); y += 30;
  const lw = (W - 72 - (signatures.length - 1) * 20) / signatures.length;
  signatures.forEach((t, i) => {
    const x = 36 + i * (lw + 20);
    doc.setFontSize(9); doc.setTextColor(...DOUX); doc.text(t, x, y);
    doc.setDrawColor(200, 210, 225); doc.line(x, y + 50, x + lw, y + 50);
  });
  const blob = doc.output('blob');
  if (opts.imprimer && !natif()) {
    const url = URL.createObjectURL(blob);
    const w = window.open(url);
    if (w) { w.addEventListener('load', () => w.print()); return; }
  }
  await livrer(blob, nomFichier(base || titre, 'pdf'), opts);
}
