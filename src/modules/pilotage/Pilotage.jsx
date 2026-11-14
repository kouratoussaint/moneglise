// Tableaux de bord et rapport annuel : l'église entière (consolidé église + structures) ou une structure
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Printer } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { useVue } from '../../state/useVue';
import { perimetres, finances, fideles, cotisations, activites, tauxPresence, arret } from '../../lib/pilotage';
import { LIBELLES_STATUT } from '../../lib/activites';
import { nomFidele, postesStructure } from '../../lib/structures';
import { PERIODICITES } from '../../lib/cotisations';
import { fcfa, num, moisLabel, dateFr } from '../../lib/format';
import { exporterRapportAnnuel } from '../../lib/exporter';
import { EnTete, PastilleCaisse, Segmente, Vide } from '../../components/ui';
import { BarresMois, Anneau, CourbeEffectif } from '../finances/Graphiques';

const ONGLETS = [{ v: 'finances', l: 'Finances' }, { v: 'fideles', l: 'Fidèles' }, { v: 'cotisations', l: 'Cotisations' }, { v: 'activites', l: 'Activités' }];
const pct = (v) => (v === null || v === undefined ? '—' : `${v} %`);
const VERT = [14, 159, 110], ROUGE = [217, 71, 90], NAVY = [11, 42, 102];

