// Notifications : centre de notifications dans l'application + notifications du téléphone.
import { Capacitor } from '@capacitor/core';

const CLE = 'e360:notifications';
const PREF = 'e360:pref:notif';
export const notifActives = () => localStorage.getItem(PREF) !== 'non';
export const activerNotif = (v) => localStorage.setItem(PREF, v ? 'oui' : 'non');
export const lireNotifs = () => { try { return JSON.parse(localStorage.getItem(CLE)) || []; } catch { return []; } };
export const ecrireNotifs = (l) => localStorage.setItem(CLE, JSON.stringify(l.slice(0, 100)));
export const effacerNotifs = () => localStorage.removeItem(CLE);

let compteur = Math.floor(Date.now() / 1000) % 100000;

export async function demanderPermission() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  } catch { return false; }
}

export async function afficherSurTelephone(titre, texte, lien) {
  if (!Capacitor.isNativePlatform() || !notifActives()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    await LocalNotifications.schedule({ notifications: [{ id: ++compteur, title: titre, body: texte, extra: { lien }, smallIcon: 'ic_stat_notif', iconColor: '#1F5FD6' }] });
  } catch { /* */ }
}

export async function ecouterClics(ouvrir) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const h = await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const lien = e.notification?.extra?.lien;
    if (lien) ouvrir(lien);
  });
  return () => h.remove();
}
