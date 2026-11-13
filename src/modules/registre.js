// Registre des modules d'Mon Église.
// Pour ajouter un volet : créer son dossier dans src/modules, ses routes dans App.jsx,
// ses droits dans lib/permissions.js, puis passer "disponible" à true ici.
export const MODULES = [
  { cle: 'finances', titre: 'Finances', texte: 'Caisses, recettes, dépenses, clôtures', icone: 'Wallet', couleur: '#1F5FD6', disponible: true, lien: '/' },
  { cle: 'institutions', titre: 'Institutions financières', texte: 'Comptes en banque et en microfinance', icone: 'Landmark', couleur: '#0B2A66', disponible: false },
  { cle: 'membres', titre: 'Fidèles', texte: 'Fiches des fidèles et appartenances', icone: 'Users', couleur: '#0E9F6E', disponible: true, lien: '/fideles' },
  { cle: 'structures', titre: 'Structures', texte: 'Membres et bureaux (JAD, ASC, MEHB…)', icone: 'Network', couleur: '#7A4FD6', disponible: true, lien: '/structures' },
  { cle: 'programmes', titre: 'Programmes et services', texte: 'Cultes, prières, listes et planning', icone: 'CalendarDays', couleur: '#C98A06', disponible: true, lien: '/programmes' },
  { cle: 'activites', titre: 'Activités', texte: 'À venir, en cours, réalisées, annulées', icone: 'CalendarDays', couleur: '#D9475A', disponible: true, lien: '/activites' },
];
