import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Wallet, Plus, ChevronRight, Tags, HandCoins, Pencil, RotateCcw, CheckCircle2, Circle, CircleDot, FileText, Trash2 } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { totaux } from '../../lib/finance';
import { fcfa, num, today, ymOf, dateFr } from '../../lib/format';
import { caisseDeStructure, nomFidele, droitStructure, ficheDuCompte } from '../../lib/structures';
import { PERIODICITES, periodes, libellePeriode, fidelesConcernes, situation, bilan, paiementsDe, repartir } from '../../lib/cotisations';
import { exporterPDF } from '../../lib/exporter';
import { Avatar, Champ, EnTete, Feuille, Interrupteur, Segmente, Vide } from '../../components/ui';

const avatarFidele = (db, f) => { const u = f?.user_id && db.users.find((x) => x.id === f.user_id); return { prenom: f?.prenom, nom: f?.nom, photo: u?.photo, role: u?.role || 'fidele' }; };

export function OngletCaisse({ structure }) {
  const { db, user, can, actions, notifier, aujourdhui } = useApp();
  const nav = useNavigate();
  const [cotis, setCotis] = useState(null);
  const [categories, setCategories] = useState(false);
  const caisse = caisseDeStructure(db, structure.id);
  if (!caisse) return (
    <div className="carte-bientot"><Wallet size={26} /><strong>Pas encore de caisse</strong>
      {can('admin.eglise') ? <><p>Créez la caisse de {structure.nom} : elle aura ses propres recettes, dépenses et catégories.</p><button className="btn btn-primaire" onClick={() => { actions.creerCaisseStructure(structure.id); notifier('Caisse créée'); }}>Créer la caisse</button></>
        : <p>L'administrateur de l'église doit créer la caisse de cette structure.</p>}
    </div>
  );
  const voirDetail = can('fin.voir_details', caisse.id);
  const ops = db.operations.filter((o) => o.caisse_id === caisse.id);
  const resumes = (db.resumes || []).filter((r) => r.caisse_id === caisse.id);
  const t = voirDetail || !resumes.length ? totaux(ops) : { recettes: resumes.reduce((s, r) => s + Number(r.recettes), 0), depenses: resumes.reduce((s, r) => s + Number(r.depenses), 0) };
  const solde = t.recettes - t.depenses;
  const mm = totaux(ops.filter((o) => ymOf(o.date) === ymOf(aujourdhui)));
  const cotisations = (db.cotisations || []).filter((c) => c.structure_id === structure.id && c.actif !== false);
  const gereCotis = droitStructure(db, user, can, structure.id, 'cotisations');
  const fiche = ficheDuCompte(db, user.id);

  return (
    <div className="pile">
      <div className="bilan-mois">
        <div className="bm-resultat"><small>Ce mois-ci</small><strong className={mm.solde < 0 ? 'negatif' : 'recette'}>{mm.solde >= 0 ? '+' : '−'} {fcfa(Math.abs(mm.solde))}</strong><span>Recettes moins dépenses</span></div>
        <div className="bm-solde"><small>Solde de la caisse</small><strong>{fcfa(solde)}</strong><span>C'est l'argent qui reste en caisse</span></div>
      </div>
      <div className="actions-rapides">
        {can('fin.saisir', caisse.id) && <button onClick={() => nav(`/operations/nouvelle?type=recette&caisse=${caisse.id}`)}><span className="pastille vert"><Plus size={20} /></span>Recette</button>}
        {can('fin.saisir', caisse.id) && <button onClick={() => nav(`/operations/nouvelle?type=depense&caisse=${caisse.id}`)}><span className="pastille or"><Plus size={20} /></span>Dépense</button>}
        <button onClick={() => nav(`/caisses/${caisse.id}`)}><span className="pastille bleu"><Wallet size={20} /></span>Caisse</button>
        {can('admin.categories', caisse.id) && <button onClick={() => setCategories(true)}><span className="pastille violet"><Tags size={20} /></span>Catégories</button>}
      </div>
      {!voirDetail && <p className="note">Vous voyez les totaux de la caisse. Le détail des opérations est réservé au bureau.</p>}

      <section className="bloc bloc-liste">
        <div className="bloc-tete"><h2><HandCoins size={17} /> Cotisations</h2>{gereCotis && <button className="lien" onClick={() => setCotis({ nom: '', montant: '', periodicite: 'hebdomadaire', debut_date: today(), fin_date: '', concerne: 'tous', fideles: [] })}><Plus size={16} /> Nouvelle</button>}</div>
        {cotisations.length === 0 && <p className="texte-doux petit">Aucune cotisation pour l'instant.</p>}
        {cotisations.map((c) => {
          const b = bilan(db, c);
          const mien = fiche && fidelesConcernes(db, c).some((f) => f.id === fiche.id) ? situation(db, c, fiche.id).reduce((s, x) => s + x.reste, 0) : null;
          return (
            <button key={c.id} className="ligne-user" onClick={() => nav(`/cotisations/${c.id}`)}>
              <span className="jauge" style={{ '--p': `${b.taux}%` }}><b>{b.taux}%</b></span>
              <span className="ligne-user-texte"><strong>{c.nom}</strong><small>{fcfa(c.montant)} · {PERIODICITES[c.periodicite]}{mien != null ? (mien ? ` · vous restez devoir ${fcfa(mien)}` : ' · vous êtes à jour') : ''}</small></span>
              <ChevronRight size={18} className="chevron" />
            </button>
          );
        })}
      </section>
      {cotis && <EditeurCotisation cotisation={cotis} structure={structure} caisse={caisse} onFermer={() => setCotis(null)} />}
      {categories && <CategoriesCaisse caisse={caisse} onFermer={() => setCategories(false)} />}
    </div>
  );
}

function EditeurCotisation({ cotisation, structure, caisse, onFermer }) {
  const { db, actions, notifier } = useApp();
  const nav = useNavigate();
  const [c, setC] = useState(() => ({ ...cotisation, montant: cotisation.montant ? num(cotisation.montant) : '' }));
  const recettes = db.categories.filter((x) => x.caisse_id === caisse.id && x.type === 'recette' && x.actif !== false);
  const membres = fidelesConcernes(db, { structure_id: structure.id, concerne: 'tous' });
  const enregistrer = () => {
    const montant = Number(String(c.montant).replace(/[^\d]/g, ''));
    if (!c.nom.trim() || !montant) return notifier('Indiquez le nom et le montant de la cotisation.', 'erreur');
    if (c.fin_date && c.debut_date && c.fin_date < c.debut_date) return notifier('La date de fin doit être après la date de début.', 'erreur');
    const id = actions.enregistrerCotisation({ ...c, nom: c.nom.trim(), montant, structure_id: structure.id, caisse_id: caisse.id, categorie_id: c.categorie_id || recettes.find((x) => /cotisation/i.test(x.nom))?.id || '' });
    notifier(cotisation.id ? 'Cotisation modifiée' : 'Cotisation créée');
    onFermer();
    if (!cotisation.id) nav(`/cotisations/${id}`);
  };
  return (
    <Feuille ouverte onFermer={onFermer} titre={cotisation.id ? 'Modifier la cotisation' : 'Nouvelle cotisation'}
      pied={<>{cotisation.id && <button className="btn btn-danger-doux" aria-label="Supprimer" onClick={() => { const r = actions.supprimerCotisation(cotisation.id); onFermer(); if (r.desactivee) notifier('Cotisation désactivée : elle a déjà des paiements (conservés)'); else { notifier('Cotisation supprimée', 'ok', 'depense', { annuler: () => actions.restaurer(r.corbeille) }); nav(-1); } }}><Trash2 size={18} /></button>}<button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button></>}>
      <div className="pile">
        <Champ label="Nom"><input value={c.nom} onChange={(e) => setC({ ...c, nom: e.target.value })} placeholder="Ex. Cotisation mensuelle, Cotisation camp 2026" /></Champ>
        <div className="deux-col">
          <Champ label="Montant (F CFA)"><input inputMode="numeric" value={c.montant} onChange={(e) => { const n = Number(e.target.value.replace(/[^\d]/g, '')); setC({ ...c, montant: n ? num(n) : '' }); }} /></Champ>
          <Champ label="Périodicité"><select value={c.periodicite} onChange={(e) => setC({ ...c, periodicite: e.target.value })}>{Object.entries(PERIODICITES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
        </div>
        {c.periodicite !== 'unique' && <div className="deux-col">
          <Champ label="Date de début"><input type="date" value={c.debut_date || (c.debut ? `${c.debut}-01` : '')} onChange={(e) => setC({ ...c, debut_date: e.target.value })} /></Champ>
          <Champ label="Date de fin (facultatif)"><input type="date" value={c.fin_date || ''} min={c.debut_date} onChange={(e) => setC({ ...c, fin_date: e.target.value })} /></Champ>
        </div>}
        {c.periodicite === 'hebdomadaire' && <p className="texte-doux petit">Une échéance chaque semaine à partir de la date de début. Un paiement couvre automatiquement la prochaine semaine due (et crée la suivante si tout est réglé).</p>}
        <Champ label="Catégorie de recette" aide="Chaque paiement crée une recette dans la caisse, dans cette catégorie.">
          <select value={c.categorie_id || ''} onChange={(e) => setC({ ...c, categorie_id: e.target.value })}><option value="">Automatique (Cotisations…)</option>{recettes.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select>
        </Champ>
        <Segmente valeur={c.concerne} onChange={(v) => setC({ ...c, concerne: v })} options={[{ v: 'tous', l: 'Tous les membres' }, { v: 'liste', l: 'Certains membres' }]} />
        {c.concerne === 'liste' && (
          <div className="puces enveloppe">{membres.map((f) => <button key={f.id} type="button" className={`puce ${c.fideles.includes(f.id) ? 'active' : ''}`} onClick={() => setC({ ...c, fideles: c.fideles.includes(f.id) ? c.fideles.filter((x) => x !== f.id) : [...c.fideles, f.id] })}>{nomFidele(f)}</button>)}</div>
        )}
        {cotisation.id && <Interrupteur label="Cotisation active" aide="Une cotisation désactivée n'est plus réclamée ; ses paiements sont conservés." actif={c.actif !== false} onChange={(v) => setC({ ...c, actif: v })} />}
      </div>
    </Feuille>
  );
}

function CategoriesCaisse({ caisse, onFermer }) {
  const { db, actions, notifier } = useApp();
  const nav = useNavigate();
  const [type, setType] = useState('recette');
  const [nouveau, setNouveau] = useState('');
  const cats = db.categories.filter((c) => c.caisse_id === caisse.id && c.type === type);
  const usage = (id) => db.operations.filter((o) => o.categorie_id === id).length;
  return (
    <Feuille ouverte onFermer={onFermer} titre={`Catégories · ${caisse.nom}`}>
      <div className="pile">
        <Segmente valeur={type} onChange={setType} options={[{ v: 'recette', l: 'Recettes' }, { v: 'depense', l: 'Dépenses' }]} />
        <div>
          {cats.map((c) => (
            <div key={c.id} className={`ligne-cat ${c.actif === false ? 'inactive' : ''}`}>
              <span><strong>{c.nom}</strong><small>{usage(c.id)} opération(s){c.actif === false ? ' · désactivée' : ''}</small></span>
              {usage(c.id) > 0 && <button className="btn-icone petit" aria-label="Voir les opérations" onClick={() => { onFermer(); nav(`/operations?caisse=${caisse.id}&categorie=${c.id}`); }}><ChevronRight size={17} /></button>}
              {c.actif === false
                ? <button className="btn btn-doux petit" onClick={() => actions.reactiverCategorie(c.id)}><RotateCcw size={14} /> Réactiver</button>
                : <button className="btn btn-doux petit" onClick={() => { const r = actions.supprimerCategorie(c.id); notifier(r?.desactivee ? 'Catégorie désactivée (déjà utilisée : historique conservé)' : 'Catégorie supprimée'); }}>{usage(c.id) ? 'Désactiver' : 'Supprimer'}</button>}
            </div>
          ))}
        </div>
        <div className="ajout-ligne">
          <input value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder={type === 'recette' ? 'Nouvelle catégorie de recette' : 'Nouvelle catégorie de dépense'} />
          <button className="btn btn-primaire petit" disabled={!nouveau.trim()} onClick={() => { actions.enregistrerCategorie({ caisse_id: caisse.id, type, nom: nouveau.trim() }); setNouveau(''); notifier('Catégorie ajoutée', 'ok', 'tic'); }}><Plus size={16} /></button>
        </div>
      </div>
    </Feuille>
  );
}

// Page de suivi d'une cotisation : qui a payé, qui reste devoir, enregistrement des paiements
export function SuiviCotisation() {
  const { id } = useParams();
  const { db, user, can, actions, notifier, eglise } = useApp();
  const nav = useNavigate();
  const [periode, setPeriode] = useState(null);
  const [paiement, setPaiement] = useState(null);
  const [edition, setEdition] = useState(false);
  const cot = (db.cotisations || []).find((c) => c.id === id);
  const lignes = useMemo(() => (cot ? fidelesConcernes(db, cot).map((f) => ({ f, s: situation(db, cot, f.id) })).sort((a, b) => nomFidele(a.f).localeCompare(nomFidele(b.f), 'fr')) : []), [db, cot]);
  if (!cot) return <><EnTete titre="Cotisation" /><Vide icone="HandCoins" titre="Cotisation introuvable" /></>;
  const structure = db.structures.find((s) => s.id === cot.structure_id);
  const caisse = db.caisses.find((c) => c.id === cot.caisse_id);
  const gere = droitStructure(db, user, can, cot.structure_id, 'cotisations');
  const pers = periodes(cot);
  const per = periode || pers[pers.length - 1];
  const b = bilan(db, cot);
  const fiche = ficheDuCompte(db, user.id);
  const visibles = gere || can('fin.voir_details', cot.caisse_id) ? lignes : lignes.filter((l) => l.f.id === fiche?.id);

  const exporter = async () => {
    await exporterPDF({
      titre: `Cotisation ${cot.nom}`, sousTitre: `${structure?.nom} · ${fcfa(cot.montant)} · ${PERIODICITES[cot.periodicite]} · ${libellePeriode(per)}`, eglise: eglise.nom, base: `cotisation_${cot.nom}`, partager: true,
      synthese: [{ label: 'Attendu', valeur: fcfa(b.attendu) }, { label: 'Payé', valeur: fcfa(b.paye), couleur: [14, 159, 110] }, { label: 'Reste à payer', valeur: fcfa(b.reste), couleur: [217, 71, 90] }],
      colonnes: [{ titre: 'Fidèle' }, { titre: `Payé (${libellePeriode(per)})`, align: 'right' }, { titre: 'Reste (période)', align: 'right' }, { titre: 'Reste total', align: 'right' }],
      lignes: visibles.map(({ f, s }) => { const x = s.find((y) => y.periode === per) || { paye: 0, reste: 0 }; return [nomFidele(f), num(x.paye), num(x.reste), num(s.reduce((t, y) => t + y.reste, 0))]; }),
      editePar: `${user.prenom} ${user.nom}`,
    });
  };

  return (
    <div>
      <EnTete titre={cot.nom} sousTitre={`${structure?.nom || ''} · ${fcfa(cot.montant)} · ${PERIODICITES[cot.periodicite]}`}
        actions={<>{gere && <button className="btn-icone" aria-label="Modifier" onClick={() => setEdition(true)}><Pencil size={20} /></button>}<button className="btn-icone" aria-label="Rapport PDF" onClick={exporter}><FileText size={20} /></button></>} />
      <div className="kpis">
        <div className="kpi"><small>Payé</small><strong className="recette">{fcfa(b.paye)}</strong></div>
        <div className="kpi"><small>Reste à payer</small><strong className="depense">{fcfa(b.reste)}</strong></div>
        <div className="kpi large"><small>{b.fideles} fidèle(s) concerné(s) · {b.enRetard} en retard</small><strong>{b.taux} % collecté</strong></div>
      </div>
      {pers.length > 1 && (
        <Champ label="Période"><select className="select-simple" value={per} onChange={(e) => setPeriode(e.target.value)}>{[...pers].reverse().map((p) => <option key={p} value={p}>{libellePeriode(p)}</option>)}</select></Champ>
      )}
      <section className="bloc bloc-liste">
        {visibles.length === 0 && <p className="texte-doux petit">Aucun fidèle concerné.</p>}
        {visibles.map(({ f, s }) => {
          const x = s.find((y) => y.periode === per) || { paye: 0, reste: cot.montant };
          const total = s.reduce((t, y) => t + y.reste, 0);
          const etat = x.reste === 0 ? 'paye' : x.paye > 0 ? 'partiel' : 'du';
          return (
            <button key={f.id} className="ligne-user" onClick={() => gere ? setPaiement({ f, periode: per, montant: x.reste || cot.montant }) : null}>
              <Avatar user={avatarFidele(db, f)} taille={38} />
              <span className="ligne-user-texte"><strong>{nomFidele(f)}</strong><small>{etat === 'paye' ? 'À jour pour cette période' : `Reste ${fcfa(x.reste)}`}{total > x.reste ? ` · total dû ${fcfa(total)}` : ''}</small></span>
              <span className={`etat-cotis ${etat}`}>{etat === 'paye' ? <CheckCircle2 size={20} /> : etat === 'partiel' ? <CircleDot size={20} /> : <Circle size={20} />}</span>
            </button>
          );
        })}
      </section>
      {paiement && <FeuillePaiement cot={cot} caisse={caisse} {...paiement} periodes={pers} onFermer={() => setPaiement(null)} />}
      {edition && <EditeurCotisation cotisation={cot} structure={structure} caisse={caisse} onFermer={() => setEdition(false)} />}
    </div>
  );
}

function FeuillePaiement({ cot, caisse, f, periode, montant, periodes: pers, onFermer }) {
  const { db, actions, notifier } = useApp();
  const [p, setP] = useState({ periode: '', montant: num(montant), date: today() });
  const historique = paiementsDe(db, cot.id).filter((x) => x.fidele_id === f.id).sort((a, b) => b.date.localeCompare(a.date));
  const m = Number(String(p.montant).replace(/[^\d]/g, ''));
  const apercu = !p.periode && m ? repartir(db, cot, f.id, m) : [];
  return (
    <Feuille ouverte onFermer={onFermer} titre={`${nomFidele(f)} · ${cot.nom}`}
      pied={<><button className="btn btn-doux" onClick={onFermer}>Fermer</button><button className="btn btn-primaire" onClick={() => {
        if (!m) return notifier('Indiquez le montant payé.', 'erreur');
        const r = actions.payerCotisation({ cotisation: cot, fidele: f, periode: p.periode || null, montant: m, date: p.date });
        if (typeof r === 'string') notifier(r, 'erreur'); else { notifier(`Paiement enregistré (${r.parts.map((x) => libellePeriode(x.periode)).join(', ')}) et recette ajoutée à ${caisse?.nom}`); onFermer(); }
      }}>Enregistrer le paiement</button></>}>
      <div className="pile">
        <div className="deux-col">
          <Champ label="Montant payé"><input inputMode="numeric" value={p.montant} onChange={(e) => { const n = Number(e.target.value.replace(/[^\d]/g, '')); setP({ ...p, montant: n ? num(n) : '' }); }} /></Champ>
          <Champ label="Date"><input type="date" value={p.date} max={today()} onChange={(e) => setP({ ...p, date: e.target.value })} /></Champ>
        </div>
        {cot.periodicite !== 'unique' && <Champ label="Affecter à"><select value={p.periode} onChange={(e) => setP({ ...p, periode: e.target.value })}><option value="">Automatique : prochaines échéances dues</option>{[...pers].reverse().map((x) => <option key={x} value={x}>{libellePeriode(x)}</option>)}</select></Champ>}
        {apercu.length > 0 && <p className="note">Ce paiement couvre : {apercu.map((x) => `${libellePeriode(x.periode)}${x.excedent ? ' (en plus)' : ''}`).join(', ')}.</p>}
        <p className="texte-doux petit">Le paiement crée automatiquement une recette dans {caisse?.nom}, liée à cette cotisation.</p>
        {historique.length > 0 && (
          <div>
            <span className="champ-label">Paiements déjà enregistrés</span>
            {historique.map((x) => (
              <div key={x.id} className="ligne-cat">
                <span><strong>{fcfa(x.montant)}</strong><small>{libellePeriode(x.periode)} · {dateFr(x.date)}</small></span>
                <button className="btn btn-doux petit" onClick={() => { const e = actions.annulerPaiement(x.id, 'Paiement de cotisation annulé'); notifier(e || 'Paiement annulé (la recette est annulée aussi)', e ? 'erreur' : 'ok'); }}>Annuler</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Feuille>
  );
}
