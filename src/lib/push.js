// Notifications « push » Firebase (reçues même application fermée).
// Activées seulement si le fichier google-services.json était présent à la compilation.
import { Capacitor } from '@capacitor/core';

/* global __FIREBASE__ */
export const firebaseActif = () => Capacitor.isNativePlatform() && typeof __FIREBASE__ !== 'undefined' && __FIREBASE__;

export async function initialiserPush({ surJeton, surReception, surClic }) {
  if (!firebaseActif()) return () => {};
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return () => {};
  try {
    await PushNotifications.createChannel({ id: 'messages', name: 'Messages et opérations', description: 'Nouveaux messages et opérations de l\'église', importance: 4, visibility: 1, sound: 'default', lights: true, lightColor: '#1F5FD6', vibration: true });
  } catch { /* Android < 8 */ }
  const h = [
    await PushNotifications.addListener('registration', (t) => surJeton(t.value)),
    await PushNotifications.addListener('pushNotificationReceived', (n) => surReception?.(n)),
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => { const lien = a.notification?.data?.lien; if (lien) surClic(lien); }),
  ];
  await PushNotifications.register();
  return () => h.forEach((x) => x.remove());
}
