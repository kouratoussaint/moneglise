// Activités : statut calculé à partir des dates, en respectant les annulations.
import { estMembreDe, ficheDuCompte } from './structures';

export const TYPES_ACTIVITE = ['Réunion de bureau', 'Répétition', 'Culte spécial', 'Camp', 'Retraite spirituelle', 'Conférence', 'Formation', 'Évangélisation', 'Activité sociale', 'Autre'];
export const RAPPELS = [{ m: 10080, l: '1 semaine avant' }, { m: 2880, l: '2 jours avant' }, { m: 1440, l: 'La veille' }, { m: 180, l: '3 heures avant' }, { m: 120, l: '2 heures avant' }, { m: 60, l: '1 heure avant' }, { m: 30, l: '30 minutes avant' }];

const date = (s) => (s ? new Date(s.length === 16 ? `${s}:00` : s) : null);
export const finDe = (a) => date(a.fin) || (a.debut ? new Date(date(a.debut).getTime() + 2 * 3600000) : null);

// a_venir, en_cours, realisee, annulee, non_tenue
export function statutActivite(a, maintenant = new Date()) {
  if (a.statut === 'annulee') return 'annulee';
  if (a.statut === 'non_tenue') return 'non_tenue';
  const d = date(a.debut);
  if (d && maintenant < d) return 'a_venir';
  if (d && maintenant < finDe(a)) return 'en_cours';
  return 'realisee';
}
export const LIBELLES_STATUT = { a_venir: 'À venir', en_cours: 'En cours', realisee: 'Réalisée', annulee: 'Annulée', non_tenue: 'N\'a pas eu lieu' };

export function activitesVisibles(db, user, can, egliseId) {
  const tout = user?.role === 'super_admin' || can('admin.eglise') || can('acc.toutes_structures');
  const fiche = ficheDuCompte(db, user?.id);
  return (db.activites || []).filter((a) => a.eglise_id === egliseId && (tout || !a.structure_id || a.destinataires === 'eglise'
    || estMembreDe(db, user, a.structure_id) || (fiche && ((a.fideles || []).includes(fiche.id) || (a.responsables || []).includes(fiche.id)))));
}

export const formatDebut = (a) => {
  const d = date(a.debut);
  if (!d) return '';
  const j = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${j} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};
