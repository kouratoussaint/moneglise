// Mon Église — envoi des notifications Firebase (FCM)
// Déclenchée par un « Database Webhook » Supabase à chaque INSERT dans la table enregistrements.
// Secret requis : FIREBASE_SERVICE_ACCOUNT (contenu JSON de la clé de compte de service Firebase).
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const compte = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}');

type Ligne = { table_nom: string; id: string; eglise_id: string; data: Record<string, any>; supprime: boolean };

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const octets = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = ''; for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const pemVersDer = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));

let jetonCache: { valeur: string; expire: number } | null = null;
export async function jetonGoogle(): Promise<string> {
  const maintenant = Math.floor(Date.now() / 1000);
  if (jetonCache && jetonCache.expire > maintenant + 60) return jetonCache.valeur;
  const entete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corps = b64url(JSON.stringify({ iss: compte.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: maintenant, exp: maintenant + 3600 }));
  const cle = await crypto.subtle.importKey('pkcs8', pemVersDer(compte.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, new TextEncoder().encode(`${entete}.${corps}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${entete}.${corps}.${b64url(signature)}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Jeton Google refusé : ${JSON.stringify(j)}`);
  jetonCache = { valeur: j.access_token, expire: maintenant + (j.expires_in || 3600) };
  return j.access_token;
}

const lire = async (table: string, filtre: (q: any) => any): Promise<Ligne[]> => {
  const { data, error } = await filtre(sb.from('enregistrements').select('table_nom,id,eglise_id,data,supprime').eq('table_nom', table).eq('supprime', false));
  if (error) throw error;
  return data || [];
};
const nom = (u?: Ligne) => (u ? `${u.data.prenom || ''} ${u.data.nom ? `${u.data.nom[0]}.` : ''}`.trim() : 'Un membre');
const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)).replace(/\u202f|\u00a0/g, ' ')} F CFA`;
const actif = (u: Ligne) => u.data.actif !== false && (u.data.statut || 'actif') === 'actif';

// Types de notifications et réglages par défaut (modifiables par profil dans Droits d'accès)
const TOUS = ['eglises', 'adhesions', 'membres', 'operations', 'modifications', 'imports', 'clotures', 'configuration', 'messages', 'annonces', 'activites'];
const DEFAUT: Record<string, string[]> = {
  admin: TOUS, pasteur: TOUS,
  gestionnaire: ['operations', 'modifications', 'imports', 'clotures', 'messages', 'annonces', 'activites'],
  fidele: ['messages', 'annonces', 'activites'],
};
const eglisesCache = new Map<string, Ligne | undefined>();
async function eglise(id: string) {
  if (!eglisesCache.has(id)) eglisesCache.set(id, (await lire('eglises', (q) => q.eq('id', id)))[0]);
  return eglisesCache.get(id);
}
// Le super administrateur reçoit tout ; les autres selon le réglage de leur profil dans leur église
async function veut(u: Ligne, type: string) {
  if (u.data.role === 'super_admin') return true;
  const v = (await eglise(u.eglise_id))?.data?.droits?.[u.data.role]?.[`notif.${type}`];
  return v ?? (DEFAUT[u.data.role] || []).includes(type);
}

type Cible = { ids: string[]; titre: string; texte: string; lien: string; type: string; forces?: string[]; enregistrer?: boolean; eglise?: string };

const ACTIONS: Record<string, string> = {
  creation: 'Ajout', modification: 'Modification', suppression: 'Suppression', restauration: 'Restauration', validation: 'Validation',
  refus: 'Refus', cloture: 'Clôture', reouverture: 'Réouverture', import: 'Import Excel', annulation_import: 'Import annulé',
  demande_reouverture: 'Demande de réouverture', changement_role: 'Changement de rôle', contre_passation: 'Contre-passation',
};
function typeHistorique(h: Record<string, any>) {
  const t = h.table, a = h.action;
  if (a === 'import' || a === 'annulation_import') return 'imports';
  if (t === 'operations') return a === 'creation' ? 'operations' : 'modifications';
  if (t === 'clotures' || t === 'demandes' || a === 'cloture' || a === 'reouverture' || a === 'demande_reouverture') return 'clotures';
  if (t === 'users') return a === 'validation' || a === 'refus' ? 'adhesions' : 'membres';
  if (t === 'eglises' && (a === 'validation' || a === 'refus')) return 'eglises';
  return 'configuration';
}

// Qui doit être prévenu, et avec quel texte
async function destinataires(l: Ligne): Promise<Cible | null> {
  // Rappel d'activité créé par la tâche planifiée : notification déjà enregistrée, on l'envoie sur le téléphone
  if (l.table_nom === 'notifications' && l.data.push) {
    return { ids: [l.data.user_id], type: l.data.type || 'activites', titre: l.data.titre, texte: l.data.texte, lien: l.data.lien };
  }
  if (l.table_nom === 'historique' && l.data.table === 'activites') {
    const h = l.data;
    const changements = Object.keys(h.apres || {});
    if (h.action === 'modification' && !changements.some((k) => ['debut', 'fin', 'lieu'].includes(k))) return null;
    const { data: dest } = await sb.rpc('e360_destinataires_activite', { aid: h.objet_id });
    const users = dest?.length ? await lire('users', (q) => q.in('id', dest)) : [];
    const ids: string[] = [];
    for (const u of users) if (u.id !== h.user_id && await veut(u, 'activites')) ids.push(u.id);
    const quoi = h.action === 'creation' ? 'Nouvelle activité' : h.action === 'annulation' ? 'Activité annulée' : 'Activité modifiée';
    const detail = h.action === 'modification' ? changements.filter((k) => ['debut', 'fin', 'lieu'].includes(k)).map((k) => (k === 'lieu' ? `nouveau lieu : ${h.apres[k]}` : `${k === 'debut' ? 'début' : 'fin'} : ${String(h.apres[k]).replace('T', ' à ').split('-').reverse().join('/')}`)).join(' · ') : (h.detail || '');
    return { ids, type: 'activites', enregistrer: true, eglise: l.eglise_id, titre: `${quoi} · ${h.libelle}`, texte: detail || 'Touchez pour voir le détail', lien: `/activites/${h.objet_id}` };
  }
  if (l.table_nom === 'historique') {
    const h = l.data;
    const type = typeHistorique(h);
    const auteur = (await lire('users', (q) => q.eq('id', h.user_id)))[0];
    const forces: string[] = [];
    if (h.table === 'users' && h.objet_id) forces.push(h.objet_id); // la personne concernée est toujours prévenue
    if (h.table === 'eglises') forces.push(...(await lire('users', (q) => q.eq('eglise_id', l.eglise_id))).filter((u) => u.data.role === 'admin').map((u) => u.id));
    const membres = (await lire('users', (q) => q.eq('eglise_id', l.eglise_id))).filter(actif);
    const supers = (await lire('users', (q) => q.eq('data->>role', 'super_admin'))).filter(actif);
    const ids: string[] = [];
    for (const u of [...membres, ...supers]) if (u.id !== h.user_id && (forces.includes(u.id) || await veut(u, type))) ids.push(u.id);
    return { ids: [...new Set([...ids, ...forces.filter((x) => x !== h.user_id)])], type, enregistrer: true, eglise: l.eglise_id,
      titre: `${ACTIONS[h.action] || 'Action'} · ${h.libelle || ''}`.slice(0, 90), texte: `${h.detail ? `${h.detail} — ` : ''}par ${nom(auteur)}`, lien: h.lien || '/historique' };
  }
  if (l.table_nom === 'eglises' && l.data.statut === 'en_attente') {
    const supers = (await lire('users', (q) => q.eq('data->>role', 'super_admin'))).filter(actif);
    return { ids: supers.map((u) => u.id), type: 'eglises', enregistrer: true, eglise: l.eglise_id, titre: 'Nouvelle église à valider', texte: `${l.data.nom}${l.data.ville ? ` (${l.data.ville})` : ''} attend votre validation.`, lien: '/admin/eglises' };
  }
  if (l.table_nom === 'users' && l.data.statut === 'en_attente') {
    const pasteur = l.data.role === 'pasteur';
    const cibles = pasteur
      ? (await lire('users', (q) => q.eq('data->>role', 'super_admin'))).filter(actif)
      : (await lire('users', (q) => q.eq('eglise_id', l.eglise_id))).filter((u) => actif(u) && ['admin', 'pasteur'].includes(u.data.role));
    const ids: string[] = [];
    for (const u of cibles) if (await veut(u, 'adhesions')) ids.push(u.id);
    const eg = await eglise(l.eglise_id);
    return { ids, type: 'adhesions', enregistrer: true, eglise: l.eglise_id, titre: pasteur ? 'Pasteur à valider' : 'Nouvelle demande d\'adhésion',
      texte: `${l.data.prenom || ''} ${l.data.nom || ''} souhaite rejoindre ${eg?.data.nom || 'l\'église'}.`.trim(), lien: pasteur ? '/admin/eglises' : '/admin/utilisateurs' };
  }
  if (l.table_nom === 'appartenances' && l.data.statut === 'en_attente') {
    // Demande d'adhésion à une structure : le président (ou le poste chargé des membres) et les responsables de l'église
    const [st] = await lire('structures', (q) => q.eq('id', l.data.structure_id));
    const [fiche] = await lire('fideles', (q) => q.eq('id', l.data.fidele_id));
    const postes = (await lire('postes', (q) => q.eq('data->>structure_id', l.data.structure_id))).filter((p) => p.data.actif !== false && p.data.fidele_id && p.data.droits?.membres);
    const fiches = postes.length ? await lire('fideles', (q) => q.in('id', postes.map((p) => p.data.fidele_id))) : [];
    const ids = fiches.map((f) => f.data.user_id).filter(Boolean);
    for (const u of (await lire('users', (q) => q.eq('eglise_id', l.eglise_id))).filter((u) => actif(u) && ['admin', 'pasteur'].includes(u.data.role))) if (await veut(u, 'adhesions')) ids.push(u.id);
    return { ids: [...new Set(ids)], type: 'adhesions', enregistrer: true, eglise: l.eglise_id, titre: `Demande d'adhésion · ${st?.data.nom || 'structure'}`,
      texte: `${fiche ? `${fiche.data.prenom || ''} ${fiche.data.nom || ''}`.trim() : 'Un fidèle'} souhaite rejoindre ${st?.data.nom || 'la structure'}.`, lien: `/structures/${l.data.structure_id}` };
  }
  if (l.table_nom === 'messages') {
    const [conv] = await lire('conversations', (q) => q.eq('id', l.data.conversation_id));
    if (!conv) return null;
    const auteur = (await lire('users', (q) => q.eq('id', l.data.auteur_id)))[0];
    const type = conv.data.type === 'annonces' ? 'annonces' : 'messages';
    let membres: Ligne[];
    if (conv.data.type === 'eglise' || conv.data.type === 'annonces') membres = (await lire('users', (q) => q.eq('eglise_id', conv.eglise_id))).filter((u) => actif(u) && u.data.role !== 'super_admin');
    else membres = await lire('users', (q) => q.in('id', conv.data.membres || []));
    // Les membres qui ont mis la discussion en sourdine ne sont pas prévenus
    const sourdine = new Set((await lire('lectures', (q) => q.eq('data->>conversation_id', conv.id))).filter((x) => x.data.sourdine).map((x) => x.data.user_id));
    const ids: string[] = [];
    for (const u of membres) if (u.id !== l.data.auteur_id && !sourdine.has(u.id) && await veut(u, type)) ids.push(u.id);
    const titreConv = conv.data.type === 'prive' ? nom(auteur) : conv.data.type === 'annonces' ? '📢 Annonce' : (conv.data.titre || 'Discussion');
    return { ids, type, titre: titreConv, texte: conv.data.type === 'prive' ? l.data.texte : `${nom(auteur)} : ${l.data.texte}`, lien: `/messages/${conv.id}` };
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const charge = await req.json();
    const l: Ligne | undefined = charge?.record;
    if (charge?.type !== 'INSERT' || !l || l.supprime || !['messages', 'historique', 'eglises', 'users', 'appartenances', 'notifications'].includes(l.table_nom)) return new Response('ignoré');
    const cible = await destinataires(l);
    if (!cible || !cible.ids.length) return new Response('personne à prévenir');
    // Centre de notifications : une ligne par destinataire (lue ensuite par l'application)
    if (cible.enregistrer) {
      const maintenant = new Date().toISOString();
      const lignes = cible.ids.map((uid) => ({ table_nom: 'notifications', id: `nt_${l.id}_${uid}`.slice(0, 190), eglise_id: cible.eglise || l.eglise_id,
        data: { id: `nt_${l.id}_${uid}`.slice(0, 190), user_id: uid, type: cible.type, titre: cible.titre, texte: cible.texte, lien: cible.lien, le: maintenant, lu: false } }));
      for (let i = 0; i < lignes.length; i += 200) {
        const { error } = await sb.from('enregistrements').upsert(lignes.slice(i, i + 200), { onConflict: 'table_nom,id' });
        if (error) console.error('Enregistrement des notifications impossible', error);
      }
    }
    if (!compte.private_key) return new Response(`${cible.ids.length} notification(s) enregistrée(s), Firebase non configuré`);
    // Une personne peut appartenir à plusieurs églises : on retrouve tous ses appareils via son compte
    const adhesions = await lire('users', (q) => q.in('id', cible.ids));
    const comptes = [...new Set(adhesions.map((u) => u.data.auth_id).filter(Boolean))];
    const tousIds = comptes.length ? (await lire('users', (q) => q.in('data->>auth_id', comptes))).map((u) => u.id) : cible.ids;
    const appareils = (await lire('appareils', (q) => q.in('data->>user_id', tousIds)));
    if (!appareils.length) return new Response('aucun appareil');
    const jeton = await jetonGoogle();
    let envoyes = 0;
    for (const a of appareils) {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${compte.project_id}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: {
          token: a.data.jeton,
          notification: { title: cible.titre, body: String(cible.texte).slice(0, 180) },
          data: { lien: cible.lien },
          android: { priority: 'high', notification: { channel_id: 'messages', icon: 'ic_stat_notif', color: '#1F5FD6', sound: 'default' } },
        } }),
      });
      if (r.ok) envoyes++;
      else if (r.status === 404 || r.status === 400) {
        // Jeton périmé (application désinstallée) : on le retire
        await sb.from('enregistrements').update({ supprime: true }).eq('table_nom', 'appareils').eq('id', a.id);
      }
    }
    return new Response(`${envoyes} notification(s) envoyée(s)`);
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
