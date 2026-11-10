// Synchronisation « d'abord sur l'appareil » :
// 1. chaque modification est appliquée localement puis placée dans une file d'attente ;
// 2. dès qu'il y a du réseau, la file est envoyée au serveur (push) ;
// 3. puis les changements faits par les autres téléphones sont récupérés (pull).
// Tout est stocké dans une seule table générique « enregistrements », ce qui permet
// d'ajouter les futurs modules (membres, programmes…) sans changer le serveur.
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

export const TABLES = ['eglises', 'users', 'caisses', 'categories', 'operations', 'clotures', 'journal', 'conversations', 'messages', 'lectures', 'appareils', 'structures', 'presences', 'historique', 'corbeille', 'notifications', 'demandes', 'fideles', 'appartenances', 'postes', 'cotisations', 'paiements', 'activites'];
export const dbVide = () => ({ version: 1, eglises: [], users: [], caisses: [], categories: [], operations: [], clotures: [], journal: [], conversations: [], messages: [], lectures: [], appareils: [], structures: [], presences: [], historique: [], corbeille: [], notifications: [], demandes: [], fideles: [], appartenances: [], postes: [], cotisations: [], paiements: [], activites: [], resumes: [], annuaire: [] });

let client = null, clientUrl = null;
export function supabase() {
  const c = config();
  if (!c.url) return null;
  if (!client || clientUrl !== c.url) {
    client = createClient(c.url, c.cle, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'eglise360-auth', detectSessionInUrl: false } });
    clientUrl = c.url;
  }
  return client;
}

const egliseDe = (t, r) => (t === 'eglises' ? r.id : r.eglise_id || '_global');
const nettoyer = (r) => { const c = { ...r }; delete c.mdp; return c; };
const cle = (t, id) => `${t}:${id}`;

// Différences entre deux états de la base locale → opérations à envoyer
export function differences(avant, apres) {
  const ops = [];
  for (const t of TABLES) {
    const anciens = new Map((avant?.[t] || []).map((r) => [r.id, r]));
    for (const r of apres[t] || []) {
      const o = anciens.get(r.id);
      if (!o || JSON.stringify(o) !== JSON.stringify(r)) ops.push({ t, id: r.id, row: r, supprime: false });
      anciens.delete(r.id);
    }
    for (const [id, r] of anciens) ops.push({ t, id, row: r, supprime: true });
  }
  return ops;
}

export function ajouterAFile(file, ops) {
  const f = { ...file };
  for (const o of ops) f[cle(o.t, o.id)] = o;
  return f;
}

const enLigneReseau = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

// Envoie la file. Renvoie les clés traitées (envoyées ou refusées) et les refus
export async function pousser(file) {
  const sb = supabase();
  const entrees = Object.entries(file);
  const traites = [], refuses = [];
  if (!entrees.length) return { traites, refuses };
  const lignes = (es) => es.map(([, e]) => ({ table_nom: e.t, id: e.id, eglise_id: egliseDe(e.t, e.row), data: nettoyer(e.row), supprime: !!e.supprime }));
  // Les églises d'abord (les droits en dépendent), puis les utilisateurs, puis le reste
  // Un envoi par table (dans l'ordre des dépendances) : une discussion est créée avant ses messages
  const lots = [];
  for (const t of TABLES) {
    const ls = entrees.filter(([, e]) => e.t === t);
    for (let i = 0; i < ls.length; i += 200) lots.push(ls.slice(i, i + 200));
  }
  for (const lot of lots) {
    const { error } = await sb.from('enregistrements').upsert(lignes(lot), { onConflict: 'table_nom,id' });
    if (!error) { traites.push(...lot); continue; }
    if (!estRefus(error)) throw error;
    // Lot refusé : on isole les lignes en cause une par une
    for (const item of lot) {
      const r = await sb.from('enregistrements').upsert(lignes([item]), { onConflict: 'table_nom,id' });
      if (!r.error) traites.push(item);
      else if (estRefus(r.error)) { traites.push(item); refuses.push({ t: item[1].t, id: item[1].id }); }
      else throw r.error;
    }
  }
  return { traites, refuses };
}
const estRefus = (e) => e?.code === '42501' || /row-level security|violates/i.test(e?.message || '');

