// Paramètres de l'application (Console › Paramètres), avec les valeurs par défaut
import { useApp } from '../state/AppContext';

export const APPLICATION_DEFAUT = {
  nom: 'Mon Église',
  slogan: 'Toute votre église à portée de main',
  developpeur: { nom: 'KOURA Toussaint', role: 'Développeur', telephones: ['+226 75 49 35 18', '+226 71 22 22 28'], whatsapp: '+226 75 49 35 18', email: '' },
  maintenance: { actif: false, message: 'L\'application est en cours de maintenance. Merci de réessayer un peu plus tard.' },
};

export function lireApplication(db) {
  const v = (db?.parametres || []).find((p) => p.id === 'application')?.valeur || {};
  return { ...APPLICATION_DEFAUT, ...v, developpeur: { ...APPLICATION_DEFAUT.developpeur, ...(v.developpeur || {}) }, maintenance: { ...APPLICATION_DEFAUT.maintenance, ...(v.maintenance || {}) } };
}

export function useApplication() {
  const { db } = useApp();
  return lireApplication(db);
}

export const telLien = (t) => `tel:${String(t).replace(/[^\d+]/g, '')}`;
export const waLien = (t) => `https://wa.me/${String(t).replace(/[^\d]/g, '')}`;
