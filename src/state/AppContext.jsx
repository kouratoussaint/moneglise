import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { repository } from '../data/repository';
import { cloturer, modeleEglise, nouvelleEglise } from '../data/seed';
import { TABLES, supabase, differences, ajouterAFile, pousser, tirer, fusionner, relire, resumesFideles, enLigneReseau, messageAuth, dbVide, annuaire, ecouterServeur, rattacher, rejoindreServeur, creerEgliseServeur } from '../data/sync';
import { structuresModele } from '../data/seed';
import { CATEGORIES_STRUCTURE } from '../lib/structures';
import { repartir, libellePeriode } from '../lib/cotisations';
import { conversationsEglise } from '../data/seed';
import { messagesDe, lectureDe, personne, nomCourt, titreConv, estMembre } from '../lib/messagerie';
import { initialiserPush, firebaseActif } from '../lib/push';
import { tracer } from '../lib/historique';
import { enLigne } from '../config';
import { makeCan } from '../lib/permissions';
import { uid, today } from '../lib/format';
import { estVerrouille, clotureDe, caissesEglise, estValidee } from '../lib/finance';
import { jouer, vibrer } from '../lib/son';
import { lireNotifs, ecrireNotifs, effacerNotifs, afficherSurTelephone, demanderPermission } from '../lib/notifications';
import { fcfa, addMonths, ymOf, moisLabel } from '../lib/format';
import { Capacitor } from '@capacitor/core';

const Ctx = createContext(null);

// Caisse propre à une structure, avec ses catégories de départ
function creerCaisse(d, sid, nom) {
  if (d.caisses.some((c) => c.structure_id === sid)) return;
  const st = d.structures.find((x) => x.id === sid);
  const cid = `c_${sid}`;
  d.caisses.push({ id: cid, eglise_id: st.eglise_id, structure_id: sid, nom: `Caisse ${nom}`, description: `Caisse propre à ${nom}`, icone: 'Users', couleur: '#7A4FD6', image: 'communaute', visible_fideles: false, actif: true, ordre: d.caisses.length });
  for (const type of ['recette', 'depense']) CATEGORIES_STRUCTURE[type].forEach((n, i) => d.categories.push({ id: `${cid}_${type}_${i}`, eglise_id: st.eglise_id, caisse_id: cid, type, nom: n }));
}

// Pièces justificatives en attente d'envoi (prises hors connexion)
const CLE_PIECES = 'eglise360:pieces-attente';
const piecesAttente = {
  lire() { try { return JSON.parse(localStorage.getItem(CLE_PIECES)) || []; } catch { return []; } },
  ecrire(l) { try { localStorage.setItem(CLE_PIECES, JSON.stringify(l)); } catch { /* espace insuffisant */ } },
  ajouter(p) { this.ecrire([...this.lire(), p]); },
  trouver(chemin) { return this.lire().find((p) => p.chemin === chemin); },
  async envoyer(sb) {
    const reste = [];
    for (const p of this.lire()) {
      try {
        const blob = await (await fetch(p.dataUrl)).blob();
        const { error } = await sb.storage.from('pieces').upload(p.chemin, blob, { upsert: true, contentType: p.type });
        if (error) reste.push(p);
      } catch { reste.push(p); }
    }
    this.ecrire(reste);
  },
};
export const useApp = () => useContext(Ctx);
const CLE_MODELE = 'eglise360:modele_en_attente';

