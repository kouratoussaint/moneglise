// Clavier du téléphone : garde les champs de saisie visibles au-dessus du clavier.
// Si Android redimensionne déjà l'écran, rien n'est ajouté ; sinon on décale le contenu
// de la hauteur du clavier (variable CSS --clavier).
import { Capacitor } from '@capacitor/core';

const racine = document.documentElement;
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
  const fermer = () => { racine.classList.remove('clavier-ouvert'); racine.style.setProperty('--clavier', '0px'); };
  Keyboard.addListener('keyboardWillHide', fermer);
  Keyboard.addListener('keyboardDidHide', fermer);
}