export default function Pilotage() {
  const { db, user, can, egliseId, eglise, aujourdhui } = useApp();
  const { caisses, ops } = useVue();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const pers = useMemo(() => perimetres(db, user, can, egliseId), [db, user, can, egliseId]);
  const pid = pers.some((x) => x.id === params.get('p')) ? params.get('p') : pers[0]?.id;
  const per = pers.find((x) => x.id === pid);
  const sid = per?.structure?.id || null;
  const anneeCourante = Number(aujourdhui.slice(0, 4));
  const [annee, setAnnee] = useState(anneeCourante);
  const [onglet, setOnglet] = useState(params.get('onglet') || 'finances');
  const [envoi, setEnvoi] = useState(false);

  // Années proposées : depuis la première opération ou activité enregistrée
  const annees = useMemo(() => {
    const premiere = Math.min(anneeCourante, ...ops.map((o) => Number(o.date.slice(0, 4))), ...(db.activites || []).filter((a) => a.eglise_id === egliseId && a.debut).map((a) => Number(a.debut.slice(0, 4))));
    const l = [];
    for (let a = anneeCourante; a >= premiere && l.length < 15; a--) l.push(a);
    return l;
  }, [ops, db.activites, egliseId, anneeCourante]);

  const caissesPer = useMemo(() => caisses.filter((c) => (sid ? c.structure_id === sid : true)), [caisses, sid]);
  const fi = useMemo(() => finances(db, ops, caissesPer, annee), [db, ops, caissesPer, annee]);
  const fid = useMemo(() => fideles(db, egliseId, sid, annee), [db, egliseId, sid, annee]);
  const cot = useMemo(() => cotisations(db, egliseId, sid, annee), [db, egliseId, sid, annee]);
  const act = useMemo(() => activites(db, egliseId, sid, annee), [db, egliseId, sid, annee]);

  if (!per) return <><EnTete titre="Tableaux de bord" /><Vide icone="BarChart3" titre="Aucun tableau de bord disponible" texte="Les tableaux de bord sont réservés aux responsables de l'église et aux bureaux des structures." /></>;

  const nomPer = sid ? per.nom : eglise.nom;
  const arreteAu = dateFr(arret(annee));
  const choisir = (id) => { const p = new URLSearchParams(params); p.set('p', id); setParams(p, { replace: true }); };
  const groupesCaisses = sid ? [{ titre: null, l: fi.parCaisse }] : [
    { titre: "Caisses de l'église", l: fi.parCaisse.filter((x) => !x.c.structure_id) },
    { titre: 'Caisses des structures', l: fi.parCaisse.filter((x) => x.c.structure_id) },
  ].filter((g) => g.l.length);
  const somme = (l, k) => l.reduce((s, x) => s + x[k], 0);

  const rapport = async (opts = {}) => {
    setEnvoi(true);
    try {
      await exporterRapportAnnuel({
        titre: `Rapport annuel ${annee}`, sousTitre: sid ? `${per.nom}` : 'Église et structures',
        eglise: eglise.nom, editePar: `${user.prenom} ${user.nom}`, base: `rapport_annuel_${annee}_${nomPer}`,
        signatures: sid ? ['Le secrétaire', 'Le trésorier', 'Le président'] : ['Le secrétaire', 'Le trésorier', 'Le pasteur'],
        sections: sectionsRapport({ db, annee, sid, per, fi, fid, cot, act, groupesCaisses, arreteAu }), ...opts,
      });
    } finally { setEnvoi(false); }
  };

  return (
    <div>
      <EnTete titre="Tableaux de bord" sousTitre={`${nomPer} · année ${annee}${annee === anneeCourante ? ` (au ${arreteAu})` : ''}`}
        actions={<button className="btn-icone" aria-label="Rapport annuel PDF" disabled={envoi} onClick={() => rapport({ partager: true })}><FileText size={20} /></button>} />
      <div className="outils">
        {pers.length > 1 && (
          <div className="puces defile">
            {pers.map((x) => <button key={x.id} className={`puce ${x.id === pid ? 'active' : ''}`} onClick={() => choisir(x.id)}>{x.eglise ? 'Toute l\'église' : x.nom}</button>)}
          </div>
        )}
        <div className="navigation-periode">
          <button className="btn-icone" aria-label="Année précédente" disabled={annee <= annees[annees.length - 1]} onClick={() => setAnnee(annee - 1)}>‹</button>
          <strong>Année {annee}</strong>
          <button className="btn-icone" aria-label="Année suivante" disabled={annee >= anneeCourante} onClick={() => setAnnee(annee + 1)}>›</button>
        </div>
        <Segmente valeur={onglet} onChange={setOnglet} options={ONGLETS} petit />
      </div>

      {onglet === 'finances' && (caissesPer.length === 0 ? <Vide icone="Wallet" titre="Aucune caisse consultable" texte="Le détail de cette caisse est réservé au bureau de la structure." /> : (
        <div className="pile">
          <div className="kpis">
            <div className="kpi"><small>Recettes {annee}</small><strong className="recette">{fcfa(fi.t.recettes)}</strong></div>
            <div className="kpi"><small>Dépenses {annee}</small><strong className="depense">{fcfa(fi.t.depenses)}</strong></div>
            <div className="kpi"><small>Résultat de l'année</small><strong className={fi.t.solde < 0 ? 'depense' : 'recette'}>{fcfa(fi.t.solde)}</strong></div>
            <div className="kpi"><small>Solde au {arreteAu}</small><strong>{fcfa(fi.cloture)}</strong></div>
          </div>
          {!sid && <p className="note petit">Consolidé : caisses de l'église et caisses des structures. Les transferts entre caisses ne sont comptés ni en recette ni en dépense.</p>}
          <section className="bloc">
            <div className="bloc-tete"><h2>Mois par mois</h2><div className="legende-ligne"><span><i className="pt bleu" />Recettes</span><span><i className="pt or" />Dépenses</span></div></div>
            <BarresMois donnees={fi.mois} />
          </section>
          <section className="bloc">
            <h2>Soldes des caisses</h2>
            <div className="tableau-defile">
              <table className="tableau compact">
                <thead><tr><th>Caisse</th><th className="droite">Au 1er janv.</th><th className="droite">Recettes</th><th className="droite">Dépenses</th><th className="droite">Solde</th></tr></thead>
                <tbody>
                  {groupesCaisses.map((g) => [
                    g.titre && <tr key={g.titre} className="tableau-groupe"><td colSpan={5}>{g.titre}</td></tr>,
                    ...g.l.map((x) => (
                      <tr key={x.c.id} onClick={() => nav(`/caisses/${x.c.id}`)}><td><span className="cellule-caisse"><PastilleCaisse caisse={x.c} taille={24} />{x.c.nom}</span></td><td className="droite">{num(x.ouverture)}</td><td className="droite recette">{num(x.recettes)}</td><td className="droite depense">{num(x.depenses)}</td><td className="droite"><b>{num(x.cloture)}</b></td></tr>
                    )),
                    g.titre && groupesCaisses.length > 1 && <tr key={`${g.titre}_t`} className="sous-total"><td>Sous-total</td><td className="droite">{num(somme(g.l, 'ouverture'))}</td><td className="droite">{num(somme(g.l, 'recettes'))}</td><td className="droite">{num(somme(g.l, 'depenses'))}</td><td className="droite"><b>{num(somme(g.l, 'cloture'))}</b></td></tr>,
                  ])}
                  {fi.parCaisse.length > 1 && <tr className="total"><td>Total {sid ? '' : 'consolidé'}</td><td className="droite">{num(fi.ouverture)}</td><td className="droite">{num(somme(fi.parCaisse, 'recettes'))}</td><td className="droite">{num(somme(fi.parCaisse, 'depenses'))}</td><td className="droite"><b>{num(fi.cloture)}</b></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          {fi.rec.length > 0 && <section className="bloc"><h2>Recettes par catégorie</h2><Anneau items={fi.rec} /></section>}
          {fi.dep.length > 0 && <section className="bloc"><h2>Dépenses par catégorie</h2><Anneau items={fi.dep} /></section>}
        </div>
      ))}

      {onglet === 'fideles' && (
        <div className="pile">
          <div className="kpis">
            <div className="kpi"><small>{sid ? 'Membres' : 'Fidèles actifs'}</small><strong>{fid.total}</strong></div>
            <div className="kpi"><small>{sid ? 'Entrées' : 'Enregistrés'} en {annee}</small><strong className="recette">+ {fid.entrees}</strong></div>
            {sid ? <div className="kpi"><small>Sorties en {annee}</small><strong className="depense">− {fid.sorties}</strong></div>
              : <div className="kpi"><small>Avec un compte</small><strong>{fid.avecCompte}</strong></div>}
            {sid ? <div className="kpi"><small>Au 1er janvier</small><strong>{fid.debut}</strong></div>
              : <div className="kpi"><small>Dans aucune structure</small><strong>{fid.sansStructure}</strong></div>}
          </div>
          <section className="bloc">
            <h2>Évolution {sid ? 'des membres' : 'du nombre de fidèles'}</h2>
            {fid.courbe.length ? <CourbeEffectif donnees={fid.courbe} label={sid ? 'Membres' : 'Fidèles'} /> : <p className="texte-doux">Pas encore de données pour cette année.</p>}
          </section>
          <section className="bloc">
            <h2>Répartition</h2>
            <div className="stats-ligne"><span><b>{fid.repartition.F}</b> femmes</span><span><b>{fid.repartition.M}</b> hommes</span>{fid.repartition.nc > 0 && <span><b>{fid.repartition.nc}</b> non renseigné(s)</span>}</div>
            {!sid && fid.structures.length > 0 && (
              <div className="tableau-defile marge-haut">
                <table className="tableau compact">
                  <thead><tr><th>Structure</th><th className="droite">Membres</th><th className="droite">Part</th></tr></thead>
                  <tbody>{fid.structures.map((x) => <tr key={x.s.id} onClick={() => choisir(x.s.id)}><td>{x.s.nom}</td><td className="droite">{x.n}</td><td className="droite">{fid.total ? Math.round((x.n / fid.total) * 100) : 0} %</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {onglet === 'cotisations' && (cot.lignes.length === 0 ? <Vide icone="HandCoins" titre="Aucune cotisation" texte={sid ? 'Cette structure n\'a pas encore de cotisation.' : 'Les structures n\'ont pas encore de cotisation.'} /> : (
        <div className="pile">
          <div className="kpis">
            <div className="kpi large"><small>Taux de cotisation {annee} · échéances au {arreteAu}</small><strong>{cot.taux} %</strong></div>
            <div className="kpi"><small>Attendu</small><strong>{fcfa(cot.attendu)}</strong></div>
            <div className="kpi"><small>Payé</small><strong className="recette">{fcfa(cot.paye)}</strong></div>
            <div className="kpi"><small>Reste à percevoir</small><strong className="depense">{fcfa(cot.reste)}</strong></div>
            <div className="kpi"><small>Encaissé en {annee}</small><strong>{fcfa(cot.encaisse)}</strong></div>
          </div>
          <section className="bloc bloc-liste">
            <h2>Par cotisation</h2>
            {cot.lignes.map((l) => (
              <button key={l.cot.id} className="ligne-user" onClick={() => nav(`/cotisations/${l.cot.id}`)}>
                <span className="jauge" style={{ '--p': `${l.taux}%` }}><b>{l.taux}%</b></span>
                <span className="ligne-user-texte"><strong>{l.cot.nom}{!sid && l.structure ? ` · ${l.structure.nom}` : ''}</strong>
                  <small>{PERIODICITES[l.cot.periodicite] || ''} · {l.aJour}/{l.fideles} à jour · reste {fcfa(l.reste)}</small></span>
              </button>
            ))}
          </section>
        </div>
      ))}

      {onglet === 'activites' && (
        <div className="pile">
          <div className="kpis">
            <div className="kpi"><small>Activités {annee}</small><strong>{act.total}</strong></div>
            <div className="kpi"><small>Réalisées</small><strong className="recette">{act.realisees}</strong></div>
            <div className="kpi"><small>Annulées / non tenues</small><strong className="depense">{act.annulees + act.nonTenues}</strong></div>
            <div className="kpi"><small>À venir</small><strong>{act.aVenir}</strong></div>
            <div className="kpi"><small>Taux de réalisation</small><strong>{pct(act.tauxRealisation)}</strong></div>
            <div className="kpi"><small>Présence moyenne</small><strong>{pct(act.presenceMoyenne)}</strong></div>
          </div>
          {act.realisees > act.pointees && <p className="note petit">{act.realisees - act.pointees} activité(s) réalisée(s) sans feuille de présence : ouvrez l'activité puis « Pointer les présences » pour suivre l'assiduité.</p>}
          {!sid && act.parStructure.length > 0 && (
            <section className="bloc">
              <h2>Par structure</h2>
              <div className="tableau-defile">
                <table className="tableau compact">
                  <thead><tr><th>Structure</th><th className="droite">Prévues</th><th className="droite">Réalisées</th><th className="droite">Annulées</th><th className="droite">Présence</th></tr></thead>
                  <tbody>{act.parStructure.map((x) => <tr key={x.s.id} onClick={() => choisir(x.s.id)}><td>{x.s.nom}</td><td className="droite">{x.total}</td><td className="droite">{x.realisees}</td><td className="droite">{x.annulees}</td><td className="droite">{pct(x.presence)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
          {act.assidus.length > 0 && (
            <section className="bloc bloc-liste">
              <h2>Assiduité des {sid ? 'membres' : 'fidèles'}</h2>
              {act.assidus.slice(0, 15).map((x) => (
                <button key={x.f.id} className="ligne-user" onClick={() => nav(`/fideles/${x.f.id}`)}>
                  <span className="jauge" style={{ '--p': `${x.taux}%` }}><b>{x.taux}%</b></span>
                  <span className="ligne-user-texte"><strong>{nomFidele(x.f)}</strong><small>Présent {x.present} fois sur {x.attendu}</small></span>
                </button>
              ))}
            </section>
          )}
          <section className="bloc bloc-liste">
            <h2>Activités de l'année</h2>
            {act.liste.length === 0 && <p className="texte-doux">Aucune activité en {annee}.</p>}
            {act.liste.map(({ a, st }) => {
              const t = tauxPresence(db, a);
              return (
                <button key={a.id} className="ligne-user" onClick={() => nav(`/activites/${a.id}`)}>
                  <span className="ligne-user-texte"><strong>{a.titre}</strong><small>{dateFr(a.debut.slice(0, 10))} · {LIBELLES_STATUT[st]}{!sid && a.structure_id ? ` · ${(db.structures || []).find((s) => s.id === a.structure_id)?.nom || ''}` : ''}{t !== null ? ` · présence ${t} %` : ''}</small></span>
                </button>
              );
            })}
          </section>
        </div>
      )}

      <div className="barre-action statique">
        <button className="btn btn-doux" disabled={envoi} onClick={() => rapport({ imprimer: true })}><Printer size={18} /> Imprimer</button>
        <button className="btn btn-primaire" disabled={envoi} onClick={() => rapport()}><FileText size={18} /> {envoi ? 'Préparation…' : `Rapport annuel ${annee} (PDF)`}</button>
      </div>
    </div>
  );
}

// Contenu du rapport annuel : mêmes chiffres que les tableaux de bord, mis en forme pour l'assemblée
function sectionsRapport({ db, annee, sid, per, fi, fid, cot, act, groupesCaisses, arreteAu }) {
  const qui = sid ? per.nom : "L'église";
  const sections = [];
  sections.push({
    titre: sid ? 'Les membres' : 'Les fidèles',
    texte: sid
      ? `Au ${arreteAu}, ${per.nom} compte ${fid.total} membre(s). ${fid.entrees} membre(s) l'ont rejointe en ${annee} et ${fid.sorties} l'ont quittée.`
      : `Au ${arreteAu}, l'église compte ${fid.total} fidèle(s) actif(s), dont ${fid.entrees} enregistré(s) en ${annee}. ${fid.avecCompte} fidèle(s) utilisent l'application ; ${fid.sansStructure} ne sont membres d'aucune structure.`,
    chiffres: [
      { label: sid ? 'Membres' : 'Fidèles actifs', valeur: num(fid.total), couleur: NAVY },
      { label: `${sid ? 'Entrées' : 'Nouveaux'} en ${annee}`, valeur: `+ ${num(fid.entrees)}`, couleur: VERT },
      { label: 'Femmes', valeur: num(fid.repartition.F) },
      { label: 'Hommes', valeur: num(fid.repartition.M) },
    ],
    tableaux: [
      { titre: 'Évolution mois par mois', colonnes: [{ titre: 'Mois' }, { titre: sid ? 'Membres' : 'Fidèles', align: 'right' }], lignes: fid.courbe.map((m) => [moisLabel(m.ym), num(m.n)]) },
      ...(!sid ? [{ titre: 'Membres par structure', colonnes: [{ titre: 'Structure' }, { titre: 'Membres', align: 'right' }], lignes: fid.structures.map((x) => [x.s.nom, num(x.n)]) }] : []),
    ],
  });
  if (sid) {
    const postes = postesStructure(db, sid);
    if (postes.length) sections.push({ titre: 'Le bureau', tableaux: [{ colonnes: [{ titre: 'Poste' }, { titre: 'Titulaire' }], lignes: postes.map((p) => [p.intitule, p.fidele_id ? nomFidele((db.fideles || []).find((f) => f.id === p.fidele_id)) : 'Vacant']) }] });
  }
  if (fi.parCaisse.length) {
    const lignesCaisses = groupesCaisses.flatMap((g) => [
      ...(g.titre && groupesCaisses.length > 1 ? [[g.titre, '', '', '', '']] : []),
      ...g.l.map((x) => [`${g.titre && groupesCaisses.length > 1 ? '   ' : ''}${x.c.nom}`, num(x.ouverture), num(x.recettes), num(x.depenses), num(x.cloture)]),
    ]);
    sections.push({
      titre: 'Les finances',
      texte: [`${qui === "L'église" ? "Pour l'ensemble de l'église (caisses de l'église et des structures)" : `Pour ${per.nom}`}, les recettes de ${annee} s'élèvent à ${fcfa(fi.t.recettes)} et les dépenses à ${fcfa(fi.t.depenses)}, soit un résultat de ${fcfa(fi.t.solde)}. Le solde disponible au ${arreteAu} est de ${fcfa(fi.cloture)}.`,
        ...(!sid && fi.parCaisse.length > 1 ? ['Les transferts entre caisses ne sont comptés ni en recette ni en dépense dans les totaux consolidés.'] : [])],
      chiffres: [
        { label: 'Solde au 1er janvier', valeur: fcfa(fi.ouverture) },
        { label: 'Recettes', valeur: fcfa(fi.t.recettes), couleur: VERT },
        { label: 'Dépenses', valeur: fcfa(fi.t.depenses), couleur: ROUGE },
        { label: `Solde au ${arreteAu}`, valeur: fcfa(fi.cloture), couleur: NAVY },
      ],
      tableaux: [
        { titre: 'Situation des caisses', totalDerniere: fi.parCaisse.length > 1, colonnes: [{ titre: 'Caisse' }, { titre: 'Au 1er janvier', align: 'right' }, { titre: 'Recettes', align: 'right' }, { titre: 'Dépenses', align: 'right' }, { titre: 'Solde', align: 'right' }],
          lignes: [...lignesCaisses, ...(fi.parCaisse.length > 1 ? [['Total', num(fi.ouverture), num(fi.parCaisse.reduce((s, x) => s + x.recettes, 0)), num(fi.parCaisse.reduce((s, x) => s + x.depenses, 0)), num(fi.cloture)]] : [])] },
        { titre: 'Mois par mois', colonnes: [{ titre: 'Mois' }, { titre: 'Recettes', align: 'right' }, { titre: 'Dépenses', align: 'right' }, { titre: 'Résultat', align: 'right' }],
          lignes: fi.mois.filter((m) => m.recettes || m.depenses).map((m) => [moisLabel(m.ym), num(m.recettes), num(m.depenses), num(m.solde)]) },
        { titre: 'Recettes par catégorie', colonnes: [{ titre: 'Catégorie' }, { titre: 'Montant', align: 'right' }, { titre: 'Part', align: 'right' }], lignes: fi.rec.map((x) => [x.categorie?.nom || 'Autre / N.P.', num(x.total), `${fi.t.recettes ? Math.round((x.total / fi.t.recettes) * 100) : 0} %`]) },
        { titre: 'Dépenses par catégorie', colonnes: [{ titre: 'Catégorie' }, { titre: 'Montant', align: 'right' }, { titre: 'Part', align: 'right' }], lignes: fi.dep.map((x) => [x.categorie?.nom || 'Autre / N.P.', num(x.total), `${fi.t.depenses ? Math.round((x.total / fi.t.depenses) * 100) : 0} %`]) },
      ],
    });
  }
  if (cot.lignes.length) {
    sections.push({
      titre: 'Les cotisations',
      texte: `Sur les échéances de ${annee} arrivées au ${arreteAu}, ${fcfa(cot.paye)} ont été payés sur ${fcfa(cot.attendu)} attendus, soit un taux de cotisation de ${cot.taux} %. Il reste ${fcfa(cot.reste)} à percevoir.`,
      chiffres: [{ label: 'Taux de cotisation', valeur: `${cot.taux} %`, couleur: NAVY }, { label: 'Attendu', valeur: fcfa(cot.attendu) }, { label: 'Payé', valeur: fcfa(cot.paye), couleur: VERT }, { label: 'Reste', valeur: fcfa(cot.reste), couleur: ROUGE }],
      tableaux: [{ colonnes: [{ titre: 'Cotisation' }, ...(!sid ? [{ titre: 'Structure' }] : []), { titre: 'À jour', align: 'right' }, { titre: 'Attendu', align: 'right' }, { titre: 'Payé', align: 'right' }, { titre: 'Taux', align: 'right' }],
        lignes: cot.lignes.map((l) => [l.cot.nom, ...(!sid ? [l.structure?.nom || '—'] : []), `${l.aJour}/${l.fideles}`, num(l.attendu), num(l.paye), `${l.taux} %`]) }],
    });
  }
  sections.push({
    titre: 'Les activités',
    texte: [`${act.total} activité(s) programmée(s) en ${annee} : ${act.realisees} réalisée(s), ${act.annulees} annulée(s), ${act.nonTenues} non tenue(s) et ${act.aVenir} à venir.${act.tauxRealisation !== null ? ` Taux de réalisation : ${act.tauxRealisation} %.` : ''}`,
      act.pointees ? `La présence a été relevée pour ${act.pointees} activité(s), avec une présence moyenne de ${act.presenceMoyenne} %.` : "Aucune feuille de présence n'a été remplie cette année."],
    chiffres: [{ label: 'Programmées', valeur: num(act.total) }, { label: 'Réalisées', valeur: num(act.realisees), couleur: VERT }, { label: 'Annulées / non tenues', valeur: num(act.annulees + act.nonTenues), couleur: ROUGE }, { label: 'Présence moyenne', valeur: pct(act.presenceMoyenne), couleur: NAVY }],
    tableaux: [
      ...(!sid ? [{ titre: 'Par structure', colonnes: [{ titre: 'Structure' }, { titre: 'Prévues', align: 'right' }, { titre: 'Réalisées', align: 'right' }, { titre: 'Annulées', align: 'right' }, { titre: 'Présence', align: 'right' }], lignes: act.parStructure.map((x) => [x.s.nom, num(x.total), num(x.realisees), num(x.annulees), pct(x.presence)]) }] : []),
      { titre: 'Liste des activités', colonnes: [{ titre: 'Date' }, { titre: 'Activité' }, ...(!sid ? [{ titre: 'Organisée par' }] : []), { titre: 'Statut' }, { titre: 'Présence', align: 'right' }],
        lignes: act.liste.map(({ a, st }) => [dateFr(a.debut.slice(0, 10)), a.titre, ...(!sid ? [a.structure_id ? (db.structures || []).find((s) => s.id === a.structure_id)?.nom || '—' : "L'église"] : []), LIBELLES_STATUT[st], pct(tauxPresence(db, a))]) },
      { titre: 'Les plus assidus', colonnes: [{ titre: 'Fidèle' }, { titre: 'Présences', align: 'right' }, { titre: 'Taux', align: 'right' }], lignes: act.assidus.slice(0, 20).map((x) => [nomFidele(x.f), `${x.present}/${x.attendu}`, `${x.taux} %`]) },
    ],
  });
  return sections;
}
