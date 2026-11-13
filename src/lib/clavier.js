// Clavier du téléphone : garde les champs de saisie visibles au-dessus du clavier.
// Si Android redimensionne déjà l'écran, rien n'est ajouté ; sinon on décale le contenu
// de la hauteur du clavier (variable CSS --clavier).
import { Capacitor } from '@capacitor/core';

const racine = document.documentElement;

// Hauteur réelle de la zone d'affichage, mise à jour à chaque changement (clavier, rotation) :
// 100vh peut rester figé à la hauteur « clavier ouvert » dans la vue web d'Android
const majHauteur = () => racine.style.setProperty('--hauteur', `${window.innerHeight}px`);
majHauteur();
window.addEventListener('resize', majHauteur);
window.visualViewport?.addEventListener('resize', majHauteur);
const montrerChamp = () => {
  const el = document.activeElement;
  if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

export async function gererClavier() {
  if (!Capacitor.isNativePlatform()) return;
  const { Keyboard } = await import('@capacitor/keyboard');
  let hauteurInitiale = window.innerHeight;
  window.addEventListener('orientationchange', () => setTimeout(() => { hauteurInitiale = window.innerHeight; }, 400));

  const ouvrir = (h) => {
    racine.classList.add('clavier-ouvert');
    // L'écran a-t-il déjà été réduit par Android ?
    const reduit = hauteurInitiale - window.innerHeight > h * 0.5;
    racine.style.setProperty('--clavier', reduit ? '0px' : `${h}px`);
    setTimeout(montrerChamp, 80);
    setTimeout(() => window.dispatchEvent(new Event('e360:clavier')), 120);
  };
  Keyboard.addListener('keyboardWillShow', (i) => ouvrir(i.keyboardHeight));
  Keyboard.addListener('keyboardDidShow', (i) => ouvrir(i.keyboardHeight));
  const fermer = () => {
    racine.classList.remove('clavier-ouvert');
    racine.style.setProperty('--clavier', '0px');
    // Après la fermeture, Android rend la place : on remesure (plusieurs fois, le temps de l'animation)
    [0, 120, 300, 600].forEach((d) => setTimeout(majHauteur, d));
  };
  Keyboard.addListener('keyboardWillHide', fermer);
  Keyboard.addListener('keyboardDidHide', fermer);

  // Filet de sécurité : sous Android 15, le signal « clavier fermé » n'arrive pas toujours.
  // Dès qu'aucun champ de saisie n'est actif, le clavier est forcément fermé : on rétablit l'écran
  // (sinon la barre du bas restait masquée jusqu'au redémarrage de l'application).
  const saisieActive = () => {
    const el = document.activeElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'file', 'submit', 'color'].includes(el.type);
  };
  const verifier = () => { if (racine.classList.contains('clavier-ouvert') && !saisieActive()) fermer(); };
  document.addEventListener('focusout', () => setTimeout(verifier, 350));
  document.addEventListener('visibilitychange', () => setTimeout(verifier, 200));
  window.addEventListener('resize', () => setTimeout(verifier, 250));
  setInterval(verifier, 1500);
}
