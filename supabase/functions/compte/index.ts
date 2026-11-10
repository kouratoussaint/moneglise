// Mon Église — gestion des comptes (mot de passe temporaire donné par l'administrateur)
// Appelée depuis l'application ; seul un administrateur ou un pasteur de l'église du membre
// (ou le super administrateur) peut l'utiliser.
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Adh = { id: string; eglise_id: string; data: Record<string, any> };
async function adhesions(filtre: (q: any) => any): Promise<Adh[]> {
  const { data } = await filtre(sb.from('enregistrements').select('id,eglise_id,data').eq('table_nom', 'users').eq('supprime', false));
  return data || [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const jeton = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: { user: appelant } } = await sb.auth.getUser(jeton);
    if (!appelant) return json({ erreur: 'Session expirée : reconnectez-vous.' }, 401);
    const { action, user_id } = await req.json();
    if (action !== 'mot_de_passe_temporaire') return json({ erreur: 'Action inconnue' }, 400);

    const [cible] = await adhesions((q) => q.eq('id', user_id));
    if (!cible) return json({ erreur: 'Membre introuvable' }, 404);
    if (!cible.data.auth_id) return json({ erreur: 'Ce membre n\'a pas encore créé son compte : il doit d\'abord s\'inscrire avec son adresse e-mail.' }, 400);
    const miennes = (await adhesions((q) => q.eq('data->>auth_id', appelant.id))).filter((a) => (a.data.statut || 'actif') === 'actif' && a.data.actif !== false);
    const autorise = miennes.some((a) => a.data.role === 'super_admin' || (a.eglise_id === cible.eglise_id && ['admin', 'pasteur'].includes(a.data.role)));
    if (!autorise) return json({ erreur: 'Vous n\'avez pas le droit de réinitialiser ce compte.' }, 403);

    // Mot de passe lisible : 4 lettres + 4 chiffres
    const lettres = 'abcdefghjkmnpqrstuvwxyz';
    const alea = crypto.getRandomValues(new Uint32Array(8));
    const mdp = Array.from(alea.slice(0, 4), (n) => lettres[n % lettres.length]).join('') + Array.from(alea.slice(4), (n) => n % 10).join('');
    const { error } = await sb.auth.admin.updateUserById(cible.data.auth_id, { password: mdp });
    if (error) return json({ erreur: error.message }, 500);

    // Toutes les adhésions de la personne : changement de mot de passe demandé à la prochaine connexion
    const siennes = await adhesions((q) => q.eq('data->>auth_id', cible.data.auth_id));
    for (const a of siennes) await sb.from('enregistrements').update({ data: { ...a.data, doit_changer_mdp: true } }).eq('table_nom', 'users').eq('id', a.id);
    const auteur = miennes.find((a) => a.eglise_id === cible.eglise_id) || miennes[0];
    const hid = `h_mdp_${Date.now().toString(36)}`;
    await sb.from('enregistrements').insert({ table_nom: 'historique', id: hid, eglise_id: cible.eglise_id, data: { id: hid, user_id: auteur.id, action: 'modification', table: 'users', objet_id: cible.id,
      libelle: `${cible.data.prenom || ''} ${cible.data.nom || ''}`.trim(), detail: 'Mot de passe temporaire attribué', le: new Date().toISOString(), lien: '/admin/utilisateurs' } });
    return json({ mot_de_passe: mdp });
  } catch (e) {
    return json({ erreur: String(e) }, 500);
  }
});
