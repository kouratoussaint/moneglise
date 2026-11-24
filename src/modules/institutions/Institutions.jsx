// Institutions financières : comptes de l'église et des structures en banque ou en microfinance
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Landmark, Pencil, ArrowDownToLine, ArrowUpFromLine, Scale, Search, Check, Paperclip, Camera, X, FileText, ExternalLink, Trash2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { TYPES_COMPTE, TYPES_MOUVEMENT, comptesVisibles, comptesEglise, mouvementsDe, soldeCompte, rapprochement, peutGererComptes, peutSaisirCompte, peutValiderCompte, nomCompte, numeroMasque, signe, totauxCompte } from '../../lib/institutions';
import { fidelesEglise, nomFidele, droitStructure } from '../../lib/structures';
import { fcfa, num, dateFr, today } from '../../lib/format';
import { exporterPDF } from '../../lib/exporter';
import { Avatar, Champ, Confirmation, EnTete, Feuille, Interrupteur, Segmente, Vide, lirePiece } from '../../components/ui';

const couleurSigne = (m) => (signe(m) > 0 ? 'recette' : signe(m) < 0 ? 'depense' : '');

export default function Institutions() {
  const { db, user, can, egliseId } = useApp();
  const nav = useNavigate();
  const [edition, setEdition] = useState(null);
  const [inactifs, setInactifs] = useState(false);
  const tous = comptesVisibles(db, user, can, egliseId);
  const fermes = comptesEglise(db, egliseId, true).filter((c) => c.actif === false && peutGererComptes(db, user, can, c.structure_id));
  const structuresGerees = (db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false && peutGererComptes(db, user, can, s.id));
  const peutCreer = peutGererComptes(db, user, can, null) || structuresGerees.length > 0;
  const groupes = [
    { titre: "Comptes de l'église", l: tous.filter((c) => !c.structure_id) },
    ...(db.structures || []).filter((s) => s.eglise_id === egliseId).map((s) => ({ titre: `Comptes · ${s.nom}`, l: tous.filter((c) => c.structure_id === s.id) })),
  ].filter((g) => g.l.length);
  const total = tous.reduce((s, c) => s + soldeCompte(db, c), 0);

  return (
    <div>
      <EnTete titre="Institutions financières" sousTitre="Comptes en banque et en microfinance"
        actions={peutCreer && <button className="btn-icone" aria-label="Ouvrir un compte" onClick={() => setEdition({})}><Plus size={22} /></button>} />
      {tous.length === 0 ? (
        <Vide icone="Landmark" titre="Aucun compte enregistré"
          texte="Enregistrez ici les comptes de l'église ou des structures dans une banque ou une microfinance (ex. MICRO AID) pour suivre les versements, retraits, frais et relevés."
          action={peutCreer && <button className="btn btn-primaire" onClick={() => setEdition({})}><Plus size={18} /> Enregistrer un compte</button>} />
      ) : (
        <div className="pile">
          <div className="carte-solde">
            <small>Total sur les comptes</small>
            <strong>{fcfa(total)}</strong>
            <span>{tous.length} compte{tous.length > 1 ? 's' : ''} · hors espèces des caisses</span>
          </div>
          {groupes.map((g) => (
            <section key={g.titre} className="bloc bloc-liste">
              <h2>{g.titre}</h2>
              {g.l.map((c) => {
                const r = rapprochement(db, c);
                const attente = mouvementsDe(db, c.id).filter((m) => m.statut === 'a_valider').length;
                return (
                  <button key={c.id} className="ligne-user" onClick={() => nav(`/institutions/${c.id}`)}>
                    <span className="pastille-inst"><Landmark size={20} /></span>
                    <span className="ligne-user-texte">
                      <strong>{c.institution}</strong>
                      <small>{TYPES_COMPTE[c.type] || ''}{c.intitule ? ` · ${c.intitule}` : ''}{c.numero ? ` · ${numeroMasque(c.numero)}` : ''}</small>
                      {r && r.ecart !== 0 && <small className="depense">Écart avec le relevé : {fcfa(r.ecart)}</small>}
                      {attente > 0 && <small className="texte-or">{attente} mouvement(s) à valider</small>}
                    </span>
                    <b className="montant-ligne">{fcfa(soldeCompte(db, c))}</b>
                  </button>
                );
              })}
            </section>
          ))}
          {fermes.length > 0 && <button className="lien centre" onClick={() => setInactifs(!inactifs)}>{inactifs ? 'Masquer' : 'Afficher'} les comptes fermés ({fermes.length})</button>}
          {inactifs && fermes.map((c) => <button key={c.id} className="ligne-user inactif" onClick={() => nav(`/institutions/${c.id}`)}><span className="ligne-user-texte"><strong>{nomCompte(c)}</strong><small>Compte fermé</small></span></button>)}
          <p className="note petit">Un versement fait sortir l'argent d'une caisse vers le compte, un retrait le fait revenir en caisse. Ce ne sont ni des recettes ni des dépenses : le total de l'église ne change pas.</p>
        </div>
      )}
      {edition && <EditeurCompte compte={edition} structures={structuresGerees} onFermer={() => setEdition(null)} />}
    </div>
  );
}

