import { modeleProgrammes } from '../lib/programmes';
import { MATRICE_DEFAUT } from '../lib/permissions';
import { today, ymOf, addMonths } from '../lib/format';

// Générateur pseudo-aléatoire déterministe pour des données de démo stables
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const PARAMETRES_DEFAUT = { fideles_mois_clotures: false, devise: 'F CFA' };

export const CAISSES_MODELE = [
  { cle: 'eglise', nom: 'Caisse Église', description: 'Dîmes et offrandes prélevées les dimanches', icone: 'Church', image: 'interieur', couleur: '#1F5FD6' },
  { cle: 'vimab', nom: 'Caisse VIMAB', description: 'Contributions mensuelles des structures JAD, MEHB, ASC et Diacres', icone: 'Users', image: 'lecture', couleur: '#7A4FD6' },
  { cle: 'construction', nom: 'Construction de l\'église', description: 'Offrandes volontaires mensuelles et dons individuels pour les travaux', icone: 'HardHat', image: 'construction', couleur: '#C98A06' },
  { cle: 'diacres', nom: 'Dîmes des diacres', description: 'Dîmes versées par les diacres', icone: 'HandHeart', image: 'bible', couleur: '#0E9F6E' },
];

const CATEGORIES_MODELE = {
  eglise: {
    recette: ['Dîmes', 'Offrandes du dimanche', 'Offrandes spéciales', 'Actions de grâce'],
    depense: ['Électricité et eau', 'Entretien des locaux', 'Sonorisation et matériel', 'Aide sociale', 'Transport et déplacements', 'Fournitures'],
  },
  vimab: {
    recette: ['Contribution JAD', 'Contribution MEHB', 'Contribution ASC', 'Contribution Diacres'],
    depense: ['Activités des structures', 'Mission et évangélisation', 'Formation'],
  },
  construction: {
    recette: ['Offrandes volontaires mensuelles', 'Dons individuels'],
    depense: ['Ciment', 'Fer et matériaux', 'Main-d\'œuvre', 'Location d\'engins'],
  },
  diacres: {
    recette: ['Dîmes des diacres'],
    depense: ['Reversement', 'Soutien pastoral'],
  },
};

// Modèles de départ par défaut ; l'administrateur de l'application peut les remplacer (Console › Modèles)
export function modelesParDefaut() {
  return {
    caisses: CAISSES_MODELE.map((m) => ({ ...m, categories: CATEGORIES_MODELE[m.cle] })),
    structures: STRUCTURES_MODELE.map((s) => ({ ...s })),
    droits: null,
  };
}

// Crée les caisses et catégories de départ d'une nouvelle église (modèles de la console, sinon ceux par défaut)
export function modeleEglise(egliseId, modeles) {
  const caisses = [], categories = [];
  const liste = modeles?.caisses?.length ? modeles.caisses : CAISSES_MODELE;
  liste.forEach((m, i) => {
    const cle = m.cle || `c${i}`;
    const cats = m.categories || CATEGORIES_MODELE[cle] || { recette: [], depense: [] };
    const id = `${egliseId}_c_${cle}`;
    caisses.push({ id, eglise_id: egliseId, nom: m.nom, description: m.description, icone: m.icone, image: m.image, couleur: m.couleur, ordre: i, actif: true, visible_fideles: true });
    for (const type of ['recette', 'depense']) {
      (cats[type] || []).forEach((nom, j) => categories.push({ id: `${id}_${type}_${j}`, eglise_id: egliseId, caisse_id: id, type, nom }));
    }
  });
  for (const type of ['recette', 'depense']) {
    categories.push({ id: `${egliseId}_autre_${type}`, eglise_id: egliseId, caisse_id: null, type, nom: 'Autre / N.P.', systeme: true });
    categories.push({ id: `${egliseId}_transfert_${type}`, eglise_id: egliseId, caisse_id: null, type, nom: type === 'recette' ? 'Transfert reçu' : 'Transfert envoyé', systeme: true, transfert: true });
  }
  return { caisses, categories, conversations: conversationsEglise(egliseId) };
}

// Discussions créées d'office dans chaque église
export function conversationsEglise(egliseId, par = null) {
  const le = new Date().toISOString();
  return [
    { id: `${egliseId}_conv_annonces`, eglise_id: egliseId, type: 'annonces', titre: 'Annonces', membres: [], cree_par: par, cree_le: le },
    { id: `${egliseId}_conv_generale`, eglise_id: egliseId, type: 'eglise', titre: 'Discussion de l\'église', membres: [], cree_par: par, cree_le: le },
  ];
}

