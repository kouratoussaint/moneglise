// Serveur en ligne (Supabase, offre gratuite).
// Pour l'intégrer définitivement dans l'APK, renseignez ces deux valeurs avant de compiler.
// Sinon, elles peuvent être saisies dans l'application (écran « Serveur » de la page de connexion).
const INTEGRE = {
  url: '',
  cle: '',
};

const CLE_STOCKAGE = 'eglise360:serveur';

export function config() {
  try {
    const c = JSON.parse(localStorage.getItem(CLE_STOCKAGE));
    if (c?.url && c?.cle) return { ...c, source: 'appareil' };
  } catch { /* */ }
  return { ...INTEGRE, source: 'integre' };
}
export const enLigne = () => !!(config().url && config().cle);
export const configIntegree = () => !!(INTEGRE.url && INTEGRE.cle);
export function enregistrerConfig(c) {
  if (c) localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ url: c.url.trim().replace(/\/+$/, ''), cle: c.cle.trim() }));
  else localStorage.removeItem(CLE_STOCKAGE);
}
