import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, LockOpen, CheckCircle2, FileText, Share2, CircleDashed, X, Hourglass } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { useVue } from '../../state/useVue';
import { clotureDe, resumeMois, totaux, parMois, parCategorie, reouverturePossible } from '../../lib/finance';
import { fcfa, num, moisLabel, ymOf, addMonths } from '../../lib/format';
import { exporterPDF, partagerTexte } from '../../lib/exporter';
import { Champ, Confirmation, EnTete, Feuille, PastilleCaisse, Segmente, Vide } from '../../components/ui';
import { BarresMois, Anneau } from './Graphiques';
import { BilanMois } from './Caisse';

export function Clotures() {
  const { db, can, actions, notifier, aujourdhui, eglise, user } = useApp();
  const { caisses: visibles, detail } = useVue();
  const caisses = visibles.filter((c) => detail(c) || can('fin.cloturer', c.id));
  const [params] = useSearchParams();
  const [caisseId, setCaisseId] = useState(params.get('caisse') || caisses[0]?.id);
  const [confirm, setConfirm] = useState(null);
  const [demande, setDemande] = useState(null);
  const [motif, setMotif] = useState('');
  const c = caisses.find((x) => x.id === caisseId);
  const estSuper = user.role === 'super_admin';
  const delai = Number(eglise?.parametres?.delai_reouverture ?? 3);

  const mois = useMemo(() => {
    if (!c) return [];
    const dates = db.operations.filter((o) => o.caisse_id === c.id).map((o) => o.date).sort();
    const debut = dates.length ? ymOf(dates[0]) : ymOf(aujourdhui);
    const out = [];
    for (let m = ymOf(aujourdhui); m >= debut; m = addMonths(m, -1)) out.push(m);
    return out.map((ym) => ({ ym, cl: clotureDe(db, c.id, ym), r: resumeMois(db, c.id, ym), enCours: ym === ymOf(aujourdhui) }));
  }, [db, c, aujourdhui]);

  // On ne peut clôturer un mois que si le mois précédent l'est déjà
  const premierOuvert = [...mois].reverse().find((m) => !m.cl && !m.enCours)?.ym;
  const apres = (ym) => mois.filter((m) => m.cl && m.ym > ym).map((m) => moisLabel(m.ym));
  const demandes = (db.demandes || []).filter((d) => d.eglise_id === eglise.id && d.statut === 'en_attente');
  const enAttente = (ym) => demandes.find((d) => d.caisse_id === c?.id && d.mois === ym);
  const peutTraiter = can('fin.rouvrir') || estSuper;

  return (
    <div>
      <EnTete titre="Clôtures mensuelles" sousTitre={`Un mois clôturé ne peut plus être modifié · réouverture possible ${delai} mois après la clôture`} />
      {peutTraiter && demandes.length > 0 && (
        <section className="bloc bloc-liste bloc-attente">
          <div className="bloc-tete"><h2><LockOpen size={16} /> Demandes de réouverture</h2></div>
          {demandes.map((d) => {
            const qui = db.users.find((u) => u.id === d.demandeur);
            return (
              <div key={d.id} className="ligne-user">
                <span className="ligne-user-texte"><strong>{moisLabel(d.mois)} · {db.caisses.find((x) => x.id === d.caisse_id)?.nom}</strong><small>{qui ? `${qui.prenom} ${qui.nom}` : 'Un membre'} : « {d.motif} »</small></span>
                <button className="btn-rond refuser" aria-label="Refuser" onClick={() => { actions.traiterDemande(d.id, false); notifier('Demande refusée'); }}><X size={18} /></button>
                <button className="btn-rond accepter" aria-label="Accepter" onClick={() => { actions.traiterDemande(d.id, true); notifier(`${moisLabel(d.mois)} rouvert`); }}><CheckCircle2 size={18} /></button>
              </div>
            );
          })}
        </section>
      )}
      <div className="puces defile">
        {caisses.map((x) => (
          <button key={x.id} className={`puce ${x.id === caisseId ? 'active' : ''}`} onClick={() => setCaisseId(x.id)}>{x.nom}</button>
        ))}
      </div>
      {!c ? <Vide icone="Wallet" titre="Aucune caisse" /> : (
        <div className="liste-mois">
          {mois.map(({ ym, cl, r, enCours }) => {
            const possible = cl && reouverturePossible(eglise, cl, estSuper);
            return (
              <div key={ym} className={`mois-carte ${cl ? 'ferme' : enCours ? 'en-cours' : ''}`}>
                <div className="mois-tete">
                  <span className="mois-statut">{cl ? <Lock size={16} /> : enCours ? <CircleDashed size={16} /> : <LockOpen size={16} />}</span>
                  <strong>{moisLabel(ym)}</strong>
                  <span className="mois-etat">{cl ? 'Clôturé' : enCours ? 'En cours' : 'À clôturer'}</span>
                </div>
                <div className="mois-chiffres">
                  <div><small>Ouverture</small><span>{num(r.ouverture)}</span></div>
                  <div><small>Recettes</small><span className="recette">+ {num(r.recettes)}</span></div>
                  <div><small>Dépenses</small><span className="depense">− {num(r.depenses)}</span></div>
                  <div><small>Solde</small><b>{num(r.cloture)}</b></div>
                </div>
                {cl && <p className="texte-doux petit">Clôturé le {cl.le.split('-').reverse().join('/')} par {(() => { const u = db.users.find((x) => x.id === cl.par); return u ? `${u.prenom} ${u.nom}` : '—'; })()}</p>}
                {!cl && !enCours && can('fin.cloturer', c.id) && (
                  <button className="btn btn-primaire btn-plein" disabled={ym !== premierOuvert} onClick={() => setConfirm({ type: 'cloturer', ym })}>
                    <CheckCircle2 size={18} /> {ym === premierOuvert ? 'Clôturer ce mois' : 'Clôturez d\'abord les mois précédents'}
                  </button>
                )}
                {cl && peutTraiter && (possible
                  ? <button className="btn btn-doux btn-plein" onClick={() => setConfirm({ type: 'rouvrir', ym })}><LockOpen size={18} /> Rouvrir ce mois</button>
                  : <p className="texte-doux petit">Délai de réouverture dépassé : seul l’administrateur de l’application peut rouvrir ce mois.</p>)}
                {cl && !peutTraiter && can('fin.cloturer', c.id) && (enAttente(ym)
                  ? <p className="alerte"><Hourglass size={16} /> Demande envoyée, en attente.{enAttente(ym).demandeur === user.id && <button className="lien" onClick={() => { const r = actions.annulerDemande(enAttente(ym).id); notifier('Demande annulée', 'ok', 'tic', { annuler: () => actions.restaurer(r.corbeille) }); }}> Annuler</button>}</p>
                  : <button className="btn btn-doux btn-plein" onClick={() => { setDemande(ym); setMotif(''); }}><LockOpen size={18} /> Demander la réouverture</button>)}
              </div>
            );
          })}
        </div>
      )}
      <Confirmation ouverte={!!confirm} onFermer={() => setConfirm(null)}
        titre={confirm?.type === 'cloturer' ? `Clôturer ${confirm && moisLabel(confirm.ym)} ?` : `Rouvrir ${confirm && moisLabel(confirm.ym)} ?`}
        message={confirm?.type === 'cloturer' ? `Les opérations de ${c?.nom} pour ce mois seront verrouillées. Le solde de clôture devient le solde d'ouverture du mois suivant.`
          : confirm && apres(confirm.ym).length ? `Attention : ${apres(confirm.ym).join(', ')} ${apres(confirm.ym).length > 1 ? 'seront aussi rouverts' : 'sera aussi rouvert'}, car leurs soldes dépendent de ce mois. Il faudra les clôturer à nouveau dans l'ordre.` : 'Les opérations de ce mois pourront à nouveau être modifiées. Pensez à le clôturer de nouveau.'}
        libelle={confirm?.type === 'cloturer' ? 'Clôturer' : 'Rouvrir'}
        onConfirmer={() => {
          if (confirm.type === 'cloturer') { actions.cloturerMois(c.id, confirm.ym); notifier(`${moisLabel(confirm.ym)} clôturé`); }
          else { actions.rouvrirMois(c.id, confirm.ym); notifier(`${moisLabel(confirm.ym)} rouvert`); }
        }} />
      <Feuille ouverte={!!demande} onFermer={() => setDemande(null)} titre={`Rouvrir ${demande ? moisLabel(demande) : ''} ?`}
        pied={<><button className="btn btn-doux" onClick={() => setDemande(null)}>Annuler</button><button className="btn btn-primaire" disabled={motif.trim().length < 5} onClick={() => { actions.demanderReouverture(c.id, demande, motif.trim()); notifier('Demande envoyée'); setDemande(null); }}>Envoyer la demande</button></>}>
        <Champ label="Motif de la demande" aide="Expliquez ce qui doit être corrigé : la demande est envoyée aux personnes autorisées à rouvrir.">
          <textarea rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. Une dépense du 12 a été saisie avec un mauvais montant" />
        </Champ>
      </Feuille>
    </div>
  );
}