export function nouvelleEglise(id, nom, ville, statut = 'actif', modeles) {
  return { id, nom, ville, cree_le: today(), statut, configuree: statut === 'actif', droits: droitsModele(modeles), parametres: { ...PARAMETRES_DEFAUT } };
}

// Droits de départ : ceux de la console (s'ils existent) complétés par les droits par défaut
export function droitsModele(modeles) {
  const d = structuredClone(MATRICE_DEFAUT);
  for (const [r, v] of Object.entries(modeles?.droits || {})) d[r] = { ...(d[r] || {}), ...v };
  return d;
}

export const STRUCTURES_MODELE = [
  { nom: 'JAD', description: 'Jeunesse' },
  { nom: 'DENAD', description: 'Département Enfant des Assemblées de Dieu' },
  { nom: 'ASC', description: 'Association des Servantes de Christ (femmes)' },
  { nom: 'MEHB', description: 'Mouvement des Hommes des Églises des Assemblées de Dieu du Burkina' },
  { nom: 'ADOS', description: 'Adolescents' },
  { nom: 'Chorale', description: 'Chantres et musiciens' },
  { nom: 'Diacres', description: 'Collège des diacres' },
];
export const structuresModele = (egliseId, modeles) => (modeles?.structures?.length ? modeles.structures : STRUCTURES_MODELE)
  .map((s, i) => ({ id: `${egliseId}_str_${i}`, eglise_id: egliseId, nom: s.nom, description: s.description || '', actif: true }));