// Récupère ce qui a changé depuis la dernière synchronisation
export async function tirer(depuis) {
  const sb = supabase();
  const lignes = [];
  let page = 0, max = depuis;
  for (;;) {
    const { data, error } = await sb.from('enregistrements').select('table_nom,id,data,supprime,maj_le')
      .gt('maj_le', depuis || '1970-01-01T00:00:00Z').order('maj_le', { ascending: true }).range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    lignes.push(...data);
    if (data.length) max = data[data.length - 1].maj_le;
    if (data.length < 1000) break;
    page++;
  }
  // Petit chevauchement pour ne rien manquer en cas d'écritures simultanées
  const suivant = max ? new Date(Date.parse(max) - 3000).toISOString() : depuis;
  return { lignes, suivant };
}

export async function relire(refs) {
  const sb = supabase();
  const out = [];
  for (const t of [...new Set(refs.map((r) => r.t))]) {
    const ids = refs.filter((r) => r.t === t).map((r) => r.id);
    const { data } = await sb.from('enregistrements').select('table_nom,id,data,supprime').eq('table_nom', t).in('id', ids);
    const trouves = new Set((data || []).map((d) => d.id));
    out.push(...(data || []), ...ids.filter((id) => !trouves.has(id)).map((id) => ({ table_nom: t, id, supprime: true })));
  }
  return out;
}

// Fusionne des lignes serveur dans la base locale, sans écraser ce qui attend d'être envoyé
export function fusionner(db, lignes, file = {}) {
  const d = { ...db };
  const parTable = {};
  for (const l of lignes) {
    if (!TABLES.includes(l.table_nom) || file[cle(l.table_nom, l.id)]) continue;
    (parTable[l.table_nom] ||= []).push(l);
  }
  for (const [t, ls] of Object.entries(parTable)) {
    const m = new Map((d[t] || []).map((r) => [r.id, r]));
    for (const l of ls) { if (l.supprime) m.delete(l.id); else m.set(l.id, { ...l.data, id: l.id }); }
    d[t] = [...m.values()];
  }
  return d;
}

export async function resumesFideles() {
  const { data, error } = await supabase().rpc('resume_caisses');
  if (error) throw error;
  return data || [];
}

// Annuaire des membres (noms et rôles uniquement) pour la messagerie
export async function annuaire() {
  const { data, error } = await supabase().rpc('annuaire');
  if (error) return null;
  return data || [];
}

// Temps réel : prévient dès qu'un enregistrement visible change sur le serveur
export function ecouterServeur(egliseId, surChangement) {
  const sb = supabase();
  if (!sb) return () => {};
  const canal = sb.channel(`e360-${egliseId || 'tout'}-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'enregistrements', ...(egliseId ? { filter: `eglise_id=eq.${egliseId}` } : {}) }, (p) => {
      // Les signaux de présence (« vu il y a… ») ne justifient pas une synchronisation immédiate
      if ((p.new || p.old)?.table_nom === 'presences') return;
      surChangement(p);
    })
    .subscribe();
  return () => { sb.removeChannel(canal); };
}

// Adhésions : rattacher les invitations, rejoindre ou inscrire une autre église
export async function rattacher() { const { data } = await supabase().rpc('e360_rattacher'); return data || 0; }
export async function rejoindreServeur(eglise) { const { data, error } = await supabase().rpc('e360_rejoindre', { eglise }); if (error) throw error; return data; }
export async function creerEgliseServeur(eglise) { const { data, error } = await supabase().rpc('e360_creer_eglise', { eglise }); if (error) throw error; return data; }

export async function listeStructures(eglise) {
  const { data, error } = await supabase().rpc('liste_structures', { eglise });
  if (error) return [];
  return data || [];
}

export async function listeEglises() {
  const { data, error } = await supabase().rpc('liste_eglises');
  if (error) throw error;
  return data || [];
}

export { enLigneReseau };

// Traduction des messages d'erreur d'authentification les plus courants
export function messageAuth(e) {
  const m = (e?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Adresse e-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Confirmez d\'abord votre adresse e-mail grâce au lien reçu par e-mail.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cette adresse e-mail.';
  if (m.includes('password')) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (m.includes('fetch') || m.includes('network')) return 'Pas de connexion internet. Réessayez quand le réseau est disponible.';
  if (m.includes('rate limit')) return 'Trop de tentatives. Patientez quelques minutes.';
  return e?.message || 'Une erreur est survenue.';
}
