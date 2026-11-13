// Programmes réguliers (cultes, prières) et services : listes de fidèles, besoins, séances planifiées.
// Une séance planifiée est une activité de l'église (programme_id), visible par tous ;
// seules les personnes désignées sont prévenues et reçoivent les rappels.
export const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export const LISTES_MODELE = [
  { cle: 'chantres', nom: 'Chantres', type: 'role' },
  { cle: 'predicateurs', nom: 'Prédicateurs / guides de prière', type: 'role' },
  { cle: 'coordonnateurs', nom: 'Coordonnateurs', type: 'role' },
  { cle: 'interpretes', nom: 'Interprètes', type: 'role' },
  { cle: 'enseignants', nom: 'Enseignants de la leçon du dimanche', type: 'role' },
  { cle: 'accueil', nom: 'Accueil', type: 'service' },
  { cle: 'parking', nom: 'Parking', type: 'service' },
  { cle: 'nettoyage', nom: 'Nettoyage', type: 'service' },
  { cle: 'sonorisation', nom: 'Sonorisation', type: 'service' },
];
const PRIERE = [['chantres', 2], ['predicateurs', 1], ['coordonnateurs', 1], ['interpretes', 1]];
export const PROGRAMMES_MODELE = [
  { cle: 'cellule', nom: 'Prière de cellule', jour: 2, heure: '18:30', fin: '20:00', besoins: PRIERE },
  { cle: 'intercession', nom: "Prière d'intercession", jour: 5, heure: '18:30', fin: '20:30', besoins: PRIERE },
  { cle: 'culte', nom: 'Culte du dimanche', jour: 0, heure: '08:00', fin: '11:30',
    besoins: [...PRIERE, ['enseignants', 1], ['accueil', 2], ['parking', 2], ['nettoyage', 2], ['sonorisation', 1]] },
];

// Listes et programmes de départ d'une église (identifiants stables : pas de doublon si créés deux fois)
export function modeleProgrammes(eid) {
  const listes = LISTES_MODELE.map((l, i) => ({ id: `${eid}_lst_${l.cle}`, eglise_id: eid, nom: l.nom, type: l.type, ordre: i, fideles: [], actif: true }));
  const programmes = PROGRAMMES_MODELE.map((p, i) => ({
    id: `${eid}_prg_${p.cle}`, eglise_id: eid, nom: p.nom, jour: p.jour, heure: p.heure, fin: p.fin, lieu: 'Temple', ordre: i, actif: true,
    besoins: p.besoins.map(([cle, nombre]) => ({ liste_id: `${eid}_lst_${cle}`, nombre })),
  }));
  return { listes, programmes };
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Dates des prochaines séances d'un programme (à partir d'aujourd'hui, sur n semaines)
export function prochainesDates(programme, semaines = 4, depuis = new Date()) {
  const d = new Date(depuis); d.setHours(0, 0, 0, 0);
  while (d.getDay() !== Number(programme.jour)) d.setDate(d.getDate() + 1);
  return Array.from({ length: semaines }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + 7 * i); return iso(x); });
}

export const seanceDe = (db, programmeId, date) => (db.activites || []).find((a) => a.programme_id === programmeId && (a.debut || '').startsWith(date) && a.statut !== 'annulee');
export const listesEglise = (db, eid) => (db.listes || []).filter((l) => l.eglise_id === eid && l.actif !== false).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));
export const programmesEglise = (db, eid) => (db.programmes || []).filter((p) => p.eglise_id === eid && p.actif !== false).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));

// Dernier service d'un fidèle dans une liste (aide au responsable pour répartir équitablement)
export function dernierService(db, listeId, fideleId) {
  const faits = (db.activites || []).filter((a) => a.programme_id && a.statut !== 'annulee' && (a.affectations?.[listeId] || []).includes(fideleId) && a.debut <= new Date().toISOString().slice(0, 16));
  return faits.map((a) => a.debut.slice(0, 10)).sort().pop() || null;
}

// Prochains services d'un fidèle : [{ seance, listes: [noms] }]
export function mesServices(db, fideleId, jours = 21) {
  if (!fideleId) return [];
  const maintenant = new Date().toISOString().slice(0, 16);
  const limite = new Date(Date.now() + jours * 86400000).toISOString().slice(0, 16);
  return (db.activites || [])
    .filter((a) => a.programme_id && a.statut !== 'annulee' && a.debut >= maintenant.slice(0, 10) && a.debut <= limite)
    .map((a) => ({ seance: a, listes: Object.entries(a.affectations || {}).filter(([, ids]) => ids.includes(fideleId)).map(([lid]) => (db.listes || []).find((l) => l.id === lid)?.nom).filter(Boolean) }))
    .filter((x) => x.listes.length).sort((a, b) => a.seance.debut.localeCompare(b.seance.debut));
}