export function seed() {
  const r = rng(42);
  const alea = (min, max, pas = 500) => Math.round((min + r() * (max - min)) / pas) * pas;

  const e1 = nouvelleEglise('egl_demo', 'Église Évangélique de la Grâce', 'Bobo-Dioulasso');
  const e2 = nouvelleEglise('egl_siloe', 'Assemblée Siloé', 'Ouagadougou');
  const m1 = modeleEglise(e1.id), m2 = modeleEglise(e2.id);
  const C = (cle, e = e1.id) => `${e}_c_${cle}`;
  const cat = (caisse, type, nom) => [...m1.categories, ...m2.categories].find((c) => c.caisse_id === caisse && c.type === type && c.nom === nom)?.id;

  e1.coordonnees = { adresse: 'Secteur 22, Bobo-Dioulasso', telephone: '+226 70 00 00 00', email: 'contact@grace-bobo.bf', denomination: 'Église évangélique' };
  const mdp = 'demo123';
  const users = [
    { id: 'u_super', eglise_id: null, prenom: 'Super', nom: 'Admin', email: 'superadmin@eglise360.app', mdp, role: 'super_admin', caisses: [], actif: true },
    { id: 'u_admin', eglise_id: e1.id, prenom: 'Paul', nom: 'Ouédraogo', email: 'admin@demo.bf', mdp, role: 'admin', caisses: [], actif: true },
    { id: 'u_pasteur', eglise_id: e1.id, prenom: 'Jean', nom: 'Kaboré', email: 'pasteur@demo.bf', mdp, role: 'pasteur', caisses: [], actif: true },
    { id: 'u_tres', eglise_id: e1.id, prenom: 'Marie', nom: 'Sawadogo', email: 'tresorier@demo.bf', mdp, role: 'gestionnaire', caisses: [C('eglise'), C('construction')], actif: true },
    { id: 'u_vimab', eglise_id: e1.id, prenom: 'Issa', nom: 'Compaoré', email: 'vimab@demo.bf', mdp, role: 'gestionnaire', caisses: [C('vimab'), C('diacres')], actif: true },
    { id: 'u_fidele', eglise_id: e1.id, prenom: 'Aminata', nom: 'Traoré', email: 'fidele@demo.bf', mdp, role: 'fidele', caisses: [], actif: true },
    { id: 'u_admin2', eglise_id: e2.id, prenom: 'Daniel', nom: 'Zongo', email: 'admin@siloe.bf', mdp, role: 'admin', caisses: [], actif: true },
    // Le pasteur Jean Kaboré dirige aussi l'Assemblée Siloé (deuxième adhésion, même compte)
    { id: 'u_pasteur_siloe', eglise_id: e2.id, prenom: 'Jean', nom: 'Kaboré', email: 'pasteur@demo.bf', mdp, role: 'pasteur', caisses: [], actif: true },
    // Une demande d'adhésion en attente de validation par l'administrateur
    { id: 'u_attente', eglise_id: e1.id, prenom: 'Moussa', nom: 'Ilboudo', email: 'moussa@demo.bf', mdp, role: 'fidele', caisses: [], actif: true, statut: 'en_attente', le: today() },
  ];
  // Une église inscrite, en attente de validation par l’administrateur de l’application
  const e3 = nouvelleEglise('egl_bethel', 'Église Béthel', 'Koudougou', 'en_attente');
  users.push({ id: 'u_admin3', eglise_id: e3.id, prenom: 'Rachel', nom: 'Yaméogo', email: 'admin@bethel.bf', mdp, role: 'admin', caisses: [], actif: true });

  const operations = [];
  let n = 0;
  const op = (egl, caisse, type, date, categorie_id, libelle, montant, extra = {}) =>
    operations.push({ id: `op_${++n}`, eglise_id: egl, caisse_id: caisse, type, date, categorie_id, libelle, montant, description: '', observations: '', cree_par: type === 'recette' ? 'u_tres' : 'u_tres', cree_le: date, ...extra });

  const fin = today();
  const debut = addMonths(ymOf(fin), -5);
  const mois = Array.from({ length: 6 }, (_, i) => addMonths(debut, i));

  for (const [egl, facteur] of [[e1.id, 1], [e2.id, 0.6]]) {
    const ce = C('eglise', egl), cv = C('vimab', egl), cc = C('construction', egl), cd = C('diacres', egl);
    for (const ym of mois) {
      // Dimanches du mois
      const [y, m] = ym.split('-').map(Number);
      for (let d = 1; d <= 31; d++) {
        const dt = new Date(y, m - 1, d);
        if (dt.getMonth() !== m - 1) break;
        const iso = `${ym}-${String(d).padStart(2, '0')}`;
        if (iso > fin) break;
        if (dt.getDay() === 0) {
          op(egl, ce, 'recette', iso, cat(ce, 'recette', 'Dîmes'), 'Dîmes du culte dominical', alea(140000, 320000) * facteur);
          op(egl, ce, 'recette', iso, cat(ce, 'recette', 'Offrandes du dimanche'), 'Offrandes du culte dominical', alea(55000, 120000) * facteur);
        }
      }
      const jour = (j) => { const iso = `${ym}-${String(j).padStart(2, '0')}`; return iso <= fin ? iso : null; };
      const add = (j, ...a) => { const d = jour(j); if (d) op(egl, ...a.slice(0, 2), d, ...a.slice(2)); };

      add(5, ce, 'depense', cat(ce, 'depense', 'Électricité et eau'), 'Facture SONABEL', alea(45000, 70000) * facteur);
      add(6, ce, 'depense', cat(ce, 'depense', 'Électricité et eau'), 'Facture ONEA', alea(12000, 22000) * facteur);
      add(12, ce, 'depense', cat(ce, 'depense', 'Aide sociale'), 'Soutien à une famille éprouvée', alea(25000, 60000) * facteur);
      add(18, ce, 'depense', cat(ce, 'depense', 'Entretien des locaux'), 'Nettoyage et petites réparations', alea(15000, 40000) * facteur);
      if (r() > 0.5) add(22, ce, 'depense', cat(ce, 'depense', 'Sonorisation et matériel'), 'Câbles et micros', alea(30000, 90000) * facteur);
      add(25, ce, 'depense', cat(ce, 'depense', 'Transport et déplacements'), 'Carburant visites pastorales', alea(20000, 35000) * facteur);

      for (const s of ['JAD', 'MEHB', 'ASC', 'Diacres']) add(3, cv, 'recette', cat(cv, 'recette', `Contribution ${s}`), `Contribution mensuelle ${s}`, alea(25000, 60000) * facteur);
      add(20, cv, 'depense', cat(cv, 'depense', 'Mission et évangélisation'), 'Sortie d\'évangélisation', alea(30000, 70000) * facteur);
      if (r() > 0.4) add(27, cv, 'depense', cat(cv, 'depense', 'Activités des structures'), 'Rencontre trimestrielle des structures', alea(20000, 50000) * facteur);

      add(8, cc, 'recette', cat(cc, 'recette', 'Offrandes volontaires mensuelles'), 'Offrande volontaire du mois', alea(150000, 300000) * facteur);
      add(14, cc, 'recette', cat(cc, 'recette', 'Dons individuels'), 'Don individuel', alea(50000, 250000, 5000) * facteur, { description: 'Don pour les travaux du sanctuaire' });
      add(16, cc, 'depense', cat(cc, 'depense', 'Ciment'), 'Achat de ciment (sacs)', alea(120000, 260000) * facteur);
      add(26, cc, 'depense', cat(cc, 'depense', 'Main-d\'œuvre'), 'Paiement des maçons', alea(80000, 160000) * facteur);

      add(4, cd, 'recette', cat(cd, 'recette', 'Dîmes des diacres'), 'Dîmes des diacres', alea(60000, 110000) * facteur);
      add(28, cd, 'depense', cat(cd, 'depense', 'Soutien pastoral'), 'Soutien au pasteur', alea(40000, 60000) * facteur);
    }
  }

  // Un transfert d'exemple : caisse église → construction
  const tId = 'tr_1', dTr = `${mois[3]}-15`;
  op(e1.id, C('eglise'), 'depense', dTr, `${e1.id}_transfert_depense`, 'Transfert vers Construction', 150000, { transfert_id: tId, observations: 'Décision du conseil' });
  op(e1.id, C('construction'), 'recette', dTr, `${e1.id}_transfert_recette`, 'Transfert depuis Caisse Église', 150000, { transfert_id: tId, observations: 'Décision du conseil' });

  const db = {
    version: 1,
    eglises: [e1, e2, e3],
    users,
    caisses: [...m1.caisses, ...m2.caisses, ...modeleEglise(e3.id).caisses],
    categories: [...m1.categories, ...m2.categories, ...modeleEglise(e3.id).categories],
    structures: [...structuresModele(e1.id), ...structuresModele(e2.id)],
    operations,
    clotures: [],
    journal: [],
    conversations: [...m1.conversations, ...m2.conversations],
    messages: [],
    lectures: [],
    appareils: [],
  };

  // Quelques messages d'exemple
  const il = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const msg = (conv, auteur, texte, h) => db.messages.push({ id: `msg_${++n}`, eglise_id: e1.id, conversation_id: conv, auteur_id: auteur, texte, le: il(h) });
  const cg = `${e1.id}_conv_generale`, ca = `${e1.id}_conv_annonces`;
  msg(ca, 'u_pasteur', 'Bien-aimés, le culte de dimanche commencera à 8 h 30. Venez nombreux avec vos familles !', 30);
  msg(cg, 'u_admin', 'Bonjour à tous, bienvenue dans la nouvelle messagerie de l\'église 🙏', 26);
  msg(cg, 'u_fidele', 'Merci ! C\'est très pratique.', 25);
  msg(cg, 'u_tres', 'Les offrandes de dimanche ont été enregistrées dans la Caisse Église.', 3);
  const privee = { id: 'conv_prive_demo', eglise_id: e1.id, type: 'prive', titre: '', membres: ['u_pasteur', 'u_tres'], cree_par: 'u_pasteur', cree_le: il(50) };
  db.conversations.push(privee);
  msg(privee.id, 'u_pasteur', 'Marie, peux-tu me préparer le rapport financier de septembre ?', 5);
  msg(privee.id, 'u_tres', 'Oui pasteur, je vous l\'envoie ce soir.', 4);
  const lecture = (conv, u, h) => db.lectures.push({ id: `${conv}__${u}`, eglise_id: e1.id, conversation_id: conv, user_id: u, recu: il(h), lu: il(h) });
  ['u_admin', 'u_pasteur', 'u_fidele', 'u_vimab'].forEach((u) => lecture(cg, u, 2.5));
  lecture(privee.id, 'u_pasteur', 3.5);
  // Fidèles : une fiche par compte, plus des fidèles sans compte
  db.fideles = db.users.filter((u) => u.role !== 'super_admin' && u.eglise_id).map((u) => ({ id: `f_${u.id}`, eglise_id: u.eglise_id, prenom: u.prenom, nom: u.nom, email: u.email, user_id: u.id, date_enregistrement: '2025-01-12', actif: true }));
  const sansCompte = [['Salif', 'Ouédraogo', 'M', '70 11 22 33'], ['Mariam', 'Kaboré', 'F', '76 44 55 66'], ['Boukary', 'Sawadogo', 'M', '71 23 45 67'], ['Rasmata', 'Zongo', 'F', '75 98 76 54'],
    ['Abdoulaye', 'Compaoré', 'M', '70 55 44 33'], ['Fatimata', 'Ilboudo', 'F', '78 12 34 56'], ['Ousmane', 'Traoré', 'M', '74 66 77 88'], ['Aïcha', 'Yaméogo', 'F', '77 21 43 65'],
    ['Pascal', 'Nikiéma', 'M', '72 31 41 51'], ['Clarisse', 'Bambara', 'F', '79 13 57 91']];
  sansCompte.forEach(([prenom, nom, sexe, telephone], i) => db.fideles.push({ id: `f_demo_${i}`, eglise_id: e1.id, prenom, nom, sexe, telephone, adresse: 'Bobo-Dioulasso', date_enregistrement: `2025-0${(i % 9) + 1}-15`, actif: true }));
  const st = (i) => `${e1.id}_str_${i}`;
  const membre = (sid, fid, depuis = '2025-02-01') => db.appartenances.push({ id: `ap_${sid}_${fid}`, eglise_id: e1.id, structure_id: sid, fidele_id: fid, depuis });
  db.appartenances = [];
  ['f_u_fidele', 'f_demo_0', 'f_demo_2', 'f_demo_4', 'f_demo_6', 'f_demo_8', 'f_u_vimab'].forEach((f) => membre(st(0), f)); // JAD
  ['f_u_tres', 'f_demo_1', 'f_demo_3', 'f_demo_5', 'f_demo_7', 'f_demo_9', 'f_u_fidele'].forEach((f) => membre(st(2), f)); // ASC
  ['f_u_admin', 'f_u_pasteur', 'f_demo_2', 'f_demo_4', 'f_demo_8'].forEach((f) => membre(st(3), f)); // MEHB
  ['f_u_fidele', 'f_demo_1', 'f_demo_6', 'f_demo_9'].forEach((f) => membre(st(5), f)); // Chorale
  const poste = (sid, intitule, ordre, fid, droits) => db.postes.push({ id: `po_${sid}_${ordre}`, eglise_id: e1.id, structure_id: sid, intitule, ordre, fidele_id: fid, depuis: '2025-02-01', droits, actif: true, historique: [] });
  db.postes = [];
  [['Président', 'f_demo_0', { voir_details: true, membres: true, bureau: true, activites: true }], ['Vice-président', 'f_demo_2', { voir_details: true }],
    ['Secrétaire général', 'f_u_fidele', { voir_details: true, membres: true, activites: true }], ['Secrétaire général adjoint', null, {}],
    ['Trésorier général', 'f_u_vimab', { voir_details: true, saisir: true, cotisations: true }], ['Trésorier général adjoint', null, {}], ['Membre conseiller', 'f_demo_6', {}]]
    .forEach(([t, f, d], i) => poste(st(0), t, i, f, d));
  [['Présidente', 'f_demo_1', { voir_details: true, membres: true, bureau: true, activites: true }], ['Secrétaire', 'f_demo_3', { voir_details: true, membres: true, activites: true }], ['Trésorière', 'f_u_tres', { voir_details: true, saisir: true, cotisations: true }]]
    .forEach(([t, f, d], i) => poste(st(2), t, i, f, d));
  db.postes[0].historique = [{ fidele_id: 'f_demo_8', depuis: '2023-01-01', jusqu_au: '2025-01-31' }];
  // Caisses propres à la JAD et à l'ASC, avec une cotisation mensuelle suivie
  const CATS_ST = { recette: ['Cotisations ordinaires', 'Cotisations exceptionnelles', 'Dons', 'Contributions des membres', 'Recettes des activités', 'Collectes spéciales'],
    depense: ['Transport', 'Restauration', 'Organisation d\'activités', 'Achat de matériel', 'Communication', 'Soutien aux membres'] };
  db.cotisations = []; db.paiements = [];
  [[0, 'JAD'], [2, 'ASC']].forEach(([i, nom]) => {
    const sid = st(i), cid = `c_${sid}`;
    db.caisses.push({ id: cid, eglise_id: e1.id, structure_id: sid, nom: `Caisse ${nom}`, description: `Caisse propre à ${nom}`, icone: 'Users', couleur: '#7A4FD6', image: 'communaute', visible_fideles: false, actif: true, ordre: 10 + i });
    for (const type of ['recette', 'depense']) CATS_ST[type].forEach((n, j) => db.categories.push({ id: `${cid}_${type}_${j}`, eglise_id: e1.id, caisse_id: cid, type, nom: n }));
    const cot = { id: `cot_${sid}`, eglise_id: e1.id, structure_id: sid, caisse_id: cid, nom: 'Cotisation mensuelle', montant: i === 0 ? 1000 : 1500, periodicite: 'mensuelle', debut: mois[3], concerne: 'tous', fideles: [], categorie_id: `${cid}_recette_0`, actif: true };
    db.cotisations.push(cot);
    const membres = db.appartenances.filter((a) => a.structure_id === sid).map((a) => a.fidele_id);
    mois.slice(3).forEach((ym, k) => membres.slice(0, membres.length - k - 1).forEach((fid) => {
      const opId = `op_cot_${sid}_${ym}_${fid}`, paId = `pay_${sid}_${ym}_${fid}`;
      const f = db.fideles.find((x) => x.id === fid);
      const date = `${ym}-05` <= fin ? `${ym}-05` : fin;
      db.operations.push({ id: opId, eglise_id: e1.id, caisse_id: cid, type: 'recette', date, montant: cot.montant, categorie_id: cot.categorie_id, libelle: `Cotisation mensuelle — ${f.prenom} ${f.nom}`, description: `Période : ${ym}`, cotisation_id: cot.id, paiement_id: paId, cree_par: 'u_tres', cree_le: date });
      db.paiements.push({ id: paId, eglise_id: e1.id, cotisation_id: cot.id, fidele_id: fid, periode: ym, montant: cot.montant, date, operation_id: opId, par: 'u_tres', le: date });
    }));
    op(e1.id, cid, 'depense', `${mois[4]}-20`, `${cid}_depense_0`, 'Transport sortie d\'évangélisation', 15000);
  });

  // Programmes et services : listes de fidèles et programmes réguliers, quelques séances planifiées
  const prog = modeleProgrammes(e1.id);
  const membresListe = { chantres: ['f_u_fidele', 'f_demo_1', 'f_demo_9', 'f_demo_6'], predicateurs: ['f_u_pasteur', 'f_demo_0', 'f_demo_4'], coordonnateurs: ['f_u_admin', 'f_demo_2'],
    interpretes: ['f_demo_3', 'f_demo_7'], enseignants: ['f_u_pasteur', 'f_demo_8'], accueil: ['f_demo_5', 'f_demo_9', 'f_u_tres'], parking: ['f_demo_2', 'f_demo_4', 'f_demo_6'],
    nettoyage: ['f_demo_1', 'f_demo_3', 'f_demo_5'], sonorisation: ['f_u_vimab', 'f_demo_8'] };
  db.listes = prog.listes.map((l) => ({ ...l, fideles: membresListe[l.id.split('_lst_')[1]] || [] }));
  db.programmes = prog.programmes;
  const lst = (k) => `${e1.id}_lst_${k}`;
  const prochain = (jour) => { const d = new Date(); d.setHours(0, 0, 0, 0); while (d.getDay() !== jour) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const seance = (p, aff, theme) => {
    const date = prochain(p.jour);
    const designes = [...new Set(Object.values(aff).flat())];
    return { id: `seance_${p.id}_${date}`, eglise_id: e1.id, structure_id: null, programme_id: p.id, titre: p.nom, type: p.nom, debut: `${date}T${p.heure}`, fin: `${date}T${p.fin}`, lieu: p.lieu,
      theme, description: theme, affectations: aff, fideles: designes, responsables: designes, destinataires: 'liste', statut: 'programmee', rappels: [1440, 120] };
  };
  const [cellule, , culte] = prog.programmes;

  // Activités d'exemple (dates relatives à aujourd'hui)
  const quand = (jours, heure) => { const d = new Date(); d.setDate(d.getDate() + jours); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${heure}`; };
  const maintenant = new Date(); const hh = (h) => `${String((maintenant.getHours() + h + 24) % 24).padStart(2, '0')}:00`;
  db.activites = [
    seance(cellule, { [lst('chantres')]: ['f_u_fidele', 'f_demo_1'], [lst('predicateurs')]: ['f_demo_0'], [lst('coordonnateurs')]: ['f_demo_2'], [lst('interpretes')]: ['f_demo_3'] }, 'La persévérance dans la prière'),
    seance(culte, { [lst('chantres')]: ['f_demo_9', 'f_demo_6'], [lst('predicateurs')]: ['f_u_pasteur'], [lst('coordonnateurs')]: ['f_u_admin'], [lst('interpretes')]: ['f_demo_7'], [lst('enseignants')]: ['f_demo_8'], [lst('accueil')]: ['f_demo_5', 'f_u_tres'], [lst('parking')]: ['f_demo_4'], [lst('nettoyage')]: ['f_demo_1', 'f_demo_3'], [lst('sonorisation')]: ['f_u_vimab'] }, 'Marcher par la foi — 2 Corinthiens 5'),
    { id: 'act_culte', eglise_id: e1.id, structure_id: null, titre: 'Culte d\'action de grâce', type: 'Culte spécial', debut: quand(3, '08:30'), fin: quand(3, '12:00'), lieu: 'Temple principal', description: 'Culte de reconnaissance pour la fin de l\'année scolaire.', destinataires: 'eglise', statut: 'programmee', rappels: [1440, 120], responsables: ['f_u_pasteur'] },
    { id: 'act_rep', eglise_id: e1.id, structure_id: st(5), titre: 'Répétition de la chorale', type: 'Répétition', debut: quand(1, '18:00'), fin: quand(1, '20:00'), lieu: 'Salle 2', destinataires: 'structure', statut: 'programmee', rappels: [120], responsables: [] },
    { id: 'act_jad', eglise_id: e1.id, structure_id: st(0), titre: 'Réunion du bureau JAD', type: 'Réunion de bureau', debut: quand(0, hh(-1)), fin: quand(0, hh(1)), lieu: 'Bureau pastoral', destinataires: 'structure', statut: 'programmee', rappels: [60], responsables: ['f_demo_0'] },
    { id: 'act_camp', eglise_id: e1.id, structure_id: st(0), titre: 'Camp de jeunesse', type: 'Camp', debut: quand(12, '07:00'), fin: quand(14, '17:00'), lieu: 'Centre de Koro', infos: 'Participation : 5 000 F CFA. Prévoir natte et moustiquaire.', destinataires: 'structure', statut: 'programmee', rappels: [10080, 1440], responsables: ['f_demo_0', 'f_u_fidele'] },
    { id: 'act_asc', eglise_id: e1.id, structure_id: st(2), titre: 'Visite aux malades', type: 'Activité sociale', debut: quand(-6, '15:00'), lieu: 'CHU Sourô Sanou', destinataires: 'structure', statut: 'realisee', rappels: [] },
    { id: 'act_evang', eglise_id: e1.id, structure_id: st(0), titre: 'Sortie d\'évangélisation', type: 'Évangélisation', debut: quand(-3, '16:00'), lieu: 'Secteur 25', destinataires: 'structure', statut: 'annulee', annulation: { motif: 'Forte pluie', par: 'u_admin', le: new Date().toISOString() }, rappels: [] },
  ];

  // Présences d'exemple (« en ligne », « vu il y a… »)
  db.presences = [['u_pasteur', 0.01], ['u_admin', 0.3], ['u_fidele', 2], ['u_vimab', 26]].map(([u, h]) => ({ id: `pr_${u}`, eglise_id: e1.id, user_id: u, vu_le: il(h) }));

  // Clôture des 3 premiers mois pour l'église de démo
  for (const ym of mois.slice(0, 3)) {
    for (const c of m1.caisses) db.clotures.push(cloturer(db, c.id, ym, 'u_admin'));
  }
  return db;
}

export function cloturer(db, caisseId, ym, userId) {
  const ops = db.operations.filter((o) => o.caisse_id === caisseId);
  const avant = ops.filter((o) => o.date < `${ym}-01`).reduce((s, o) => s + (o.type === 'recette' ? o.montant : -o.montant), 0);
  const duMois = ops.filter((o) => o.date.startsWith(ym));
  const recettes = duMois.filter((o) => o.type === 'recette').reduce((s, o) => s + o.montant, 0);
  const depenses = duMois.filter((o) => o.type === 'depense').reduce((s, o) => s + o.montant, 0);
  const caisse = db.caisses.find((c) => c.id === caisseId);
  return { id: `cl_${caisseId}_${ym}`, eglise_id: caisse.eglise_id, caisse_id: caisseId, mois: ym, ouverture: avant, recettes, depenses, cloture: avant + recettes - depenses, par: userId, le: today() };
}
