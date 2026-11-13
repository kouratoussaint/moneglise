import { useNavigate } from 'react-router-dom';
import { ChevronRight, CalendarDays, Users, Wallet, HandCoins } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { useVue } from '../../state/useVue';
import { totaux } from '../../lib/finance';
import { fcfa, ymOf } from '../../lib/format';
import { caisseDeStructure, appartenancesStructure, postesDuFidele, ficheDuCompte } from '../../lib/structures';
import { activitesVisibles, statutActivite } from '../../lib/activites';
import { fidelesConcernes, situation } from '../../lib/cotisations';
import { CarteActivite } from '../activites/Activites';
import { LigneOperation } from './Operations';
import { mesServices } from '../../lib/programmes';

// Raccourcis vers les structures (accueil des responsables)
export function RaccourcisStructures({ structures }) {
  const nav = useNavigate();
  if (!structures.length) return null;
  return (
    <>
      <div className="section-tete"><h2>Structures</h2><button className="lien" onClick={() => nav('/structures')}>Toutes <ChevronRight size={16} /></button></div>
      <div className="raccourcis-structures">
        {structures.map((s) => <button key={s.id} onClick={() => nav(`/structures/${s.id}`)}><span className="cs-sigle">{s.nom.slice(0, 4)}</span><small>{s.nom}</small></button>)}
      </div>
    </>
  );
}

// Situation d'une structure : caisse, prochaines activités, membres, cotisation due, dernières opérations
export function BlocStructure({ structure, detaille }) {
  const { db, user, can, aujourdhui } = useApp();
  const { ops: vues } = useVue();
  const nav = useNavigate();
  const caisse = caisseDeStructure(db, structure.id);
  const ops = caisse ? vues.filter((o) => o.caisse_id === caisse.id) : [];
  const t = totaux(ops);
  const mm = totaux(ops.filter((o) => ymOf(o.date) === ymOf(aujourdhui)));
  const fiche = ficheDuCompte(db, user.id);
  const poste = fiche && postesDuFidele(db, fiche.id).filter((p) => p.structure_id === structure.id).map((p) => p.intitule).join(', ');
  const activites = (db.activites || []).filter((a) => a.structure_id === structure.id && ['a_venir', 'en_cours'].includes(statutActivite(a))).sort((a, b) => a.debut.localeCompare(b.debut)).slice(0, 2);
  const du = fiche ? (db.cotisations || []).filter((c) => c.structure_id === structure.id && c.actif !== false && fidelesConcernes(db, c).some((f) => f.id === fiche.id))
    .reduce((s, c) => s + situation(db, c, fiche.id).reduce((x, y) => x + y.reste, 0), 0) : 0;
  const detail = caisse && can('fin.voir_details', caisse.id);
  const recentes = detaille && detail ? [...ops].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3) : [];
  return (
    <section className="bloc bloc-structure">
      <button className="bs-tete" onClick={() => nav(`/structures/${structure.id}`)}>
        <span className="cs-sigle">{structure.nom.slice(0, 4)}</span>
        <span><strong>{structure.nom}</strong><small>{poste || (fiche && appartenancesStructure(db, structure.id).some((a) => a.fidele_id === fiche.id) ? 'Membre' : 'Vue d\'ensemble')} · {appartenancesStructure(db, structure.id).length} membres</small></span>
        <ChevronRight size={18} className="chevron" />
      </button>
      {caisse && (
        <div className="bs-caisse">
          <div><small><Wallet size={13} /> Solde de la caisse</small><strong className={t.solde < 0 ? 'negatif' : ''}>{fcfa(t.solde)}</strong></div>
          <div><small>Ce mois-ci</small><span className="recette">+ {fcfa(mm.recettes)}</span><span className="depense">− {fcfa(mm.depenses)}</span></div>
        </div>
      )}
      {du > 0 && <button className="bs-cotis" onClick={() => nav(`/structures/${structure.id}`)}><HandCoins size={16} /> Votre cotisation : reste {fcfa(du)} à payer</button>}
      {activites.length > 0 ? activites.map((a) => <CarteActivite key={a.id} a={a} db={db} compact />) : <p className="texte-doux petit bs-vide"><CalendarDays size={14} /> Aucune activité prévue</p>}
      {recentes.map((o) => <LigneOperation key={o.id} o={o} caisse={caisse} />)}
    </section>
  );
}

// Activités à venir et en cours (pour les fidèles sans structure : activités de l'église en priorité)
export function BlocActivites({ titre = 'Prochaines activités', eglise: seulementEglise, max = 4 }) {
  const { db, user, can, egliseId } = useApp();
  const nav = useNavigate();
  const liste = activitesVisibles(db, user, can, egliseId)
    .filter((a) => ['a_venir', 'en_cours'].includes(statutActivite(a)) && (!seulementEglise || !a.structure_id || a.destinataires === 'eglise'))
    .sort((a, b) => a.debut.localeCompare(b.debut)).slice(0, max);
  return (
    <>
      <div className="section-tete"><h2>{titre}</h2><button className="lien" onClick={() => nav('/activites')}>Toutes <ChevronRight size={16} /></button></div>
      {liste.length ? <div className="liste-activites">{liste.map((a) => <CarteActivite key={a.id} a={a} db={db} />)}</div>
        : <p className="texte-doux petit bloc bs-vide"><CalendarDays size={14} /> Aucune activité prévue pour le moment.</p>}
    </>
  );
}

export function EnteteSection({ titre, icone: I = Users }) {
  return <div className="separateur-section"><I size={16} /><span>{titre}</span></div>;
}

// Mes prochains services (programmes : chantre, prédicateur, accueil…)
export function MesServices() {
  const { db, user } = useApp();
  const nav = useNavigate();
  const fiche = ficheDuCompte(db, user?.id);
  const liste = mesServices(db, fiche?.id).slice(0, 3);
  if (!liste.length) return null;
  return (
    <section className="bloc mes-services">
      <div className="bloc-tete"><h2>Vous servez bientôt</h2></div>
      {liste.map(({ seance, listes }) => {
        const d = new Date(`${seance.debut}:00`);
        return (
          <button key={seance.id} className="ligne-service" onClick={() => nav(`/activites/${seance.id}`)}>
            <span className="ca-date"><b>{d.getDate()}</b><small>{d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small></span>
            <span className="ligne-user-texte"><strong>{seance.titre}</strong><small>{d.toLocaleDateString('fr-FR', { weekday: 'long' })} à {seance.debut.slice(11, 16)} · {listes.join(', ')}</small></span>
          </button>
        );
      })}
    </section>
  );
}
