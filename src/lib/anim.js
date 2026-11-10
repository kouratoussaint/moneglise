import { useEffect, useRef, useState } from 'react';

// Fait défiler un nombre jusqu'à sa valeur (effet compteur), 700 ms
export function useCompteur(cible, duree = 700) {
  const [v, setV] = useState(cible);
  const prec = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(cible); prec.current = cible; return undefined; }
    const depart = prec.current, t0 = performance.now();
    let id;
    const pas = (t) => {
      const k = Math.min(1, (t - t0) / duree), e = 1 - (1 - k) ** 3;
      setV(depart + (cible - depart) * e);
      if (k < 1) id = requestAnimationFrame(pas); else prec.current = cible;
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
  }, [cible, duree]);
  return v;
}
