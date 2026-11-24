// Connexion sans internet.
// Après chaque connexion réussie en ligne, on garde sur le téléphone une empreinte du mot de passe
// (PBKDF2-SHA-256 salée, jamais le mot de passe lui-même). Sans réseau, le même e-mail et le même
// mot de passe rouvrent alors la copie locale des données ; l'envoi au serveur reprend au retour du réseau.
const CLE = 'eglise360:hors-ligne:v1';
const ITERATIONS = 150000;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE)) || null; } catch { return null; } };

async function empreinte(mdp, sel, iterations = ITERATIONS) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(mdp), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations }, cle, 256));
}

export const disponible = () => typeof crypto !== 'undefined' && !!crypto.subtle;

// Compte mémorisé (e-mail et identifiant), sans le secret
export const compteMemorise = () => { const c = lire(); return c ? { email: c.email, authId: c.authId, le: c.le } : null; };

export async function memoriser(email, mdp, authId) {
  if (!disponible()) return;
  try {
    const sel = crypto.getRandomValues(new Uint8Array(16));
    const c = { email: email.trim().toLowerCase(), authId, sel: b64(sel), iterations: ITERATIONS, empreinte: await empreinte(mdp, sel), le: new Date().toISOString() };
    localStorage.setItem(CLE, JSON.stringify(c));
  } catch { /* stockage plein ou crypto indisponible : la connexion hors ligne ne sera simplement pas proposée */ }
}

// Renvoie l'identifiant du compte si l'e-mail et le mot de passe correspondent au dernier compte connecté
export async function verifier(email, mdp) {
  const c = lire();
  if (!c || !disponible() || c.email !== email.trim().toLowerCase()) return null;
  const e = await empreinte(mdp, deB64(c.sel), c.iterations || ITERATIONS);
  // Comparaison à temps constant
  let diff = e.length ^ c.empreinte.length;
  for (let i = 0; i < Math.min(e.length, c.empreinte.length); i++) diff |= e.charCodeAt(i) ^ c.empreinte.charCodeAt(i);
  return diff === 0 ? c.authId : null;
}

export const oublier = () => { try { localStorage.removeItem(CLE); } catch { /* */ } };

// Erreur de réseau (serveur injoignable) plutôt qu'un refus du mot de passe
export const erreurReseau = (e) => {
  const m = `${e?.name || ''} ${e?.message || ''}`.toLowerCase();
  return e?.status === 0 || m.includes('fetch') || m.includes('network') || m.includes('retryable') || m.includes('timeout') || m.includes('load failed');
};