const PERIODES = [{ v: 'mois', l: 'Mois' }, { v: 'trimestre', l: '3 mois' }, { v: '6mois', l: '6 mois' }, { v: 'annee', l: 'Année' }, { v: 'perso', l: 'Libre' }];
const DUREE = { mois: 1, trimestre: 3, '6mois': 6 };

export function Rapports() {
  const { db, eglise, can, aujourdhui, user } = useApp();
  const { caisses: visibles, ops: vues, detail } = useVue();
  const caisses = visibles.filter(detail);
  const ops = vues.filter((o) => caisses.some((c) => c.id === o.caisse_id));
  // « Toutes » = les caisses de l'église ; chaque caisse de structure se consulte séparément
  const caissesEglise = caisses.filter((c) => !c.structure_id);
  const actuel = ymOf(aujourdhui);
  const [periode, setPeriode] = useState('mois');
  const [debut, setDebut] = useState(actuel);
  const [finPerso, setFinPerso] = useState(actuel);
  const [caisseId, setCaisseId] = useState(() => (caissesEglise.length ? 'toutes' : caisses[0]?.id));
  const [envoi, setEnvoi] = useState(false);

  // Mois proposés : du premier mois ayant des opérations jusqu'au mois en cours
  const moisDispo = useMemo(() => {
    const premier = ops.reduce((m, o) => (o.date < m ? o.date : m), `${actuel}-01`).slice(0, 7);
    const l = [];
    for (let m = actuel; m >= premier && l.length < 120; m = addMonths(m, -1)) l.push(m);
    return l;
  }, [ops, actuel]);
  const annees = [...new Set(moisDispo.map((m) => m.slice(0, 4)))];

  const choisirPeriode = (v) => {
    setPeriode(v);
    if (v === 'annee') setDebut(`${actuel.slice(0, 4)}-01`);
    else if (v === 'perso') { setDebut(addMonths(actuel, -2)); setFinPerso(actuel); }
    else setDebut(addMonths(actuel, -(DUREE[v] - 1)));
  };

  let listeMois;
  if (periode === 'annee') listeMois = Array.from({ length: 12 }, (_, i) => `${debut.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`);
  else if (periode === 'perso') {
    const [a, b] = debut <= finPerso ? [debut, finPerso] : [finPerso, debut];
    listeMois = [];
    for (let m = a; m <= b && listeMois.length < 36; m = addMonths(m, 1)) listeMois.push(m);
  } else listeMois = Array.from({ length: DUREE[periode] }, (_, i) => addMonths(debut, i));
  const dernier = listeMois[listeMois.length - 1];
  const titrePeriode = periode === 'mois' ? moisLabel(listeMois[0]) : periode === 'annee' ? `Année ${debut.slice(0, 4)}` : `${moisLabel(listeMois[0])} – ${moisLabel(dernier)}`;
  const pas = periode === 'annee' ? 12 : 1;
  const decaler = (k) => { setDebut(addMonths(debut, k * pas)); if (periode === 'perso') setFinPerso(addMonths(finPerso, k)); };
  const finFenetre = periode === 'annee' ? `${debut.slice(0, 4)}-12` : dernier;

  const r = useMemo(() => {
    const set = new Set(listeMois);
    const choisies = caisseId === 'toutes' ? caissesEglise : caisses.filter((c) => c.id === caisseId);
    const ids = new Set(choisies.map((c) => c.id));
    const dansPeriode = ops.filter((o) => ids.has(o.caisse_id) && set.has(ymOf(o.date)));
    const d1 = `${listeMois[0]}-01`;
    const parCaisse = choisies.map((c) => {
      const avant = totaux(ops.filter((o) => o.caisse_id === c.id && o.date < d1)).solde;
      const t = totaux(dansPeriode.filter((o) => o.caisse_id === c.id));
      return { c, ouverture: avant, ...t, cloture: avant + t.solde };
    });
    return {
      t: totaux(dansPeriode, { sansTransferts: caisseId === 'toutes' }),
      mois: parMois(dansPeriode, listeMois, { sansTransferts: caisseId === 'toutes' }),
      rec: parCategorie(db, dansPeriode, 'recette'),
      dep: parCategorie(db, dansPeriode, 'depense'),
      parCaisse,
      nb: dansPeriode.length,
    };
  }, [ops, caisses, caisseId, listeMois.join(), db]);

  const nomSel = caisseId === 'toutes' ? 'Toutes les caisses de l\'église' : caisses.find((c) => c.id === caisseId)?.nom;
  // Solde en fin de période (ce qui reste en caisse), distinct du résultat de la période
  const soldeFin = r.parCaisse.reduce((s, x) => s + x.cloture, 0);
  const finLabel = (() => { const [a, m] = (periode === 'annee' ? `${debut.slice(0, 4)}-12` : dernier).split('-').map(Number); const j = new Date(a, m, 0).getDate(); return `${j}/${String(m).padStart(2, '0')}/${a}`; })();
  const caissiers = db.users.filter((u) => u.role === 'gestionnaire' && u.eglise_id === eglise.id && (caisseId === 'toutes' ? caissesEglise.some((c) => u.caisses?.includes(c.id)) : u.caisses?.includes(caisseId))).map((u) => `${u.prenom} ${u.nom}`);
  const pdf = async (opts = {}) => {
    setEnvoi(true);
    try {
      await exporterPDF({
        titre: `Rapport financier — ${titrePeriode}`, sousTitre: `${nomSel} · ${r.nb} opération(s)`, eglise: eglise.nom, base: `rapport_${titrePeriode}`, ...opts,
        synthese: [{ label: 'Recettes', valeur: fcfa(r.t.recettes), couleur: [14, 159, 110] }, { label: 'Dépenses', valeur: fcfa(r.t.depenses), couleur: [217, 71, 90] }, { label: 'Résultat de la période', valeur: fcfa(r.t.solde), couleur: r.t.solde < 0 ? [217, 71, 90] : [14, 159, 110] }, { label: `Solde au ${finLabel}`, valeur: fcfa(soldeFin), couleur: [11, 42, 102] }],
        caissiers, editePar: `${user.prenom} ${user.nom}`,
        phrase: `Résultat de la période : ${fcfa(r.t.solde)} (recettes moins dépenses). Solde au ${finLabel} : ${fcfa(soldeFin)}, c'est l'argent qui reste en caisse.`,
        colonnes: [{ titre: 'Caisse' }, { titre: 'Solde d\'ouverture', align: 'right' }, { titre: 'Recettes', align: 'right' }, { titre: 'Dépenses', align: 'right' }, { titre: 'Solde de clôture', align: 'right' }],
        lignes: [
          ...r.parCaisse.map((x) => [x.c.nom, num(x.ouverture), num(x.recettes), num(x.depenses), num(x.cloture)]),
          ...(r.parCaisse.length > 1 ? [['Total', num(r.parCaisse.reduce((s, x) => s + x.ouverture, 0)), num(r.parCaisse.reduce((s, x) => s + x.recettes, 0)), num(r.parCaisse.reduce((s, x) => s + x.depenses, 0)), num(r.parCaisse.reduce((s, x) => s + x.cloture, 0))]] : []),
          ['', '', '', '', ''],
          ['Recettes par catégorie', '', '', '', ''],
          ...r.rec.map((x) => [`   ${x.categorie?.nom || '—'}`, '', num(x.total), '', '']),
          ['Dépenses par catégorie', '', '', '', ''],
          ...r.dep.map((x) => [`   ${x.categorie?.nom || '—'}`, '', '', num(x.total), '']),
        ],
      });
    } finally { setEnvoi(false); }
  };
  const resumeTexte = () => partagerTexte(`${eglise.nom} — Rapport ${titrePeriode}\n${nomSel}\n\nRecettes : ${fcfa(r.t.recettes)}\nDépenses : ${fcfa(r.t.depenses)}\nRésultat : ${fcfa(r.t.solde)}\n\n${r.parCaisse.map((x) => `• ${x.c.nom} : solde ${fcfa(x.cloture)}`).join('\n')}\n— Mon Église`);

  return (
    <div>
      <EnTete titre="Rapports" retour={false} actions={can('fin.exporter') && <>
        <button className="btn-icone" aria-label="Partager le résumé" onClick={resumeTexte}><Share2 size={20} /></button>
        <button className="btn-icone" aria-label="Rapport PDF" disabled={envoi} onClick={() => pdf({ partager: true })}><FileText size={20} /></button>
      </>} />
      <div className="outils">
        <Segmente valeur={periode} onChange={choisirPeriode} options={PERIODES} />
        <div className="navigation-periode">
          <button className="btn-icone" aria-label="Période précédente" onClick={() => decaler(-1)}>‹</button>
          <strong>{titrePeriode}</strong>
          <button className="btn-icone" aria-label="Période suivante" disabled={finFenetre >= actuel} onClick={() => decaler(1)}>›</button>
        </div>
        <div className="choix-periode">
          {periode === 'annee' ? (
            <label><span>Année</span>
              <select value={debut.slice(0, 4)} onChange={(e) => setDebut(`${e.target.value}-01`)}>{annees.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            </label>
          ) : (
            <label><span>{periode === 'mois' ? 'Mois' : 'Du mois de'}</span>
              <select value={debut} onChange={(e) => setDebut(e.target.value)}>{moisDispo.map((m) => <option key={m} value={m}>{moisLabel(m)}</option>)}</select>
            </label>
          )}
          {periode === 'perso' && (
            <label><span>Au mois de</span>
              <select value={finPerso} onChange={(e) => setFinPerso(e.target.value)}>{moisDispo.map((m) => <option key={m} value={m}>{moisLabel(m)}</option>)}</select>
            </label>
          )}
          {(periode === 'trimestre' || periode === '6mois') && <p className="texte-doux petit">jusqu'à {moisLabel(dernier).toLowerCase()} ({DUREE[periode]} mois)</p>}
        </div>
        <div className="puces defile">
          {caissesEglise.length > 0 && <button className={`puce ${caisseId === 'toutes' ? 'active' : ''}`} onClick={() => setCaisseId('toutes')}>Toutes (église)</button>}
          {caisses.map((c) => <button key={c.id} className={`puce ${caisseId === c.id ? 'active' : ''}`} onClick={() => setCaisseId(c.id)}>{c.nom}</button>)}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><small>Recettes</small><strong className="recette">{fcfa(r.t.recettes)}</strong></div>
        <div className="kpi"><small>Dépenses</small><strong className="depense">{fcfa(r.t.depenses)}</strong></div>
      </div>
      <BilanMois resultat={r.t.solde} solde={soldeFin} mois={titrePeriode.toLowerCase()} fin={finLabel} />

      {listeMois.length > 1 && (
        <section className="bloc">
          <div className="bloc-tete"><h2>Par mois</h2><div className="legende-ligne"><span><i className="pt bleu" />Recettes</span><span><i className="pt or" />Dépenses</span></div></div>
          <BarresMois donnees={r.mois} />
        </section>
      )}

      <section className="bloc">
        <h2>Soldes des caisses</h2>
        <div className="tableau-defile">
          <table className="tableau compact">
            <thead><tr><th>Caisse</th><th className="droite">Ouverture</th><th className="droite">Recettes</th><th className="droite">Dépenses</th><th className="droite">Clôture</th></tr></thead>
            <tbody>
              {r.parCaisse.map((x) => (
                <tr key={x.c.id}><td><span className="cellule-caisse"><PastilleCaisse caisse={x.c} taille={24} />{x.c.nom}</span></td><td className="droite">{num(x.ouverture)}</td><td className="droite recette">{num(x.recettes)}</td><td className="droite depense">{num(x.depenses)}</td><td className="droite"><b>{num(x.cloture)}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {r.rec.length > 0 && <section className="bloc"><h2>Recettes par catégorie</h2><Anneau items={r.rec} /></section>}
      {r.dep.length > 0 && <section className="bloc"><h2>Dépenses par catégorie</h2><Anneau items={r.dep} /></section>}
      {r.nb === 0 && <Vide icone="BarChart3" titre="Aucune opération sur cette période" texte="Changez de période ou de caisse." />}
      {can('fin.exporter') && (
        <div className="barre-action statique">
          <button className="btn btn-doux" disabled={envoi} onClick={() => pdf({ imprimer: true })}>Imprimer</button>
          <button className="btn btn-primaire" disabled={envoi} onClick={() => pdf()}>Télécharger le PDF</button>
        </div>
      )}
    </div>
  );
}
