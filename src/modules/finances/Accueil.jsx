import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Info, Building2, Menu, Settings2, ChevronDown, Users } from 'lucide-react';
import MesEglises from '../../components/MesEglises';
import { useApp } from '../../state/AppContext';
import { useVue } from '../../state/useVue';
import { totaux, parMois } from '../../lib/finance';
import { fcfa, lastMonths, moisLabel, ymOf, num } from '../../lib/format';
import { Avatar, IMAGES, Icone, LogoEglise, Montant, Vide, useMenu } from '../../components/ui';
import { EtatSync } from '../../components/AppShell';
import { IconeNotifs } from '../info/Info';
import { useCompteur } from '../../lib/anim';
import { personnes, presence } from '../../lib/messagerie';
import { ficheDuCompte, structuresDuFidele, postesDuFidele, appartenancesStructure, fidelesEglise } from '../../lib/structures';
import { ROLES } from '../../lib/permissions';
import { BarresMois } from './Graphiques';
import { LigneOperation } from './Operations';
import { RaccourcisStructures, BlocStructure, BlocActivites, EnteteSection } from './AccueilBlocs';
import { Church } from 'lucide-react';

export default function Accueil() {
  const { user, eglise, db, can, actions, aujourdhui, mesAdhesions } = useApp();
  const [eglises, setEglises] = useState(false);
  const { caissesEglise: caisses, ops: toutesOps, restreint } = useVue();
  const ops = useMemo(() => toutesOps.filter((o) => caisses.some((c) => c.id === o.caisse_id)), [toutesOps, caisses]);
  const nav = useNavigate();
  const menu = useMenu();
  const moisCourant = ymOf(aujourdhui);

  const stats = useMemo(() => {
    const global = totaux(ops);
    const duMois = totaux(ops.filter((o) => ymOf(o.date) === moisCourant), { sansTransferts: true });
    const soldes = Object.fromEntries(caisses.map((c) => [c.id, totaux(ops.filter((o) => o.caisse_id === c.id)).solde]));
    const mois = parMois(ops, lastMonths(6, moisCourant), { sansTransferts: true });
    const recentes = [...ops].sort((a, b) => (b.date + (b.cree_le || '')).localeCompare(a.date + (a.cree_le || ''))).slice(0, 5);
    return { global, duMois, soldes, mois, recentes };
  }, [ops, caisses, moisCourant]);

  const soldeAnime = useCompteur(stats.global.solde);
  // Fidèles de l'église : toute personne (avec ou sans compte) est d'abord un fidèle ;
  // parmi eux, certains ont en plus une responsabilité (administrateur, pasteur, gestionnaire)
  const membres = useMemo(() => {
    const comptes = new Map(db.users.filter((u) => u.eglise_id === eglise?.id).map((u) => [u.id, u]));
    const liste = fidelesEglise(db, eglise?.id).filter((f) => {
      const u = f.user_id && comptes.get(f.user_id);
      return f.actif !== false && (!u || (u.role !== 'super_admin' && u.actif !== false && u.statut !== 'refuse' && u.statut !== 'en_attente'));
    });
    const role = (f) => (f.user_id && comptes.get(f.user_id)?.role) || 'fidele';
    const par = (r) => liste.filter((f) => role(f) === r).length;
    const roles = [['admin', 'ShieldCheck'], ['pasteur', 'BookOpen'], ['gestionnaire', 'Wallet']].map(([r, i]) => ({ r, i, n: par(r) }));
    return {
      total: liste.length, roles, simples: par('fidele'),
      sansCompte: liste.filter((f) => !f.user_id).length,
      enLigne: liste.filter((f) => f.user_id && presence(db, f.user_id).enLigne).length,
      attente: db.users.filter((u) => u.eglise_id === eglise?.id && u.statut === 'en_attente').length,
    };
  }, [db, eglise]);
  const voirMembres = can('fin.voir_details') || can('admin.utilisateurs');
  // Les structures du fidèle connecté passent en premier
  const maFiche = ficheDuCompte(db, user.id);
  const mesStructures = maFiche ? structuresDuFidele(db, maFiche.id).filter((s) => s.actif !== false) : [];
  const mesPostes = maFiche ? postesDuFidele(db, maFiche.id) : [];
  const mesCaisses = new Set(user.caisses || []);
  // Accueil adapté au profil : responsables, membres de structures, fidèles sans structure
  const responsable = ['admin', 'gestionnaire', 'pasteur', 'super_admin'].includes(user.role);
  const toutesStructures = can('acc.toutes_structures');
  const structuresEglise = (db.structures || []).filter((s) => s.eglise_id === eglise?.id && s.actif !== false);
  const structuresSuivies = toutesStructures ? structuresEglise : mesStructures;
  let avant = null, apres = null;
  if (responsable) {
    avant = <RaccourcisStructures structures={structuresEglise} />;
    apres = <>
      <BlocActivites />
      {structuresSuivies.length > 0 && <EnteteSection titre={toutesStructures ? 'Les structures' : 'Mes structures'} />}
      {structuresSuivies.map((s) => <BlocStructure key={s.id} structure={s} />)}
    </>;
  } else if (mesStructures.length) {
    avant = <>
      {mesStructures.map((s) => <BlocStructure key={s.id} structure={s} detaille />)}
      <BlocActivites titre="Activités de l'église" eglise max={3} />
      <EnteteSection titre="L'église" icone={Church} />
    </>;
  } else {
    avant = <>
      <BlocActivites titre="Activités de l'église" />
      <button className="carte-config" onClick={() => nav('/profil')}><Users size={22} /><span><strong>Rejoignez une structure</strong><small>JAD, ASC, chorale… Retrouvez ici leurs activités, leur caisse et leurs membres</small></span><ChevronRight size={18} /></button>
      <EnteteSection titre="L'église" icone={Church} />
    </>;
  }
  const gestionnaires = (cid) => db.users.filter((u) => u.eglise_id === eglise?.id && u.role === 'gestionnaire' && u.caisses?.includes(cid));

  return (
    <div className="accueil">
      <div className="barre-haut">
        <button className="salut" onClick={menu.ouvrir} aria-label="Ouvrir le menu">
          <span className="bouton-menu"><Menu size={22} /></span>
          <span><small>Bonjour,</small><strong>{user.prenom}</strong></span>
        </button>
        <span className="haut-droite"><EtatSync compact /><IconeNotifs /></span>
      </div>

      {avant}

      <section className="hero" style={{ backgroundImage: `url(${IMAGES.worship})` }}>
        <div className="hero-voile" />
        <svg className="hero-arc" viewBox="0 0 360 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M150 232 C 250 205, 330 150, 384 70" />
        </svg>
        <div className="hero-contenu">
          <span className="hero-label">Solde de toutes les caisses</span>
          <strong className="hero-montant">{num(soldeAnime)}<small> F CFA</small></strong>
          <button className="hero-eglise" onClick={() => setEglises(true)}>
            <LogoEglise eglise={eglise} taille={22} />{eglise?.nom}{(mesAdhesions.length > 1 || user.role === 'super_admin') && <ChevronDown size={14} />}
          </button>
          <div className="hero-mois">
            <span className="hero-chip"><ArrowDownLeft size={15} /> {fcfa(stats.duMois.recettes)}</span>
            <span className="hero-chip sortie"><ArrowUpRight size={15} /> {fcfa(stats.duMois.depenses)}</span>
          </div>
          <span className="hero-legende">{moisLabel(moisCourant)}, hors transferts</span>
        </div>
      </section>

      {can('admin.eglise') && eglise && !eglise.configuree && eglise.id === user.eglise_id && (
        <Link to="/configuration" className="carte-config"><Settings2 size={22} /><span><strong>Terminez la configuration de votre église</strong><small>Logo, structures, caisses, règles et équipe en quelques étapes</small></span><ChevronRight size={18} /></Link>
      )}
      <MesEglises ouverte={eglises} onFermer={() => setEglises(false)} />
      {restreint && (
        <p className="note"><Info size={16} /> Vous voyez les totaux des caisses de votre église. Le détail des opérations est réservé aux responsables.</p>
      )}

      <div className="section-tete">
        <h2>Caisses</h2>
        <span className="texte-doux petit">{caisses.length} actives</span>
      </div>
      <div className="carrousel">
        {caisses.map((c) => (
          <button key={c.id} className="carte-caisse" onClick={() => nav(`/caisses/${c.id}`)}>
            <div className="carte-caisse-image" style={{ backgroundImage: `url(${IMAGES[c.image] || IMAGES.communaute})` }}>
              <span className="carte-caisse-teinte" style={{ background: `linear-gradient(180deg, transparent 20%, ${c.couleur}E6)` }} />
              <span className="carte-caisse-icone"><Icone nom={c.icone} size={18} /></span>
              {mesCaisses.has(c.id) && <span className="carte-caisse-badge">Vous gérez</span>}
            </div>
            <div className="carte-caisse-corps">
              <span className="carte-caisse-nom">{c.nom}</span>
              <strong className={stats.soldes[c.id] < 0 ? 'negatif' : ''}>{fcfa(stats.soldes[c.id])}</strong>
              <span className="carte-caisse-equipe">
                {gestionnaires(c.id).slice(0, 3).map((u) => <Avatar key={u.id} user={u} taille={22} />)}
                {!restreint && gestionnaires(c.id).length === 0 && <small>Aucun gestionnaire</small>}
              </span>
            </div>
          </button>
        ))}
      </div>

      {voirMembres && membres.total > 0 && (
        <section className="bloc stats-membres" onClick={() => nav('/fideles')}>
          <div className="bloc-tete">
            <h2>Fidèles de l'église</h2>
            {membres.enLigne > 0 && <span className="en-ligne-maintenant"><i />{membres.enLigne} en ligne</span>}
          </div>
          <div className="stats-ligne">
            <div className="stats-total"><strong>{membres.total}</strong><small>fidèle{membres.total > 1 ? 's' : ''}</small></div>
            <div className="stats-dont">
              <small>dont</small>
              <div className="stats-roles">
                {membres.roles.map((x) => (
                  <div key={x.r} className="stat-role" style={{ '--c': ROLES[x.r].couleur }}>
                    <span><Icone nom={x.i} size={16} /></span><b>{x.n}</b><small>{ROLES[x.r].court}{x.n > 1 ? 's' : ''}</small>
                  </div>
                ))}
                <div className="stat-role" style={{ '--c': '#5B6B86' }}>
                  <span><Icone nom="Users" size={16} /></span><b>{membres.sansCompte}</b><small>sans compte</small>
                </div>
              </div>
            </div>
          </div>
          <div className="stats-barre">
            {membres.roles.filter((x) => x.n).map((x) => <i key={x.r} style={{ flex: x.n, background: ROLES[x.r].couleur }} />)}
            {membres.simples > 0 && <i style={{ flex: membres.simples, background: ROLES.fidele.couleur }} />}
          </div>
          {membres.attente > 0 && <p className="stats-attente">{membres.attente} demande{membres.attente > 1 ? 's' : ''} d'adhésion en attente</p>}
        </section>
      )}

      {can('fin.voir_graphiques') && (
        <section className="bloc">
          <div className="bloc-tete">
            <h2>Recettes et dépenses</h2>
            <div className="legende-ligne"><span><i className="pt bleu" />Recettes</span><span><i className="pt or" />Dépenses</span></div>
          </div>
          <BarresMois donnees={stats.mois} />
        </section>
      )}

      {can('fin.voir_details') && (
        <section className="bloc bloc-liste">
          <div className="bloc-tete">
            <h2>Dernières opérations</h2>
            <Link to="/operations" className="lien">Tout voir <ChevronRight size={16} /></Link>
          </div>
          {stats.recentes.length ? stats.recentes.map((o) => <LigneOperation key={o.id} o={o} caisse={caisses.find((c) => c.id === o.caisse_id)} />) : (
            <Vide icone="Receipt" titre="Aucune opération" texte="Les recettes et dépenses saisies apparaîtront ici." />
          )}
        </section>
      )}

      {restreint && (
        <section className="bloc">
          <h2>Ce mois-ci</h2>
          <div className="duo">
            <div><small>Recettes</small><Montant valeur={stats.duMois.recettes} type="recette" signe={false} /></div>
            <div><small>Dépenses</small><Montant valeur={stats.duMois.depenses} type="depense" signe={false} /></div>
          </div>
        </section>
      )}
      {apres}
    </div>
  );
}