export function FicheCompte() {
  const { id } = useParams();
  const { db, user, can, actions, notifier, eglise } = useApp();
  const nav = useNavigate();
  const [edition, setEdition] = useState(null);
  const [mvt, setMvt] = useState(null);
  const [filtre, setFiltre] = useState('tous');
  const c = (db.comptes || []).find((x) => x.id === id);
  const peut = c && peutSaisirCompte(db, user, can, c);
  const mvts = useMemo(() => (c ? mouvementsDe(db, c.id) : []), [db, c]);
  if (!c || !peutVoir(db, user, can, c)) return <><EnTete titre="Compte" /><Vide icone="Landmark" titre="Compte introuvable" texte="Ce compte n'existe pas ou vous n'y avez pas accès." /></>;

  const structure = c.structure_id && (db.structures || []).find((s) => s.id === c.structure_id);
  const r = rapprochement(db, c);
  const solde = soldeCompte(db, c);
  const an = today().slice(0, 4);
  const t = totauxCompte(db, c, `${an}-01-01`, `${an}-12-31`);
  const liste = mvts.filter((m) => filtre === 'tous' || (filtre === 'entrees' ? signe(m) > 0 : filtre === 'sorties' ? signe(m) < 0 : m.type === 'releve'));
  const valider = peutValiderCompte(db, user, can, c);
  const signataires = (c.signataires || []).map((fid) => (db.fideles || []).find((f) => f.id === fid)).filter(Boolean);
  const caissiers = (c.responsables || []).map((uid) => db.users.find((u) => u.id === uid)).filter(Boolean);

  const releve = () => {
    let s = Number(c.solde_initial) || 0;
    const lignes = [...mvts].reverse().map((m) => { s += signe(m) * m.montant; return { ...m, solde: m.type === 'releve' ? s : s }; }).reverse();
    exporterPDF({
      titre: `Relevé interne · ${c.institution}`, sousTitre: `${c.intitule || ''}${c.numero ? ` · n° ${c.numero}` : ''}${structure ? ` · ${structure.nom}` : ''}`,
      eglise: eglise.nom, editePar: `${user.prenom} ${user.nom}`, base: `releve_${c.institution}`,
      synthese: [['Solde initial', fcfa(Number(c.solde_initial) || 0)], ['Solde actuel', fcfa(solde)], ...(r ? [['Dernier relevé', `${fcfa(r.releve.montant)} au ${dateFr(r.releve.date)}`], ['Écart', fcfa(r.ecart)]] : [])],
      colonnes: [{ titre: 'Date' }, { titre: 'Nature' }, { titre: 'Libellé' }, { titre: 'Entrée', align: 'right' }, { titre: 'Sortie', align: 'right' }, { titre: 'Solde', align: 'right' }],
      lignes: lignes.map((m) => [dateFr(m.date), TYPES_MOUVEMENT[m.type]?.l || m.type, `${m.libelle || ''}${m.reference ? ` (réf. ${m.reference})` : ''}`,
        signe(m) > 0 ? num(m.montant) : '', signe(m) < 0 ? num(m.montant) : m.type === 'releve' ? `relevé ${num(m.montant)}` : '', num(m.solde)]),
    });
  };

  return (
    <div>
      <EnTete titre={c.institution} sousTitre={`${TYPES_COMPTE[c.type] || ''}${structure ? ` · ${structure.nom}` : " · Église"}`}
        actions={<>
          <button className="btn-icone" aria-label="Relevé PDF" onClick={releve}><FileText size={20} /></button>
          {peutGererComptes(db, user, can, c.structure_id) && <button className="btn-icone" aria-label="Modifier le compte" onClick={() => setEdition(c)}><Pencil size={20} /></button>}
        </>} />
      <div className="carte-solde">
        <small>Solde du compte</small>
        <strong>{fcfa(solde)}</strong>
        <span>{c.intitule || ''}{c.numero ? ` · n° ${c.numero}` : ''}</span>
      </div>
      {r && (
        <div className={`note ${r.ecart === 0 ? 'ok' : 'alerte'}`}>
          <Scale size={16} /> Relevé du {dateFr(r.releve.date)} : {fcfa(r.releve.montant)}. {r.ecart === 0 ? 'Le solde calculé concorde.' : `Écart de ${fcfa(r.ecart)} avec le solde calculé (${fcfa(r.calcule)}) : un mouvement manque ou est erroné.`}
        </div>
      )}
      {c.actif === false && <p className="note alerte">Ce compte est fermé : il reste consultable mais n'accepte plus de mouvement.</p>}

      {peut && c.actif !== false && (
        <div className="grille-actions">
          <button className="action-rapide" onClick={() => setMvt({ type: 'versement' })}><ArrowDownToLine size={20} /><span>Versement</span></button>
          <button className="action-rapide" onClick={() => setMvt({ type: 'retrait' })}><ArrowUpFromLine size={20} /><span>Retrait</span></button>
          <button className="action-rapide" onClick={() => setMvt({ type: 'virement_recu' })}><Plus size={20} /><span>Autre mouvement</span></button>
          <button className="action-rapide" onClick={() => setMvt({ type: 'releve', montant: '' })}><Scale size={20} /><span>Relevé</span></button>
        </div>
      )}

      <div className="kpis">
        <div className="kpi"><small>Entrées {an}</small><strong className="recette">{fcfa(t.entrees)}</strong></div>
        <div className="kpi"><small>Sorties {an}</small><strong className="depense">{fcfa(t.sorties)}</strong></div>
        <div className="kpi"><small>Versements {an}</small><strong>{fcfa(t.parType.versement)}</strong></div>
        <div className="kpi"><small>Frais {an}</small><strong>{fcfa(t.parType.frais)}</strong></div>
      </div>

      <section className="bloc bloc-liste">
        <div className="bloc-tete"><h2>Mouvements</h2></div>
        <Segmente valeur={filtre} onChange={setFiltre} petit options={[{ v: 'tous', l: 'Tous' }, { v: 'entrees', l: 'Entrées' }, { v: 'sorties', l: 'Sorties' }, { v: 'releves', l: 'Relevés' }]} />
        {liste.length === 0 && <p className="texte-doux">Aucun mouvement.</p>}
        {liste.map((m) => {
          const caisse = m.caisse_id && db.caisses.find((x) => x.id === m.caisse_id);
          return (
            <button key={m.id} className="ligne-user" onClick={() => setMvt(m)}>
              <span className="ligne-user-texte">
                <strong>{TYPES_MOUVEMENT[m.type]?.l || m.type}{m.libelle ? ` · ${m.libelle}` : ''}</strong>
                <small>{dateFr(m.date)}{caisse ? ` · ${m.type === 'versement' ? 'depuis' : 'vers'} ${caisse.nom}` : ''}{m.reference ? ` · réf. ${m.reference}` : ''}{m.pieces?.length ? ' · 📎' : ''}</small>
                {m.statut === 'a_valider' && <small className="texte-or">En attente de validation</small>}
              </span>
              <b className={`montant-ligne ${couleurSigne(m)}`}>{m.type === 'releve' ? fcfa(m.montant) : `${signe(m) > 0 ? '+' : '−'} ${fcfa(m.montant)}`}</b>
            </button>
          );
        })}
      </section>

      <section className="bloc">
        <h2>Informations</h2>
        <dl className="fiche">
          {c.agence && <div><dt>Agence</dt><dd>{c.agence}</dd></div>}
          {c.date_ouverture && <div><dt>Ouvert le</dt><dd>{dateFr(c.date_ouverture)}</dd></div>}
          <div><dt>Solde initial</dt><dd>{fcfa(Number(c.solde_initial) || 0)}</dd></div>
          {c.caisse_id && <div><dt>Caisse habituelle</dt><dd>{db.caisses.find((x) => x.id === c.caisse_id)?.nom}</dd></div>}
          <div><dt>Signataires</dt><dd>{signataires.length ? signataires.map(nomFidele).join(', ') : '—'}</dd></div>
          <div><dt>Caissiers désignés</dt><dd>{caissiers.length ? caissiers.map((u) => `${u.prenom} ${u.nom}`).join(', ') : '—'}</dd></div>
          {c.notes && <div className="bloc-texte"><dt>Notes</dt><dd>{c.notes}</dd></div>}
        </dl>
      </section>

      {mvt && <EditeurMouvement compte={c} mouvement={mvt} lecture={!peut || c.actif === false} valider={valider} onFermer={() => setMvt(null)} />}
      {edition && <EditeurCompte compte={edition} structures={[]} onFermer={() => setEdition(null)} />}
    </div>
  );
}
const peutVoir = (db, user, can, c) => comptesVisibles(db, user, can, c.eglise_id).some((x) => x.id === c.id) || (c.actif === false && peutGererComptes(db, user, can, c.structure_id));

// ---------- Ouverture et paramétrage d'un compte ----------
function EditeurCompte({ compte, structures, onFermer }) {
  const { db, user, can, egliseId, actions, notifier } = useApp();
  const nav = useNavigate();
  const nouveau = !compte.id;
  const general = peutGererComptes(db, user, can, null);
  const [f, setF] = useState({ type: 'microfinance', institution: '', intitule: '', numero: '', agence: '', date_ouverture: today(), solde_initial: '', caisse_id: '', structure_id: general ? '' : structures[0]?.id || '', responsables: [], signataires: [], notes: '', ...compte });
  const [choix, setChoix] = useState(null);
  const [fermer, setFermer] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const caisses = db.caisses.filter((c) => c.eglise_id === egliseId && c.actif !== false && (f.structure_id ? c.structure_id === f.structure_id : !c.structure_id));
  // Caissiers possibles : administrateurs et gestionnaires de l'église
  const candidats = db.users.filter((u) => u.eglise_id === egliseId && ['admin', 'gestionnaire'].includes(u.role) && u.actif !== false);
  const ok = f.institution.trim().length >= 2;
  const enregistrer = () => {
    const id = actions.enregistrerCompte({ ...f, institution: f.institution.trim(), solde_initial: Number(f.solde_initial) || 0, structure_id: f.structure_id || null, caisse_id: f.caisse_id || null });
    notifier(nouveau ? 'Compte enregistré' : 'Compte modifié');
    onFermer();
    if (nouveau) nav(`/institutions/${id}`);
  };
  return (
    <Feuille ouverte onFermer={onFermer} titre={nouveau ? 'Enregistrer un compte' : 'Modifier le compte'}
      pied={<><button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" disabled={!ok} onClick={enregistrer}>Enregistrer</button></>}>
      <div className="pile">
        <Segmente valeur={f.type} onChange={set('type')} options={Object.entries(TYPES_COMPTE).map(([v, l]) => ({ v, l }))} />
        <Champ label="Institution"><input value={f.institution} onChange={set('institution')} placeholder={f.type === 'microfinance' ? 'Ex. MICRO AID' : 'Ex. Coris Bank'} /></Champ>
        {nouveau && (general || structures.length > 1) && (
          <Champ label="Compte de">
            <select value={f.structure_id} onChange={(e) => setF({ ...f, structure_id: e.target.value, caisse_id: '' })}>
              {general && <option value="">L'église</option>}
              {(general ? (db.structures || []).filter((s) => s.eglise_id === egliseId && s.actif !== false) : structures).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </Champ>
        )}
        <Champ label="Intitulé du compte" aide="Ex. Compte courant, Compte épargne construction"><input value={f.intitule} onChange={set('intitule')} /></Champ>
        <Champ label="Numéro de compte"><input value={f.numero} onChange={set('numero')} inputMode="text" /></Champ>
        <Champ label="Agence"><input value={f.agence} onChange={set('agence')} /></Champ>
        <div className="deux-colonnes">
          <Champ label="Date d'ouverture"><input type="date" value={f.date_ouverture || ''} onChange={set('date_ouverture')} /></Champ>
          <Champ label="Solde à l'ouverture"><input type="number" inputMode="numeric" value={f.solde_initial} onChange={set('solde_initial')} placeholder="0" /></Champ>
        </div>
        <Champ label="Caisse habituelle des versements et retraits">
          <select value={f.caisse_id || ''} onChange={set('caisse_id')}><option value="">—</option>{caisses.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
        </Champ>
        <Champ label="Signataires" aide="Fidèles habilités à signer auprès de l'institution">
          <button className="champ-bouton" onClick={() => setChoix('signataires')}>{f.signataires.length ? f.signataires.map((id) => nomFidele((db.fideles || []).find((x) => x.id === id))).join(', ') : 'Choisir…'}</button>
        </Champ>
        {!f.structure_id && (
          <Champ label="Caissiers désignés" aide="Gestionnaires qui pourront saisir les mouvements de ce compte">
            <button className="champ-bouton" onClick={() => setChoix('responsables')}>{f.responsables.length ? f.responsables.map((id) => { const u = db.users.find((x) => x.id === id); return u ? `${u.prenom} ${u.nom}` : ''; }).join(', ') : 'Choisir…'}</button>
          </Champ>
        )}
        {f.structure_id && <p className="note petit">Les mouvements de ce compte sont saisis par le trésorier de la structure (poste autorisé à saisir) et par l'administrateur.</p>}
        <Champ label="Notes"><textarea rows={2} value={f.notes} onChange={set('notes')} /></Champ>
        {!nouveau && <Interrupteur actif={f.actif !== false} onChange={(v) => (v ? setF({ ...f, actif: true }) : setFermer(true))} label="Compte actif" aide="Un compte fermé reste consultable avec son historique" />}
      </div>
      {choix && (
        <Choix titre={choix === 'signataires' ? 'Signataires' : 'Caissiers désignés'} valeurs={f[choix]}
          options={choix === 'signataires' ? fidelesEglise(db, egliseId).filter((x) => x.actif !== false).map((x) => ({ id: x.id, nom: nomFidele(x), prenom: x.prenom, n: x.nom }))
            : candidats.map((u) => ({ id: u.id, nom: `${u.prenom} ${u.nom}`, prenom: u.prenom, n: u.nom }))}
          onValider={(v) => { setF({ ...f, [choix]: v }); setChoix(null); }} onFermer={() => setChoix(null)} />
      )}
      <Confirmation ouverte={fermer} onFermer={() => setFermer(false)} libelle="Fermer le compte" titre="Fermer ce compte ?"
        message={`Le compte n'acceptera plus de mouvement. Son solde actuel est de ${fcfa(compte.id ? soldeCompte(db, compte) : 0)} : retirez d'abord les fonds si nécessaire.`}
        onConfirmer={() => { setF({ ...f, actif: false }); setFermer(false); }} />
    </Feuille>
  );
}

function Choix({ titre, valeurs, options, onValider, onFermer }) {
  const [sel, setSel] = useState(new Set(valeurs));
  const [q, setQ] = useState('');
  const vis = options.filter((o) => !q || o.nom.toLowerCase().includes(q.toLowerCase()));
  const bascule = (id) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  return (
    <Feuille ouverte onFermer={onFermer} titre={titre}
      pied={<><button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" onClick={() => onValider([...sel])}>Valider ({sel.size})</button></>}>
      <div className="recherche"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" /></div>
      <div className="liste-contacts">
        {vis.map((o) => (
          <button key={o.id} className={`contact ${sel.has(o.id) ? 'choisi' : ''}`} onClick={() => bascule(o.id)}>
            <Avatar user={{ prenom: o.prenom, nom: o.n }} taille={36} /><span><strong>{o.nom}</strong></span>
            <i className="case">{sel.has(o.id) && <Check size={14} />}</i>
          </button>
        ))}
        {vis.length === 0 && <p className="texte-doux petit centre">Personne à proposer.</p>}
      </div>
    </Feuille>
  );
}

// ---------- Saisie et consultation d'un mouvement ----------
function EditeurMouvement({ compte, mouvement, lecture, valider, onFermer }) {
  const { db, user, can, actions, notifier } = useApp();
  const nouveau = !mouvement.id;
  const [f, setF] = useState({ date: today(), montant: '', libelle: '', reference: '', caisse_id: compte.caisse_id || '', ...mouvement });
  const [fichiers, setFichiers] = useState([]);
  const [suppr, setSuppr] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const def = TYPES_MOUVEMENT[f.type];
  const valide = mouvement.statut === 'validee';
  const fige = lecture || valide;
  // Caisses où l'on peut écrire : celles de l'église (ou de la structure du compte)
  const caisses = db.caisses.filter((c) => c.eglise_id === compte.eglise_id && c.actif !== false && (compte.structure_id ? c.structure_id === compte.structure_id : !c.structure_id)
    && (user.role === 'super_admin' || can('fin.saisir', c.id) || can('fin.transferer') || (compte.structure_id && droitStructure(db, user, can, compte.structure_id, 'saisir'))));
  const op = mouvement.operation_id && db.operations.find((o) => o.id === mouvement.operation_id);
  const auteur = db.users.find((u) => u.id === mouvement.cree_par);
  const ok = Number(f.montant) > 0 && f.date && (!def?.caisse || f.caisse_id) && (f.type !== 'paiement' || f.libelle.trim());
  const enregistrer = () => {
    const e = actions.enregistrerMouvement({ ...f, compte_id: compte.id, montant: Number(f.montant), libelle: f.libelle.trim() }, fichiers);
    if (e) return notifier(e, 'erreur');
    notifier(nouveau ? 'Mouvement enregistré' : 'Mouvement modifié');
    onFermer();
  };
  const ouvrir = async (p) => { const url = await actions.urlPiece(p); if (!url) return notifier('Pièce disponible seulement avec une connexion internet', 'erreur'); window.open(url, '_blank'); };
  const ajouter = async (e) => { const fi = e.target.files?.[0]; e.target.value = ''; if (fi) try { const p = await lirePiece(fi); setFichiers((l) => [...l, p]); } catch (er) { notifier(er.message, 'erreur'); } };
  const types = Object.entries(TYPES_MOUVEMENT).filter(([k]) => (mouvement.type === 'releve' ? k === 'releve' : k !== 'releve'));

  return (
    <Feuille ouverte onFermer={onFermer} titre={nouveau ? (def?.l || 'Mouvement') : `${def?.l || 'Mouvement'} du ${dateFr(mouvement.date)}`}
      pied={fige ? <button className="btn btn-doux btn-plein" onClick={onFermer}>Fermer</button>
        : <><button className="btn btn-doux" onClick={onFermer}>Annuler</button><button className="btn btn-primaire" disabled={!ok} onClick={enregistrer}>Enregistrer</button></>}>
      <div className="pile">
        {nouveau && mouvement.type !== 'releve' && (
          <Champ label="Nature">
            <select value={f.type} onChange={set('type')}>{types.map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
          </Champ>
        )}
        {def?.aide && <p className="texte-doux petit">{def.aide}{def.caisse === 'depense' ? ' : la caisse diminue d\'autant.' : def.caisse === 'recette' ? ' : la caisse augmente d\'autant.' : ''}</p>}
        <div className="deux-colonnes">
          <Champ label="Date"><input type="date" value={f.date} max={today()} disabled={fige} onChange={set('date')} /></Champ>
          <Champ label={f.type === 'releve' ? 'Solde du relevé' : 'Montant'}><input type="number" inputMode="numeric" value={f.montant} disabled={fige} onChange={set('montant')} placeholder="0" /></Champ>
        </div>
        {def?.caisse && (
          <Champ label={f.type === 'versement' ? 'Caisse d\'où sort l\'argent' : 'Caisse qui reçoit l\'argent'}>
            <select value={f.caisse_id} disabled={fige} onChange={set('caisse_id')}><option value="">Choisir…</option>{caisses.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
          </Champ>
        )}
        {f.type !== 'releve' && <Champ label={f.type === 'paiement' ? 'Objet du paiement (obligatoire)' : 'Libellé'}><input value={f.libelle} disabled={fige} onChange={set('libelle')} placeholder={f.type === 'virement_recu' ? 'Ex. Don de la mission partenaire' : f.type === 'paiement' ? 'Ex. Facture du menuisier' : ''} /></Champ>}
        <Champ label={f.type === 'releve' ? 'Référence du relevé' : 'Référence (bordereau, chèque, opération)'}><input value={f.reference} disabled={fige} onChange={set('reference')} /></Champ>
        {!fige && (
          <div className="carte-form pieces">
            <span className="champ-label">Pièce justificative (bordereau, relevé…)</span>
            <div className="liste-pieces">
              {(mouvement.pieces || []).map((p) => <button key={p.id} className="piece" onClick={() => ouvrir(p)}><Paperclip size={16} /><span>{p.nom}</span><ExternalLink size={14} /></button>)}
              {fichiers.map((p, i) => <span key={p.id} className="piece"><Paperclip size={16} /><span>{p.nom}</span><button aria-label="Retirer" onClick={() => setFichiers(fichiers.filter((_, j) => j !== i))}><X size={14} /></button></span>)}
            </div>
            <div className="ligne-boutons">
              <label className="btn btn-doux petit"><Camera size={16} /> Photo<input type="file" accept="image/*" capture="environment" hidden onChange={ajouter} /></label>
              <label className="btn btn-doux petit"><Paperclip size={16} /> Fichier<input type="file" accept="image/*,application/pdf" hidden onChange={ajouter} /></label>
            </div>
          </div>
        )}
        {fige && mouvement.pieces?.length > 0 && <div className="liste-pieces">{mouvement.pieces.map((p) => <button key={p.id} className="piece" onClick={() => ouvrir(p)}><Paperclip size={16} /><span>{p.nom}</span><ExternalLink size={14} /></button>)}</div>}
        {!nouveau && (
          <dl className="fiche">
            <div><dt>Saisi par</dt><dd>{auteur ? `${auteur.prenom} ${auteur.nom}` : '—'}</dd></div>
            {op && <div><dt>Opération en caisse</dt><dd>{db.caisses.find((x) => x.id === op.caisse_id)?.nom} · {op.type === 'recette' ? 'entrée' : 'sortie'} de {fcfa(op.montant)}</dd></div>}
            {valide && <div><dt><ShieldCheck size={16} /> Validé</dt><dd>{dateFr((mouvement.valide_le || '').slice(0, 10))}</dd></div>}
          </dl>
        )}
        {mouvement.statut === 'a_valider' && valider && (
          <button className="btn btn-primaire btn-plein" onClick={() => { actions.validerMouvements([mouvement.id]); notifier('Mouvement validé'); onFermer(); }}><CheckCircle2 size={18} /> Valider ce mouvement</button>
        )}
        {!nouveau && !fige && <button className="btn btn-danger-doux btn-plein" onClick={() => setSuppr(true)}><Trash2 size={18} /> Supprimer ce mouvement</button>}
        {valide && <p className="note petit">Un mouvement validé ne se modifie plus : en cas d'erreur, saisissez un mouvement inverse.</p>}
      </div>
      <Confirmation ouverte={suppr} onFermer={() => setSuppr(false)} danger libelle="Supprimer" titre="Supprimer ce mouvement ?"
        message={op ? `L'opération liée dans la caisse ${db.caisses.find((x) => x.id === op.caisse_id)?.nom} sera aussi supprimée.` : 'Le solde du compte sera recalculé.'}
        onConfirmer={() => { const res = actions.supprimerMouvement(mouvement.id); if (typeof res === 'string') notifier(res, 'erreur'); else { notifier('Mouvement supprimé', 'ok', 'depense', { annuler: () => { actions.restaurer(res?.corbeille || []); notifier('Suppression annulée', 'ok', 'tic'); } }); onFermer(); } }} />
    </Feuille>
  );
}

