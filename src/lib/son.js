// Sons courts synthétisés (aucun fichier audio) et légère vibration.
import { Capacitor } from '@capacitor/core';

const PREF = 'e360:pref:son';
export const sonActif = () => localStorage.getItem(PREF) !== 'non';
export const activerSon = (v) => localStorage.setItem(PREF, v ? 'oui' : 'non');

let ctx = null;
const audio = () => {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

function note(c, freq, debut, duree, volume = 0.12, type = 'sine') {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + debut);
  g.gain.setValueAtTime(0.0001, c.currentTime + debut);
  g.gain.exponentialRampToValueAtTime(volume, c.currentTime + debut + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + debut + duree);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + debut); o.stop(c.currentTime + debut + duree + 0.05);
}

const SONS = {
  succes: (c) => { note(c, 784, 0, 0.16); note(c, 1175, 0.09, 0.28); },          // sol – ré, montant
  depense: (c) => { note(c, 659, 0, 0.14, 0.1); note(c, 523, 0.08, 0.24, 0.1); }, // mi – do, descendant
  erreur: (c) => { note(c, 220, 0, 0.22, 0.09, 'triangle'); note(c, 196, 0.12, 0.26, 0.08, 'triangle'); },
  notif: (c) => { note(c, 988, 0, 0.12, 0.08); note(c, 1319, 0.1, 0.22, 0.08); },
  tic: (c) => note(c, 1400, 0, 0.05, 0.04),
};

export function jouer(nom) {
  if (!sonActif() || !SONS[nom]) return;
  try { const c = audio(); if (c) SONS[nom](c); } catch { /* audio indisponible */ }
}

export async function vibrer(fort = false) {
  if (!Capacitor.isNativePlatform() || !sonActif()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: fort ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch { /* */ }
}