export function AppProvider({ children }) {
  const online = enLigne();
  const [db, setDbState] = useState(null);
  const dbRef = useRef(null);
  const metaRef = useRef(repository.meta.lire());
  const [session, setSession] = useState(() => repository.session.lire());
  const [sync, setSync] = useState({ statut: 'ok', derniere: metaRef.current.derniere, attente: Object.keys(metaRef.current.file || {}).length });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();
  const enCours = useRef(false);
  const minuteur = useRef();
  const convOuverte = useRef(null);
  const userRef = useRef(null), egliseRef = useRef(null), derniereCorbeille = useRef([]);
  const majRef = useRef(null);

  const [notifs, setNotifs] = useState(() => lireNotifs());
  const ajouterNotif = useCallback((n, { push = false } = {}) => {
    setNotifs((l) => { const nl = [{ id: uid('n'), le: new Date().toISOString(), lu: false, ...n }, ...l]; ecrireNotifs(nl); return nl; });
    // Si Firebase est actif, le téléphone a déjà reçu la notification « push » : pas de doublon
    if (Capacitor.isNativePlatform()) { if (!(push && firebaseActif())) afficherSurTelephone(n.titre, n.texte, n.lien); } else jouer('notif');
  }, []);
  const notifsMaj = useCallback((fn) => setNotifs((l) => { const nl = fn(l); ecrireNotifs(nl); return nl; }), []);

  const notifier = useCallback((message, ton = 'ok', son, opts = {}) => {
    jouer(son || (ton === 'erreur' ? 'erreur' : 'succes'));
    vibrer(ton === 'erreur');
    clearTimeout(toastTimer.current);
    setToast({ message, ton, k: Date.now(), annuler: opts.annuler });
    toastTimer.current = setTimeout(() => setToast(null), opts.annuler ? 6000 : 2800);
  }, []);

  const setDb = useCallback((d) => { dbRef.current = d; setDbState(d); repository.enregistrer(d); }, []);
  const ecrireMeta = (m) => { metaRef.current = m; repository.meta.ecrire(m); };

  // ---------- Synchronisation ----------
  const synchroniser = useCallback(async ({ complet = false } = {}) => {
    if (!online) return true;
    if (enCours.current) return false;
    if (!enLigneReseau()) { setSync((s) => ({ ...s, statut: 'hors_ligne' })); return false; }
    const sb = supabase();
    const { data: { session: s } } = await sb.auth.getSession();
    if (!s) return false;
    enCours.current = true;
    setSync((x) => ({ ...x, statut: 'en_cours' }));
    try {
      // Nouvelle version de l'application avec de nouveaux types de données (fidèles, activités…) :
      // tout est rechargé, sinon les données créées avant la mise à jour ne seraient jamais reçues
      const signature = TABLES.join(',');
      if (metaRef.current.tables !== signature) complet = true;
      if (complet || !metaRef.current.derniere) await rattacher().catch(() => 0);
      await piecesAttente.envoyer(sb);
      const snapshot = metaRef.current.file || {};
      const { traites, refuses } = await pousser(snapshot);
      // On retire de la file uniquement ce qui a été traité et n'a pas été modifié entre-temps
      const file = { ...metaRef.current.file };
      for (const [k, v] of traites) if (file[k] === v) delete file[k];
      const { lignes, suivant } = await tirer(complet ? null : metaRef.current.depuis);
      const connues = new Set(dbRef.current.operations.map((o) => o.id));
      const msgConnus = new Set((dbRef.current.messages || []).map((m) => m.id));
      let d = fusionner(dbRef.current, lignes, file);
      if (refuses.length) d = fusionner(d, await relire(refuses), file);
      const moi = d.users.find((u) => u.auth_id === s.user.id);
      const mesIds = new Set(d.users.filter((u) => u.auth_id === s.user.id).map((u) => u.id));
      // Notifications du serveur (actions des autres membres) : affichées sur le téléphone si Firebase n'est pas actif
      if (moi && !complet && metaRef.current.derniere && !firebaseActif()) {
        const connuesN = new Set((dbRef.current.notifications || []).map((n) => n.id));
        for (const n of (d.notifications || []).filter((x) => !connuesN.has(x.id) && mesIds.has(x.user_id) && !x.lu).slice(0, 5)) afficherSurTelephone(n.titre, n.texte, n.lien);
      }
      // Messagerie : annuaire, accusés de réception, notifications des nouveaux messages
      // Annuaire (noms et photos) : rafraîchi au plus toutes les 10 minutes pour économiser les données
      if (complet || !metaRef.current.annuaireLe || Date.now() - metaRef.current.annuaireLe > 600000 || !d.annuaire?.length) {
        const ann = await annuaire();
        if (ann) { d = { ...d, annuaire: ann }; metaRef.current = { ...metaRef.current, annuaireLe: Date.now() }; }
      } else d = { ...d, annuaire: dbRef.current.annuaire };
      if (moi) {
        const nouveaux = (d.messages || []).filter((m) => !msgConnus.has(m.id) && !mesIds.has(m.auteur_id));
        const convs = [...new Set(nouveaux.map((m) => m.conversation_id))];
        if (convs.length) setTimeout(() => majRef.current?.(convs, 'recu'), 0);
        if (!complet && metaRef.current.derniere) {
          for (const cid of convs) {
            const liste = nouveaux.filter((m) => m.conversation_id === cid);
            if (convOuverte.current === cid) { jouer('tic'); continue; }
            const conv = d.conversations.find((c) => c.id === cid);
            if (d.lectures?.some((x) => x.conversation_id === cid && mesIds.has(x.user_id) && x.sourdine)) continue;
            const dernier = liste[liste.length - 1];
            const auteur = nomCourt(personne(d, dernier.auteur_id));
            const titre = conv ? titreConv(d, conv, moi) : 'Message';
            ajouterNotif({ type: 'message', titre: conv?.type === 'prive' ? `Message de ${titre}` : `${titre}${liste.length > 1 ? ` · ${liste.length} messages` : ''}`, texte: conv?.type === 'prive' ? dernier.texte : `${auteur} : ${dernier.texte}`, lien: `/messages/${cid}` }, { push: true });
          }
        }
      }
      if (moi) {
        const can = makeCan(moi, d.eglises.find((e) => e.id === moi.eglise_id));
        if (!can('fin.voir_details') && can('fin.voir_totaux')) d = { ...d, resumes: await resumesFideles() };
      }
      const derniere = new Date().toISOString();
      ecrireMeta({ ...metaRef.current, file, depuis: suivant, derniere, tables: signature });
      setDb(d);
      setSync({ statut: 'ok', derniere, attente: Object.keys(file).length });
      if (refuses.length) notifier(`${refuses.length} modification(s) refusée(s) par le serveur : droits insuffisants.`, 'erreur');
      return true;
    } catch (e) {
      setSync((x) => ({ ...x, statut: enLigneReseau() ? 'erreur' : 'hors_ligne', message: e?.message }));
      return false;
    } finally {
      enCours.current = false;
    }
  }, [online, notifier, setDb, ajouterNotif]);

  const planifier = useCallback((delai = 1200) => {
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => synchroniser(), delai);
  }, [synchroniser]);

  // Démarrage
  useEffect(() => {
    (async () => {
      const d = await repository.charger();
      dbRef.current = d; setDbState(d);
      if (online) {
        const { data } = await supabase().auth.getSession();
        if (!data.session) { setSession(null); repository.session.ecrire(null); }
        else synchroniser();
      }
    })();
  }, [online, synchroniser]);

  // Synchronisation régulière, au retour du réseau et au retour dans l'application
  useEffect(() => {
    if (!online) return undefined;
    const t = setInterval(() => synchroniser(), 60000);
    const surReseau = () => synchroniser();
    const surHorsLigne = () => setSync((s) => ({ ...s, statut: 'hors_ligne' }));
    window.addEventListener('online', surReseau);
    window.addEventListener('offline', surHorsLigne);
    const surVisible = () => document.visibilityState === 'visible' && synchroniser();
    document.addEventListener('visibilitychange', surVisible);
    return () => { clearInterval(t); window.removeEventListener('online', surReseau); window.removeEventListener('offline', surHorsLigne); document.removeEventListener('visibilitychange', surVisible); };
  }, [online, synchroniser]);

  // Applique une modification, l'enregistre sur l'appareil et la met en file d'attente
  const maj = useCallback((fn, { vite = false, trace = null } = {}) => {
    const avant = dbRef.current;
    const apres = fn(structuredClone(avant));
    // Traçabilité : qui a fait quoi, quand ; les éléments supprimés vont dans la corbeille
    derniereCorbeille.current = [];
    if (userRef.current) {
      const t = tracer(avant, apres, userRef.current, egliseRef.current, trace);
      if (t.historique.length) apres.historique = [...(apres.historique || []), ...t.historique];
      if (t.corbeille.length) { apres.corbeille = [...(apres.corbeille || []), ...t.corbeille]; derniereCorbeille.current = t.corbeille.map((c) => c.id); }
    }
    setDb(apres);
    if (online) {
      const ops = differences(avant, apres);
      if (ops.length) {
        const m = { ...metaRef.current, file: ajouterAFile(metaRef.current.file || {}, ops) };
        ecrireMeta(m);
        setSync((s) => ({ ...s, attente: Object.keys(m.file).length }));
        planifier(vite ? 150 : 1200);
      }
    }
  }, [online, planifier, setDb]);

  // Une personne peut avoir plusieurs adhésions (une par église) : la session pointe sur l'adhésion active
  const mesAdhesions = useMemo(() => {
    if (!db || !session) return [];
    const cur = db.users.find((u) => u.id === session.userId);
    if (!cur) return [];
    const memeCompte = (u) => (cur.auth_id ? u.auth_id === cur.auth_id : u.email?.toLowerCase() === cur.email?.toLowerCase());
    return db.users.filter((u) => memeCompte(u) && u.actif !== false && u.statut !== 'refuse');
  }, [db, session]);
  const user = useMemo(() => (db && session ? db.users.find((u) => u.id === session.userId) || null : null), [db, session]);
  const egliseId = user?.role === 'super_admin' ? (session?.egliseId || user?.eglise_id || db?.eglises[0]?.id) : user?.eglise_id;
  const eglise = useMemo(() => db?.eglises.find((e) => e.id === egliseId) || null, [db, egliseId]);
  const can = useMemo(() => makeCan(user, eglise, db), [user, eglise, db]);
  userRef.current = user; egliseRef.current = egliseId;

  // Rappel de clôture : une fois par mois, pour ceux qui peuvent clôturer
  useEffect(() => {
    if (!db || !user || !eglise) return;
    const precedent = addMonths(ymOf(today()), -1);
    const cle = `e360:rappel:${precedent}:${user.id}`;
    if (localStorage.getItem(cle)) return;
    const aCloturer = caissesEglise(db, egliseId).filter((c) => can('fin.cloturer', c.id) && !clotureDe(db, c.id, precedent) && db.operations.some((o) => o.caisse_id === c.id && ymOf(o.date) === precedent));
    if (aCloturer.length) {
      localStorage.setItem(cle, '1');
      ajouterNotif({ type: 'rappel', titre: `Clôture de ${moisLabel(precedent).toLowerCase()}`, texte: `${aCloturer.length} caisse(s) à clôturer : ${aCloturer.map((c) => c.nom).join(', ')}.`, lien: '/clotures' });
    }
  }, [db, user, eglise, egliseId, can, ajouterNotif]);

  useEffect(() => { if (user) demanderPermission(); }, [user]);

  // Accusés de réception / lecture : position de lecture de l'utilisateur dans chaque conversation
  majRef.current = (convIds, champ) => {
    if (!user || !dbRef.current) return;
    const d0 = dbRef.current;
    const modifs = convIds.map((cid) => {
      const msgs = messagesDe(d0, cid).filter((m) => m.auteur_id !== user.id);
      const max = msgs.length ? msgs[msgs.length - 1].le : null;
      const l = lectureDe(d0, cid, user.id);
      if (!max || (l && l[champ] >= max && (champ === 'lu' ? l.recu >= max : true))) return null;
      return { cid, max };
    }).filter(Boolean);
    if (!modifs.length) return;
    maj((d) => {
      for (const { cid, max } of modifs) {
        const conv = d.conversations.find((c) => c.id === cid);
        let l = d.lectures.find((x) => x.conversation_id === cid && x.user_id === user.id);
        if (!l) { l = { id: `${cid}__${user.id}`, eglise_id: conv?.eglise_id || user.eglise_id, conversation_id: cid, user_id: user.id, recu: '', lu: '' }; d.lectures.push(l); }
        if (!l.recu || l.recu < max) l.recu = max;
        if (champ === 'lu' && (!l.lu || l.lu < max)) l.lu = max;
      }
      return d;
    }, { vite: true });
  };

  useEffect(() => {
    if (!user || !db) return;
    const t = setTimeout(() => majRef.current?.((db.conversations || []).filter((c) => estMembre(c, user)).map((c) => c.id), 'recu'), 1500);
    return () => clearTimeout(t);
  }, [user?.id, db?.messages?.length]);

  // Présence : « en ligne » / « vu il y a… » (signal toutes les 2 minutes quand l'application est ouverte)
  useEffect(() => {
    if (!user) return undefined;
    const signaler = () => {
      if (document.visibilityState !== 'visible' || !dbRef.current) return;
      const id = `pr_${user.id}`;
      const ex = dbRef.current.presences?.find((p) => p.id === id);
      if (ex && Date.now() - Date.parse(ex.vu_le) < 100000) return;
      maj((d) => { d.presences = (d.presences || []).filter((p) => p.id !== id); d.presences.push({ id, eglise_id: user.eglise_id || '_global', user_id: user.id, role: user.role, vu_le: new Date().toISOString() }); return d; });
    };
    signaler();
    const t = setInterval(signaler, 120000);
    document.addEventListener('visibilitychange', signaler);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', signaler); };
  }, [user?.id]);

  // Mode démo : les données créées avant le module Fidèles reçoivent leurs fiches (en ligne, le serveur s'en charge)
  useEffect(() => {
    if (!db || !user || online) return;
    const manquants = db.users.filter((u) => u.role !== 'super_admin' && u.eglise_id && !(db.fideles || []).some((f) => f.user_id === u.id));
    if (!manquants.length) return;
    setDb({ ...db, fideles: [...(db.fideles || []), ...manquants.map((u) => ({ id: `f_${u.id}`, eglise_id: u.eglise_id, prenom: u.prenom, nom: u.nom, email: u.email, user_id: u.id, date_enregistrement: today(), actif: true }))], appartenances: db.appartenances || [], postes: db.postes || [] });
  }, [online, db?.users?.length, user?.id]);

  useEffect(() => {
    if (online || !db || !user) return undefined;
    const verifier = () => {
      const fiche = (dbRef.current.fideles || []).find((f) => f.user_id === user.id);
      const maintenant = Date.now();
      for (const a of dbRef.current.activites || []) {
        if (a.statut === 'annulee' || a.eglise_id !== user.eglise_id || !a.debut) continue;
        const concerne = !a.structure_id || a.destinataires === 'eglise' || (dbRef.current.appartenances || []).some((x) => x.structure_id === a.structure_id && x.fidele_id === fiche?.id && !x.jusqu_au && (x.statut || 'actif') === 'actif');
        if (!concerne) continue;
        const debut = new Date(`${a.debut}:00`).getTime();
        const dus = (a.rappels || [1440, 120]).filter((m) => debut - m * 60000 <= maintenant && debut > maintenant);
        const cle = `e360:rappel-act:${a.id}:${user.id}:${Math.min(...dus)}`;
        if (dus.length && !localStorage.getItem(cle)) {
          localStorage.setItem(cle, '1');
          ajouterNotif({ type: 'activites', titre: `Rappel · ${a.titre}`, texte: `Le ${new Date(debut).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${a.lieu ? ` — ${a.lieu}` : ''}`, lien: `/activites/${a.id}` });
        }
      }
    };
    verifier();
    const t = setInterval(verifier, 60000);
    return () => clearInterval(t);
  }, [online, user?.id, !!db]);

  // Temps réel : toute modification visible sur le serveur déclenche une synchronisation rapide
  useEffect(() => {
    if (!online || !user) return undefined;
    let t;
    const arreter = ecouterServeur(user.role === 'super_admin' ? null : user.eglise_id, () => { clearTimeout(t); t = setTimeout(() => synchroniser(), 300); });
    return () => { clearTimeout(t); arreter(); };
  }, [online, user?.id, synchroniser]);

  // Discussions de l'église créées d'office (églises existantes avant la messagerie)
  useEffect(() => {
    if (!db || !user || !eglise) return;
    if (eglise.id !== user.eglise_id) return; // super admin consultant une autre église : rien à créer
    if (db.conversations?.some((c) => c.eglise_id === eglise.id && c.type === 'eglise')) return;
    if (online && !can('admin.eglise')) return;
    maj((d) => { d.conversations = [...(d.conversations || []), ...conversationsEglise(eglise.id, user.id)]; return d; });
  }, [db, user, eglise, online, can, maj]);

  // Firebase : enregistrement du téléphone pour recevoir les notifications application fermée
  useEffect(() => {
    if (!online || !user) return undefined;
    let arreter = () => {};
    initialiserPush({
      surJeton: (jeton) => {
        const id = `dev_${jeton.slice(-40).replace(/[^\w-]/g, '')}`;
        const existant = dbRef.current.appareils?.find((a) => a.id === id);
        if (existant?.user_id === user.id && existant.jeton === jeton) return;
        maj((d) => { d.appareils = (d.appareils || []).filter((a) => a.id !== id); d.appareils.push({ id, eglise_id: user.eglise_id || '_global', user_id: user.id, jeton, plateforme: 'android', le: new Date().toISOString() }); return d; });
      },
      surReception: () => synchroniser(),
      surClic: (lien) => { window.location.hash = `#${lien}`; },
    }).then((f) => { arreter = f; }).catch(() => {});
    return () => arreter();
  }, [online, user?.id]);

  const journaliser = (d, action, detail) => d.journal.push({ id: uid('j'), eglise_id: egliseId, user_id: user?.id, action, detail, le: new Date().toISOString() });
  const ouvrir = (u, authId) => { const s = { userId: u.id, authId }; setSession(s); repository.session.ecrire(s); };

  // Connexion en ligne : copie locale propre, synchronisation complète, puis identification
  async function ouvrirSessionEnLigne(s) {
    const precedente = repository.session.lire();
    if (precedente?.authId !== s.user.id) {
      await repository.effacerLocal();
      ecrireMeta({ file: {}, depuis: null, derniere: null });
      setDb(dbVide());
    }
    const ok = await synchroniser({ complet: true });
    const toutes = dbRef.current.users.filter((x) => x.auth_id === s.user.id && x.statut !== 'refuse');
    const adhesions = toutes.filter((x) => x.actif !== false);
    const pref = precedente?.egliseId;
    const u = adhesions.find((x) => x.eglise_id === pref && x.statut !== 'en_attente') || adhesions.find((x) => (x.statut || 'actif') === 'actif') || adhesions[0];
    if (!u) {
      await supabase().auth.signOut();
      // Adhésion existante mais désactivée par un administrateur : le dire clairement
      if (toutes.length) return 'Ce compte est désactivé. Contactez l\'administrateur de votre église pour le réactiver.';
      return ok ? 'Ce compte n\'est rattaché à aucune église. Contactez l\'administrateur de votre église.' : 'Impossible de joindre le serveur. Vérifiez votre connexion internet.';
    }
    if (u.actif === false) { await supabase().auth.signOut(); return 'Ce compte est désactivé. Contactez l\'administrateur de votre église.'; }
    // Église créée à l'inscription : on installe les caisses et catégories de départ
    try {
      const modele = JSON.parse(localStorage.getItem(CLE_MODELE));
      if (modele && u.role === 'admin' && modele.caisses[0]?.eglise_id === u.eglise_id && !dbRef.current.caisses.some((c) => c.eglise_id === u.eglise_id)) {
        maj((d) => { d.caisses.push(...modele.caisses); d.categories.push(...modele.categories); d.conversations.push(...(modele.conversations || [])); d.structures = [...(d.structures || []), ...structuresModele(u.eglise_id)]; return d; });
      }
      localStorage.removeItem(CLE_MODELE);
    } catch { /* */ }
    ouvrir(u, s.user.id);
    return null;
  }

  const actions = {
    async connexion(email, mdp) {
      if (online) {
        const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password: mdp });
        if (error) return messageAuth(error);
        return ouvrirSessionEnLigne(data.session);
      }
      const toutes = db.users.filter((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.statut !== 'refuse');
      const u = toutes.find((x) => (x.statut || 'actif') === 'actif') || toutes[0];
      if (!u || u.mdp !== mdp) return 'Adresse e-mail ou mot de passe incorrect.';
      if (!u.actif) return 'Ce compte est désactivé. Contactez l\'administrateur de votre église.';
      ouvrir(u);
      return null;
    },
    async inscription({ prenom, nom, email, mdp, egliseIdChoisie, nouvelleEgliseNom, ville, structures = [] }) {
      if (online) {
        const meta = { prenom: prenom.trim(), nom: nom.trim(), ...(structures.length && !nouvelleEgliseNom ? { structures } : {}) };
        if (nouvelleEgliseNom) {
          const eid = uid('egl');
          meta.eglise = nouvelleEglise(eid, nouvelleEgliseNom.trim(), ville?.trim() || '');
          localStorage.setItem(CLE_MODELE, JSON.stringify(modeleEglise(eid)));
        } else meta.eglise_id = egliseIdChoisie;
        const { data, error } = await supabase().auth.signUp({ email: email.trim(), password: mdp, options: { data: meta } });
        if (error) return messageAuth(error);
        if (!data.session) return 'CONFIRMER';
        return ouvrirSessionEnLigne(data.session);
      }
      if (db.users.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) return 'Un compte existe déjà avec cette adresse e-mail.';
      const id = uid('u');
      maj((d) => {
        let eid = egliseIdChoisie, role = 'fidele', statut = 'en_attente';
        if (nouvelleEgliseNom) {
          eid = uid('egl');
          d.eglises.push(nouvelleEglise(eid, nouvelleEgliseNom.trim(), ville?.trim() || '', 'en_attente'));
          const m = modeleEglise(eid);
          d.caisses.push(...m.caisses); d.categories.push(...m.categories); d.conversations.push(...m.conversations);
          d.structures = [...(d.structures || []), ...structuresModele(eid)];
          role = 'admin'; statut = 'actif';
        }
        d.users.push({ id, eglise_id: eid, prenom: prenom.trim(), nom: nom.trim(), email: email.trim(), mdp, role, caisses: [], actif: true, statut, le: today() });
        d.fideles = [...(d.fideles || []), { id: `f_${id}`, eglise_id: eid, prenom: prenom.trim(), nom: nom.trim(), email: email.trim(), user_id: id, date_enregistrement: today(), actif: true }];
        if (!nouvelleEgliseNom) for (const sid of structures) d.appartenances = [...(d.appartenances || []), { id: uid('ap'), eglise_id: eid, structure_id: sid, fidele_id: `f_${id}`, statut: 'en_attente', depuis: today(), demande: true }];
        return d;
      });
      ouvrir({ id });
      return null;
    },
    async deconnexion() {
      if (online) {
        await synchroniser();
        await supabase().auth.signOut().catch(() => {});
        await repository.effacerLocal();
        ecrireMeta({ file: {}, depuis: null, derniere: null });
        setDb(dbVide());
      }
      effacerNotifs(); setNotifs([]);
      setSession(null); repository.session.ecrire(null);
    },
    async rafraichirAnnuaire() {
      if (!online) return;
      const ann = await annuaire();
      if (ann) { metaRef.current = { ...metaRef.current, annuaireLe: Date.now() }; setDb({ ...dbRef.current, annuaire: ann }); }
    },
    ouvrirConversation(id) { convOuverte.current = id; if (id) majRef.current?.([id], 'lu'); },
    marquerLu(id) { majRef.current?.([id], 'lu'); },
    envoyerMessage(convId, texte) {
      const conv = db.conversations.find((c) => c.id === convId);
      if (!conv || !texte.trim()) return;
      maj((d) => { d.messages.push({ id: uid('msg'), eglise_id: conv.eglise_id, conversation_id: convId, auteur_id: user.id, texte: texte.trim(), le: new Date().toISOString() }); return d; }, { vite: true });
      jouer('tic');
    },
    supprimerMessage(id) {
      maj((d) => { const m = d.messages.find((x) => x.id === id); if (m) { m.texte = ''; m.supprime = true; } return d; }, { vite: true });
    },
    ouvrirPrive(autreId) {
      const autre = personne(db, autreId);
      const existante = db.conversations.find((c) => c.type === 'prive' && c.membres?.includes(user.id) && c.membres?.includes(autreId));
      if (existante) return existante.id;
      const id = uid('conv');
      const eid = user.role === 'super_admin' ? (autre?.eglise_id || user.eglise_id) : user.eglise_id;
      maj((d) => { d.conversations.push({ id, eglise_id: eid, type: 'prive', titre: '', membres: [user.id, autreId], cree_par: user.id, cree_le: new Date().toISOString() }); return d; }, { vite: true });
      return id;
    },
    creerGroupe(titre, membres, type = 'groupe', egliseCible) {
      const id = uid('conv');
      maj((d) => { d.conversations.push({ id, eglise_id: egliseCible || user.eglise_id, type, titre: titre.trim(), membres: [...new Set([user.id, ...membres])], cree_par: user.id, cree_le: new Date().toISOString() }); return d; }, { vite: true });
      return id;
    },
    modifierConversation(id, champs) { maj((d) => { Object.assign(d.conversations.find((c) => c.id === id), champs); return d; }, { vite: true }); },
    // ---------- Fidèles, structures et bureaux ----------
    enregistrerFidele(f) {
      const id = f.id || uid('f');
      maj((d) => {
        const ex = d.fideles.find((x) => x.id === id);
        if (ex) Object.assign(ex, f);
        else d.fideles.push({ ...f, id, eglise_id: egliseId, date_enregistrement: f.date_enregistrement || today(), actif: true });
        return d;
      });
      return id;
    },
    enregistrerStructure(st) {
      const id = st.id || uid('str');
      maj((d) => {
        const ex = d.structures.find((x) => x.id === id);
        if (ex) Object.assign(ex, st);
        else { d.structures.push({ ...st, id, eglise_id: egliseId, actif: true, cree_le: new Date().toISOString() }); creerCaisse(d, id, st.nom); }
        return d;
      });
      return id;
    },
    // Chaque structure a sa propre caisse (avec des catégories de départ modifiables)
    creerCaisseStructure(sid) {
      const st = db.structures.find((x) => x.id === sid);
      maj((d) => { creerCaisse(d, sid, st.nom); return d; });
    },
    remettreEnAttente(id) { maj((d) => { const a = d.appartenances.find((x) => x.id === id); if (a) { a.statut = 'en_attente'; delete a.jusqu_au; } return d; }); },
    validerAppartenance(id, accepter) {
      maj((d) => { const a = d.appartenances.find((x) => x.id === id); Object.assign(a, accepter ? { statut: 'actif', depuis: today(), valide_par: user.id } : { statut: 'refuse', jusqu_au: today(), valide_par: user.id }); return d; }, { vite: true });
    },
    demanderStructure(sid) {
      const fiche = db.fideles.find((f) => f.user_id === user.id);
      if (!fiche) return 'Votre fiche de fidèle n\'est pas encore disponible.';
      const id = uid('ap');
      maj((d) => { d.appartenances.push({ id, eglise_id: egliseId, structure_id: sid, fidele_id: fiche.id, statut: 'en_attente', depuis: today(), demande: true }); return d; }, { vite: true });
      return { id };
    },
    // ---------- Suppressions (corbeille, restaurables) ----------
    supprimerFidele(id) {
      const f = db.fideles.find((x) => x.id === id);
      if (f?.user_id && db.users.some((u) => u.id === f.user_id)) return 'Cette personne a un compte : désactivez ou supprimez d\'abord son accès (Utilisateurs et rôles).';
      maj((d) => { d.fideles = d.fideles.filter((x) => x.id !== id); d.appartenances = d.appartenances.filter((a) => a.fidele_id !== id); return d; });
      return { corbeille: derniereCorbeille.current };
    },
    supprimerStructure(id) {
      const c = db.caisses.find((x) => x.structure_id === id);
      if (c && db.operations.some((o) => o.caisse_id === c.id)) return 'Sa caisse contient des opérations : désactivez plutôt la structure (son historique est conservé).';
      maj((d) => {
        d.structures = d.structures.filter((x) => x.id !== id);
        if (c) { d.caisses = d.caisses.filter((x) => x.id !== c.id); d.categories = d.categories.filter((x) => x.caisse_id !== c.id); }
        d.appartenances = d.appartenances.filter((a) => a.structure_id !== id);
        d.postes = d.postes.filter((p) => p.structure_id !== id);
        return d;
      });
      return { corbeille: derniereCorbeille.current };
    },
    supprimerCotisation(id) {
      if ((db.paiements || []).some((p) => p.cotisation_id === id && !p.annule)) { maj((d) => { d.cotisations.find((x) => x.id === id).actif = false; return d; }); return { desactivee: true }; }
      maj((d) => { d.cotisations = d.cotisations.filter((x) => x.id !== id); return d; });
      return { corbeille: derniereCorbeille.current };
    },
    supprimerActivite(id) {
      maj((d) => { d.activites = d.activites.filter((x) => x.id !== id); return d; });
      return { corbeille: derniereCorbeille.current };
    },
    supprimerInvitation(id) {
      const u = db.users.find((x) => x.id === id);
      if (u?.auth_id) return 'Ce compte est déjà utilisé : désactivez-le plutôt.';
      maj((d) => { d.users = d.users.filter((x) => x.id !== id); const f = d.fideles.find((x) => x.user_id === id); if (f) delete f.user_id; return d; });
      return { corbeille: derniereCorbeille.current };
    },
    annulerDemande(id) { maj((d) => { d.demandes = d.demandes.filter((x) => x.id !== id); return d; }); return { corbeille: derniereCorbeille.current }; },
    modifierGroupe(id, patch) { maj((d) => { Object.assign(d.conversations.find((c) => c.id === id), patch); return d; }); },
    supprimerGroupe(id) { maj((d) => { d.conversations = d.conversations.filter((c) => c.id !== id); return d; }); return { corbeille: derniereCorbeille.current }; },
    // ---------- Activités ----------
    enregistrerActivite(a) {
      const id = a.id || uid('act');
      maj((d) => {
        d.activites = d.activites || [];
        const ex = d.activites.find((x) => x.id === id);
        // Si la date change, les rappels seront renvoyés pour la nouvelle date
        if (ex) Object.assign(ex, a, ex.debut !== a.debut ? { rappels_envoyes: [] } : {});
        else d.activites.push({ statut: 'programmee', destinataires: a.structure_id ? 'structure' : 'eglise', rappels: [1440, 120], ...a, id, eglise_id: egliseId, cree_par: user.id, cree_le: new Date().toISOString() });
        return d;
      }, { vite: true });
      return id;
    },
    annulerActivite(id, motif) {
      maj((d) => { Object.assign(d.activites.find((x) => x.id === id), { statut: 'annulee', annulation: { motif, par: user.id, le: new Date().toISOString() } }); return d; }, { vite: true });
    },
    marquerActivite(id, statut) {
      maj((d) => { Object.assign(d.activites.find((x) => x.id === id), { statut, statut_par: user.id, statut_le: new Date().toISOString() }); return d; }, { vite: true });
    },
    // ---------- Cotisations ----------
    enregistrerCotisation(c) {
      const id = c.id || uid('cot');
      maj((d) => { const ex = d.cotisations.find((x) => x.id === id); if (ex) Object.assign(ex, c); else d.cotisations.push({ ...c, id, eglise_id: egliseId, actif: true, cree_le: new Date().toISOString() }); return d; });
      return id;
    },
    // Un paiement crée la recette correspondante dans la caisse de la structure : suivi et caisse restent cohérents
    payerCotisation({ cotisation, fidele, periode, montant, date }) {
      if (estVerrouille(db, cotisation.caisse_id, date)) return 'Le mois de ce paiement est clôturé pour la caisse.';
      const opId = uid('op'), paId = uid('pay');
      // Sans période choisie, le paiement couvre les prochaines occurrences dues (une nouvelle occurrence est créée au besoin)
      const parts = periode ? [{ periode, montant }] : repartir(db, cotisation, fidele.id, montant);
      const validation = !!eglise?.parametres?.validation_pasteur;
      maj((d) => {
        d.operations.push({ id: opId, eglise_id: egliseId, caisse_id: cotisation.caisse_id, type: 'recette', date, montant, categorie_id: cotisation.categorie_id || `${egliseId}_autre_recette`,
          libelle: `Cotisation ${cotisation.nom} — ${fidele.prenom} ${fidele.nom || ''}`.trim(), description: parts.map((p) => libellePeriode(p.periode)).join(', '),
          cotisation_id: cotisation.id, paiement_id: paId, cree_par: user.id, cree_le: new Date().toISOString(), ...(validation ? { statut: can('fin.valider', cotisation.caisse_id) ? 'validee' : 'a_valider' } : {}) });
        parts.forEach((p, i) => d.paiements.push({ id: i ? `${paId}_${i}` : paId, eglise_id: egliseId, cotisation_id: cotisation.id, fidele_id: fidele.id, periode: p.periode, montant: p.montant, date, operation_id: opId, par: user.id, le: new Date().toISOString() }));
        return d;
      });
      return { parts };
    },
    annulerPaiement(paId, motif) {
      const p = db.paiements.find((x) => x.id === paId);
      const o = db.operations.find((x) => x.id === p?.operation_id);
      if (o && estValidee(db, o)) {
        const e = actions.contrePasser(o.id, motif || 'Paiement de cotisation annulé');
        if (e) return e;
        maj((d) => { d.paiements.forEach((x) => { if (x.operation_id === p.operation_id) Object.assign(x, { annule: true, annule_le: new Date().toISOString(), motif }); }); return d; });
        return null;
      }
      // Tous les paiements liés à la même recette sont annulés ensemble
      maj((d) => { d.paiements = d.paiements.filter((x) => x.operation_id !== p.operation_id); d.operations = d.operations.filter((x) => x.id !== p.operation_id); return d; });
      return null;
    },
    ajouterMembres(sid, fids) {
      const crees = [];
      maj((d) => {
        for (const fid of fids) {
          if (d.appartenances.some((a) => a.structure_id === sid && a.fidele_id === fid && !a.jusqu_au && a.statut !== 'en_attente')) continue;
          const ex = d.appartenances.find((a) => a.structure_id === sid && a.fidele_id === fid && a.statut === 'en_attente');
          if (ex) { Object.assign(ex, { statut: 'actif', depuis: today() }); continue; }
          const id = uid('ap'); crees.push(id);
          d.appartenances.push({ id, eglise_id: egliseId, structure_id: sid, fidele_id: fid, depuis: today() });
        }
        return d;
      });
      return crees;
    },
    // Annule un ajout ou une demande d'adhésion (retour en arrière immédiat)
    retirerAppartenances(ids) { maj((d) => { d.appartenances = d.appartenances.filter((a) => !ids.includes(a.id)); return d; }); },
    // Annule une sortie de structure : l'appartenance redevient active
    retablirMembre(appId) {
      maj((d) => { const a = d.appartenances.find((x) => x.id === appId); if (a) { delete a.jusqu_au; delete a.motif_sortie; a.statut = 'actif'; } return d; });
    },
    // Retirer un membre ne supprime rien : l'appartenance est close et reste dans l'historique
    retirerMembre(appId, motif) {
      maj((d) => {
        const a = d.appartenances.find((x) => x.id === appId);
        Object.assign(a, { jusqu_au: today(), motif_sortie: motif || '' });
        d.postes.forEach((p) => { if (p.structure_id === a.structure_id && p.fidele_id === a.fidele_id) { p.historique = [...(p.historique || []), { fidele_id: p.fidele_id, depuis: p.depuis, jusqu_au: today() }]; p.fidele_id = null; } });
        return d;
      });
    },
    enregistrerPoste(p) {
      const id = p.id || uid('po');
      maj((d) => {
        const ex = d.postes.find((x) => x.id === id);
        if (ex) Object.assign(ex, p);
        else d.postes.push({ ...p, id, eglise_id: egliseId, actif: true, historique: [], ordre: p.ordre ?? d.postes.filter((x) => x.structure_id === p.structure_id).length });
        return d;
      });
      return id;
    },
    // Changer le titulaire d'un poste garde la trace des anciens titulaires
    attribuerPoste(posteId, fid) {
      maj((d) => {
        const p = d.postes.find((x) => x.id === posteId);
        if (p.fidele_id && p.fidele_id !== fid) p.historique = [...(p.historique || []), { fidele_id: p.fidele_id, depuis: p.depuis || '', jusqu_au: today() }];
        p.fidele_id = fid || null; p.depuis = fid ? today() : null;
        if (fid && !d.appartenances.some((a) => a.structure_id === p.structure_id && a.fidele_id === fid && !a.jusqu_au)) d.appartenances.push({ id: uid('ap'), eglise_id: egliseId, structure_id: p.structure_id, fidele_id: fid, depuis: today() });
        return d;
      });
    },
    supprimerPoste(posteId) {
      maj((d) => {
        const p = d.postes.find((x) => x.id === posteId);
        if (p.fidele_id) p.historique = [...(p.historique || []), { fidele_id: p.fidele_id, depuis: p.depuis || '', jusqu_au: today() }];
        Object.assign(p, { actif: false, fidele_id: null });
        return d;
      });
    },
    // ---------- Validation et contre-passation ----------
    validerOperations(ids) {
      const le = new Date().toISOString();
      maj((d) => { d.operations.forEach((o) => { if (ids.includes(o.id) && o.statut === 'a_valider') Object.assign(o, { statut: 'validee', valide_par: user.id, valide_le: le }); }); return d; }, { vite: true });
    },
    // Annule une opération validée par une écriture inverse : rien n'est effacé, tout reste tracé
    contrePasser(id, motif) {
      const o = db.operations.find((x) => x.id === id);
      if (!o || o.annulee_par) return 'Cette opération a déjà été annulée.';
      const date = today();
      if (estVerrouille(db, o.caisse_id, date)) return 'Le mois en cours est clôturé pour cette caisse.';
      const nid = uid('op');
      maj((d) => {
        d.operations.push({ id: nid, eglise_id: o.eglise_id, caisse_id: o.caisse_id, type: o.type === 'recette' ? 'depense' : 'recette', date, montant: o.montant,
          libelle: `Annulation : ${o.libelle}`.slice(0, 120), categorie_id: o.categorie_id, description: motif, observations: `Contre-passation de l'opération du ${o.date.split('-').reverse().join('/')}`,
          contre_passation_de: o.id, cree_par: user.id, cree_le: new Date().toISOString(), ...(eglise?.parametres?.validation_pasteur ? { statut: can('fin.valider') ? 'validee' : 'a_valider' } : {}) });
        const orig = d.operations.find((x) => x.id === o.id);
        orig.annulee_par = nid;
        return d;
      }, { trace: { action: 'contre_passation', table: 'operations', objet_id: o.id, libelle: `${o.libelle} (${fcfa(o.montant)})`, detail: motif, lien: `/operations/${nid}` } });
      return null;
    },
    // ---------- Réouverture ----------
    demanderReouverture(caisseId, ym, motif) {
      maj((d) => { d.demandes = [...(d.demandes || []), { id: uid('dem'), eglise_id: egliseId, type: 'reouverture', caisse_id: caisseId, mois: ym, motif, demandeur: user.id, statut: 'en_attente', le: new Date().toISOString() }]; return d; }, { vite: true });
    },
    traiterDemande(id, accepter) {
      const dem = db.demandes.find((x) => x.id === id);
      maj((d) => {
        const x = d.demandes.find((y) => y.id === id);
        Object.assign(x, { statut: accepter ? 'acceptee' : 'refusee', traite_par: user.id, traite_le: new Date().toISOString() });
        if (accepter) d.clotures = d.clotures.filter((c) => !(c.caisse_id === dem.caisse_id && c.mois >= dem.mois));
        return d;
      }, { vite: true });
    },
    // ---------- Comptes ----------
    async motDePasseOublie(email) {
      if (!online) return 'En mode démonstration, demandez à l\'administrateur de vous donner un mot de passe temporaire.';
      const { error } = await supabase().auth.resetPasswordForEmail(email.trim());
      return error ? messageAuth(error) : null;
    },
    async reinitialiserAvecCode(email, code, nouveau) {
      const sb = supabase();
      const v = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
      if (v.error) return 'Code incorrect ou expiré. Demandez un nouveau code.';
      const { error } = await sb.auth.updateUser({ password: nouveau });
      if (error) return messageAuth(error);
      return ouvrirSessionEnLigne(v.data.session);
    },
    async motDePasseTemporaire(userId) {
      const mdp = Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000);
      if (!online) { maj((d) => { const u = d.users.find((x) => x.id === userId); u.mdp = mdp; u.doit_changer_mdp = true; return d; }); return { mdp }; }
      const { data, error } = await supabase().functions.invoke('compte', { body: { action: 'mot_de_passe_temporaire', user_id: userId } });
      if (error || data?.erreur) return { erreur: data?.erreur || 'Opération impossible : vérifiez que la fonction « compte » est installée sur le serveur.' };
      synchroniser();
      return { mdp: data.mot_de_passe };
    },
    async nouveauMotDePasse(nouveau) {
      if (online) { const { error } = await supabase().auth.updateUser({ password: nouveau }); if (error) return messageAuth(error); }
      const ids = new Set(mesAdhesions.map((a) => a.id));
      maj((d) => { d.users.forEach((u) => { if (ids.has(u.id)) { delete u.doit_changer_mdp; if (!online) u.mdp = nouveau; } }); return d; });
      return null;
    },
    async urlPiece(piece) {
      if (piece.local) return piece.local;
      const attente = piecesAttente.trouver(piece.chemin);
      if (attente) return attente.dataUrl;
      if (!online) return null;
      const { data, error } = await supabase().storage.from('pieces').createSignedUrl(piece.chemin, 3600);
      return error ? null : data.signedUrl;
    },
    // ---------- Import Excel ----------
    importerOperations({ caisse_id, lignes, nouvellesCategories = [], fichier }) {
      const lot = uid('imp');
      const maintenant = new Date().toISOString();
      maj((d) => {
        for (const c of nouvellesCategories) if (!d.categories.some((x) => x.id === c.id)) d.categories.push({ ...c, eglise_id: egliseId });
        for (const l of lignes) {
          d.operations.push({ id: uid('op'), eglise_id: egliseId, caisse_id, type: l.type, date: l.date, libelle: l.libelle.slice(0, 120), categorie_id: l.categorie_id,
            montant: l.montant, description: l.description || '', observations: l.observations || '', import_lot: lot, cree_par: user.id, cree_le: maintenant });
        }
        return d;
      }, { trace: { action: 'import', table: 'operations', objet_id: lot, libelle: `${lignes.length} opération(s) importée(s)`, detail: fichier || '', lien: `/caisses/${caisse_id}` } });
      return lot;
    },
    annulerImport(lot) {
      const ops = db.operations.filter((o) => o.import_lot === lot);
      if (ops.some((o) => estVerrouille(db, o.caisse_id, o.date))) return 'Impossible : un des mois concernés est clôturé.';
      maj((d) => { d.operations = d.operations.filter((o) => o.import_lot !== lot); return d; }, { trace: { action: 'annulation_import', table: 'operations', objet_id: lot, libelle: `${ops.length} opération(s) retirée(s)` } });
      return null;
    },
    // ---------- Validations ----------
    validerEglise(id, accepter) {
      maj((d) => { const e = d.eglises.find((x) => x.id === id); e.statut = accepter ? 'actif' : 'refuse'; e.valide_le = new Date().toISOString(); e.valide_par = user.id; return d; }, { vite: true });
    },
    validerMembre(id, accepter) {
      maj((d) => { const u = d.users.find((x) => x.id === id); u.statut = accepter ? 'actif' : 'refuse'; u.valide_le = new Date().toISOString(); u.valide_par = user.id; return d; }, { vite: true });
    },
    async rejoindreEglise(eid) {
      if (online) { try { await rejoindreServeur(eid); await synchroniser({ complet: true }); return null; } catch (e) { return messageAuth(e); } }
      if (mesAdhesions.some((a) => a.eglise_id === eid)) return 'Vous faites déjà partie de cette église.';
      maj((d) => { d.users.push({ ...user, id: uid('u'), eglise_id: eid, role: 'pasteur', caisses: [], statut: 'en_attente', validation: 'super', le: today() }); return d; });
      return null;
    },
    async creerAutreEglise({ nom, ville }) {
      const eid = uid('egl');
      const eg = nouvelleEglise(eid, nom.trim(), ville?.trim() || '', 'en_attente');
      const m = modeleEglise(eid);
      if (online) {
        try { await creerEgliseServeur(eg); } catch (e) { return messageAuth(e); }
        await synchroniser({ complet: true });
        maj((d) => { d.caisses.push(...m.caisses); d.categories.push(...m.categories); d.conversations.push(...m.conversations); d.structures = [...(d.structures || []), ...structuresModele(eid)]; return d; });
      } else {
        maj((d) => {
          d.eglises.push(eg); d.caisses.push(...m.caisses); d.categories.push(...m.categories); d.conversations.push(...m.conversations);
          d.structures = [...(d.structures || []), ...structuresModele(eid)];
          d.users.push({ ...user, id: uid('u'), eglise_id: eid, role: 'admin', caisses: [], statut: 'actif' });
          return d;
        });
      }
      return null;
    },
    // ---------- Profil et configuration ----------
    majPhoto(photo) {
      const ids = new Set(mesAdhesions.map((a) => a.id));
      maj((d) => { d.users.forEach((u) => { if (ids.has(u.id)) u.photo = photo; }); if (d.annuaire) d.annuaire.forEach((u) => { if (ids.has(u.id)) u.photo = photo; }); return d; });
    },
    enregistrerConfiguration({ eglise: champs, structures, caisses, categories, parametres, droits, membres }) {
      maj((d) => {
        const e = d.eglises.find((x) => x.id === egliseId);
        Object.assign(e, champs || {});
        if (parametres) e.parametres = { ...e.parametres, ...parametres };
        if (droits) for (const [r, v] of Object.entries(droits)) e.droits[r] = { ...(e.droits[r] || {}), ...v };
        if (structures) {
          const gardees = new Set(structures.map((x) => x.id));
          const retirees = (d.structures || []).filter((x) => x.eglise_id === egliseId && !gardees.has(x.id));
          const aConserver = retirees.filter((x) => { const c = d.caisses.find((k) => k.structure_id === x.id); return c && d.operations.some((o) => o.caisse_id === c.id); }).map((x) => ({ ...x, actif: false }));
          const anciennes = new Set((d.structures || []).map((x) => x.id));
          d.structures = [...(d.structures || []).filter((x) => x.eglise_id !== egliseId), ...structures.map((x) => ({ ...(d.structures.find((y) => y.id === x.id) || {}), ...x, eglise_id: egliseId })), ...aConserver];
          for (const x of structures) if (!anciennes.has(x.id)) creerCaisse(d, x.id, x.nom);
        }
        if (caisses) {
          const garder = new Set(caisses.map((c) => c.id));
          d.caisses.forEach((c) => { if (c.eglise_id === egliseId && !c.structure_id && !garder.has(c.id)) c.actif = false; });
          caisses.forEach((c, i) => { const ex = d.caisses.find((x) => x.id === c.id); if (ex) Object.assign(ex, c, { actif: true, ordre: i }); else d.caisses.push({ ...c, eglise_id: egliseId, actif: true, ordre: i }); });
        }
        if (categories) {
          const garder = new Set(categories.map((c) => c.id));
          const deStructure = new Set(d.caisses.filter((c) => c.structure_id).map((c) => c.id));
          d.categories = d.categories.filter((c) => c.eglise_id !== egliseId || c.systeme || deStructure.has(c.caisse_id) || garder.has(c.id) || d.operations.some((o) => o.categorie_id === c.id));
          categories.forEach((c) => { if (!d.categories.some((x) => x.id === c.id)) d.categories.push({ ...c, eglise_id: egliseId }); });
        }
        for (const mb of membres || []) {
          if (!mb.email || d.users.some((u) => u.eglise_id === egliseId && u.email.toLowerCase() === mb.email.toLowerCase())) continue;
          d.users.push({ ...(online ? {} : { mdp: 'eglise360' }), id: uid('u'), eglise_id: egliseId, prenom: mb.prenom, nom: mb.nom || '', email: mb.email.trim().toLowerCase(), role: mb.role, caisses: mb.caisses || [], actif: true, statut: 'actif' });
        }
        return d;
      });
    },
    // ---------- Préférences de discussion (synchronisées) ----------
    prefConversation(convId, champs) {
      maj((d) => {
        const conv = d.conversations.find((c) => c.id === convId);
        let l = d.lectures.find((x) => x.conversation_id === convId && x.user_id === user.id);
        if (!l) { l = { id: `${convId}__${user.id}`, eglise_id: conv?.eglise_id || user.eglise_id, conversation_id: convId, user_id: user.id, recu: '', lu: '' }; d.lectures.push(l); }
        Object.assign(l, typeof champs === 'function' ? champs(l, d) : champs);
        return d;
      }, { vite: true });
    },
    lireNotif(id) {
      if (db.notifications?.some((n) => n.id === id)) maj((d) => { d.notifications.find((n) => n.id === id).lu = true; return d; });
      else notifsMaj((l) => l.map((n) => (n.id === id ? { ...n, lu: true } : n)));
    },
    toutLire() {
      notifsMaj((l) => l.map((n) => ({ ...n, lu: true })));
      if (db.notifications?.some((n) => !n.lu)) maj((d) => { d.notifications.forEach((n) => { n.lu = true; }); return d; });
    },
    masquerNotifs(ids) {
      notifsMaj((l) => l.filter((n) => !ids.includes(n.id)));
      if (db.notifications?.some((n) => ids.includes(n.id))) maj((d) => { d.notifications.forEach((n) => { if (ids.includes(n.id)) { n.lu = true; n.masque = true; } }); return d; });
    },
    viderNotifs() {
      notifsMaj(() => []);
      if (db.notifications?.length) maj((d) => { d.notifications.forEach((n) => { n.lu = true; n.masque = true; }); return d; });
    },
    synchroniser: () => synchroniser(),
    changerEglise(id) {
      if (user?.role === 'super_admin') { const s = { ...session, egliseId: id }; setSession(s); repository.session.ecrire(s); return; }
      const a = mesAdhesions.find((x) => x.eglise_id === id);
      if (a) { const s = { ...session, userId: a.id, egliseId: id }; setSession(s); repository.session.ecrire(s); }
    },

    enregistrerOperation(op, fichiers = []) {
      if (estVerrouille(db, op.caisse_id, op.date)) return 'Ce mois est clôturé pour cette caisse. Rouvrez-le avant de modifier.';
      const id = op.id || uid('op');
      // Pièces justificatives : métadonnées dans l'opération, fichier envoyé au stockage
      const nouvelles = fichiers.map((f) => ({ id: f.id, nom: f.nom, type: f.type, taille: f.taille, chemin: `${egliseId}/${id}/${f.id}.${f.ext}`, le: new Date().toISOString(), par: user.id, ...(online ? {} : { local: f.dataUrl }) }));
      if (online) for (const f of fichiers) piecesAttente.ajouter({ chemin: `${egliseId}/${id}/${f.id}.${f.ext}`, dataUrl: f.dataUrl, type: f.type });
      const validation = !!eglise?.parametres?.validation_pasteur;
      maj((d) => {
        if (op.id) {
          const i = d.operations.findIndex((o) => o.id === op.id);
          const ancien = d.operations[i];
          if (estVerrouille(d, ancien.caisse_id, ancien.date)) return d;
          d.operations[i] = { ...ancien, ...op, pieces: [...(op.pieces || ancien.pieces || []), ...nouvelles], modifie_par: user.id, modifie_le: new Date().toISOString() };
        } else {
          d.operations.push({ ...op, id, pieces: nouvelles, eglise_id: egliseId, cree_par: user.id, cree_le: new Date().toISOString(),
            ...(validation ? (can('fin.valider') ? { statut: 'validee', valide_par: user.id, valide_le: new Date().toISOString() } : { statut: 'a_valider' }) : {}) });
        }
        return d;
      });
      return null;
    },
    supprimerOperation(id) {
      const o = db.operations.find((x) => x.id === id);
      if (!o) return null;
      if (estValidee(db, o)) return 'Une opération validée ne peut pas être supprimée : utilisez la contre-passation.';
      const liees = o.transfert_id ? db.operations.filter((x) => x.transfert_id === o.transfert_id) : [o];
      if (liees.some((x) => estVerrouille(db, x.caisse_id, x.date))) return 'Impossible : un mois concerné est clôturé.';
      maj((d) => { d.operations = d.operations.filter((x) => !liees.some((l) => l.id === x.id)); return d; });
      return { corbeille: derniereCorbeille.current };
    },
    transferer({ source, destination, date, montant, libelle, observations }) {
      if (estVerrouille(db, source, date) || estVerrouille(db, destination, date)) return 'Le mois est clôturé pour l\'une des deux caisses.';
      const cs = db.caisses.find((c) => c.id === source), cd = db.caisses.find((c) => c.id === destination);
      const tid = uid('tr');
      maj((d) => {
        const base = { eglise_id: egliseId, date, montant, observations, description: libelle || '', transfert_id: tid, cree_par: user.id, cree_le: new Date().toISOString() };
        d.operations.push({ ...base, id: uid('op'), caisse_id: source, type: 'depense', categorie_id: `${egliseId}_transfert_depense`, libelle: `Transfert vers ${cd.nom}` });
        d.operations.push({ ...base, id: uid('op'), caisse_id: destination, type: 'recette', categorie_id: `${egliseId}_transfert_recette`, libelle: `Transfert depuis ${cs.nom}` });
        journaliser(d, 'transfert', `${cs.nom} → ${cd.nom}`);
        return d;
      });
      return null;
    },
    cloturerMois(caisseId, ym) {
      maj((d) => { if (!d.clotures.some((c) => c.caisse_id === caisseId && c.mois === ym)) d.clotures.push(cloturer(d, caisseId, ym, user.id)); journaliser(d, 'cloture', ym); return d; });
    },
    // Rouvrir un mois rouvre aussi les mois clôturés après lui (leurs soldes en dépendent)
    rouvrirMois(caisseId, ym) {
      maj((d) => { d.clotures = d.clotures.filter((c) => !(c.caisse_id === caisseId && c.mois >= ym)); return d; });
    },

    enregistrerCaisse(c) {
      maj((d) => {
        if (c.id) { const i = d.caisses.findIndex((x) => x.id === c.id); d.caisses[i] = { ...d.caisses[i], ...c }; }
        else d.caisses.push({ ...c, id: uid('c'), eglise_id: egliseId, ordre: d.caisses.filter((x) => x.eglise_id === egliseId).length, actif: true });
        return d;
      });
    },
    supprimerCaisse(id) {
      if (db.operations.some((o) => o.caisse_id === id)) {
        maj((d) => { d.caisses.find((c) => c.id === id).actif = false; return d; });
        return 'archivee';
      }
      maj((d) => { d.caisses = d.caisses.filter((c) => c.id !== id); d.categories = d.categories.filter((c) => c.caisse_id !== id); return d; });
      return { corbeille: derniereCorbeille.current };
    },
    // Restaure des éléments de la corbeille (opérations, caisses, catégories, structures)
    restaurer(ids) {
      // dbRef : l'annulation peut être déclenchée depuis un bandeau affiché avant la dernière mise à jour
      const entrees = (dbRef.current.corbeille || []).filter((c) => ids.includes(c.id));
      if (!entrees.length) return;
      maj((d) => {
        for (const e of entrees) {
          for (const o of e.objets) if (!d[e.table].some((x) => x.id === o.id)) d[e.table].push(o);
        }
        d.corbeille = d.corbeille.filter((c) => !ids.includes(c.id));
        return d;
      }, { trace: { action: 'restauration', table: entrees[0].table, objet_id: entrees[0].objets[0]?.id, libelle: entrees.map((e) => e.libelle).join(', ') } });
    },
    restaurerCaisse(id) { maj((d) => { const c = d.caisses.find((x) => x.id === id); if (c) c.actif = true; return d; }); },

    enregistrerCategorie(c) {
      maj((d) => {
        if (c.id) { const i = d.categories.findIndex((x) => x.id === c.id); d.categories[i] = { ...d.categories[i], ...c }; }
        else d.categories.push({ ...c, id: uid('cat'), eglise_id: egliseId });
        return d;
      });
    },
    reactiverCategorie(id) { maj((d) => { d.categories.find((c) => c.id === id).actif = true; return d; }); },
    supprimerCategorie(id) {
      const cat = db.categories.find((c) => c.id === id);
      // Une catégorie déjà utilisée n'est pas supprimée : elle est désactivée (l'historique reste intact)
      if (db.operations.some((o) => o.categorie_id === id)) { maj((d) => { d.categories.find((c) => c.id === id).actif = false; return d; }); return { desactivee: true }; }
      maj((d) => {
        const autre = `${egliseId}_autre_${cat.type}`;
        d.operations.forEach((o) => { if (o.categorie_id === id) o.categorie_id = autre; });
        d.categories = d.categories.filter((c) => c.id !== id);
        return d;
      }, { trace: { action: 'suppression', table: 'categories', objet_id: id, libelle: cat?.nom, lien: '/corbeille' } });
      return { corbeille: derniereCorbeille.current };
    },

    enregistrerUtilisateur(u) {
      if (!u.id && db.users.some((x) => x.eglise_id === (u.eglise_id || egliseId) && x.email.toLowerCase() === u.email.toLowerCase())) return 'Cette personne fait déjà partie de l\'église.';
      const nid = uid('u');
      const ficheLiee = u.fidele_id;
      maj((d) => {
        if (!u.id) {
          // Chaque compte a sa fiche de fidèle : on lie une fiche existante, sinon on en crée une
          const eg = u.eglise_id || egliseId;
          if (ficheLiee) { const f = d.fideles.find((x) => x.id === ficheLiee); if (f) f.user_id = nid; }
          else if (u.role !== 'super_admin') d.fideles.push({ id: `f_${nid}`, eglise_id: eg, prenom: u.prenom, nom: u.nom || '', email: u.email, user_id: nid, date_enregistrement: today(), actif: true });
        }
        if (u.id) { const i = d.users.findIndex((x) => x.id === u.id); d.users[i] = { ...d.users[i], ...u }; }
        else d.users.push({ ...(online ? {} : { mdp: d.users.find((x) => x.email.toLowerCase() === u.email.toLowerCase())?.mdp || 'eglise360' }), actif: true, statut: 'actif', caisses: [], ...Object.fromEntries(Object.entries(u).filter(([k]) => k !== 'fidele_id')), email: u.email.trim().toLowerCase(), id: nid, eglise_id: u.eglise_id || egliseId });
        return d;
      });
      return null;
    },
    async changerMotDePasse(ancien, nouveau) {
      if (online) {
        const sb = supabase();
        const v = await sb.auth.signInWithPassword({ email: user.email, password: ancien });
        if (v.error) return 'Le mot de passe actuel est incorrect.';
        const { error } = await sb.auth.updateUser({ password: nouveau });
        return error ? messageAuth(error) : null;
      }
      if (user.mdp !== ancien) return 'Le mot de passe actuel est incorrect.';
      maj((d) => { d.users.find((x) => x.id === user.id).mdp = nouveau; return d; });
      return null;
    },
    majDroits(role, cle, valeur) { maj((d) => { const e = d.eglises.find((x) => x.id === egliseId); e.droits[role] = { ...(e.droits[role] || {}), [cle]: valeur }; return d; }); },
    majEglise(champs) { maj((d) => { Object.assign(d.eglises.find((x) => x.id === egliseId), champs); return d; }); },
    majParametres(champs) { maj((d) => { const e = d.eglises.find((x) => x.id === egliseId); e.parametres = { ...e.parametres, ...champs }; return d; }); },
    creerEglise({ nom, ville, adminPrenom, adminNom, adminEmail }) {
      if (db.users.some((x) => x.email.toLowerCase() === adminEmail.toLowerCase())) return 'Cette adresse e-mail est déjà utilisée.';
      maj((d) => {
        const eid = uid('egl');
        d.eglises.push(nouvelleEglise(eid, nom, ville, 'actif'));
        d.structures = [...(d.structures || []), ...structuresModele(eid)];
        const m = modeleEglise(eid);
        d.caisses.push(...m.caisses); d.categories.push(...m.categories); d.conversations.push(...m.conversations);
        d.users.push({ id: uid('u'), eglise_id: eid, prenom: adminPrenom, nom: adminNom, email: adminEmail.trim().toLowerCase(), ...(online ? {} : { mdp: 'eglise360' }), role: 'admin', caisses: [], actif: true });
        return d;
      });
      return null;
    },
    async reinitialiserDemo() { const d = await repository.reinitialiser(); setDb(d); },
  };

  const toutesNotifs = useMemo(() => {
    const ids = new Set(mesAdhesions.map((a) => a.id));
    const serveur = (db?.notifications || []).filter((n) => ids.has(n.user_id) && !n.masque);
    return [...notifs, ...serveur].sort((a, b) => (b.le || '').localeCompare(a.le || '')).slice(0, 150);
  }, [notifs, db?.notifications, mesAdhesions]);
  const value = { db, user, eglise, egliseId, can, actions, notifier, toast, sync, online, notifs: toutesNotifs, mesAdhesions, pret: !!db, aujourdhui: today() };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
