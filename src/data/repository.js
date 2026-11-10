// Stockage sur l'appareil.
// Mode démo : données d'exemple, aucun serveur.
// Mode en ligne : copie locale des données du serveur + file d'attente des modifications.
import { seed } from './seed';
import { dbVide } from './sync';
import { enLigne } from '../config';

const cleDb = () => (enLigne() ? 'eglise360:db:enligne:v1' : 'eglise360:db:v1');
const cleMeta = 'eglise360:sync:v1';
const CLE_SESSION = 'eglise360:session';
const lire = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const ecrire = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

export const repository = {
  async charger() {
    const db = lire(cleDb());
    if (db) return { ...dbVide(), ...db };
    if (enLigne()) return dbVide();
    const s = seed();
    ecrire(cleDb(), s);
    return s;
  },
  async enregistrer(db) { ecrire(cleDb(), db); },
  async reinitialiser() { const s = enLigne() ? dbVide() : seed(); ecrire(cleDb(), s); return s; },
  meta: {
    lire: () => lire(cleMeta) || { file: {}, depuis: null, derniere: null },
    ecrire: (m) => ecrire(cleMeta, m),
  },
  async effacerLocal() { ecrire(cleDb(), null); ecrire(cleMeta, null); },
  session: { lire: () => lire(CLE_SESSION), ecrire: (s) => ecrire(CLE_SESSION, s) },
};
