import { useMemo } from 'react';
import { useApp } from './AppContext';
import { caissesEglise, moisVisibleFidele } from '../lib/finance';
import { ymOf } from '../lib/format';
import { estMembreDe } from '../lib/structures';

// Caisses et opérations visibles par l'utilisateur connecté.
// Caisses de l'église : détail pour les responsables, totaux pour les fidèles (selon les réglages).
// Caisses des structures : visibles par leurs membres ; le détail selon le poste occupé ou le réglage de la structure.
export function useVue() {
  const { db, eglise, egliseId, can, online, user } = useApp();
  return useMemo(() => {
    if (!db || !egliseId) return { caisses: [], ops: [], restreint: true, detail: () => false };
    const general = can('fin.voir_details');
    const detail = (c) => (c?.structure_id ? general || can('fin.voir_details', c.id) : general);
    const visible = (c) => (c.structure_id ? general || estMembreDe(db, user, c.structure_id) || can('fin.voir_details', c.id) : general || c.visible_fideles !== false);
    const caisses = caissesEglise(db, egliseId).filter(visible);
    const avecDetail = new Set(caisses.filter(detail).map((c) => c.id));
    const sansDetail = new Set(caisses.filter((c) => !avecDetail.has(c.id)).map((c) => c.id));
    let ops = db.operations.filter((o) => o.eglise_id === egliseId && avecDetail.has(o.caisse_id));
    if (sansDetail.size) {
      if (online) {
        // Totaux mensuels calculés par le serveur, présentés comme des opérations de synthèse
        ops = ops.concat((db.resumes || []).filter((r) => sansDetail.has(r.caisse_id)).flatMap((r) => [
          { id: `r_${r.caisse_id}_${r.mois}_in`, caisse_id: r.caisse_id, type: 'recette', montant: Number(r.recettes) || 0, date: `${r.mois}-01`, libelle: 'Recettes du mois' },
          { id: `r_${r.caisse_id}_${r.mois}_out`, caisse_id: r.caisse_id, type: 'depense', montant: Number(r.depenses) || 0, date: `${r.mois}-01`, libelle: 'Dépenses du mois' },
        ]));
      } else {
        ops = ops.concat(db.operations.filter((o) => sansDetail.has(o.caisse_id) && (db.caisses.find((c) => c.id === o.caisse_id)?.structure_id || moisVisibleFidele(db, eglise, o.caisse_id, ymOf(o.date)))));
      }
    }
    const enrichir = (o) => ({
      ...o,
      _caisse: db.caisses.find((c) => c.id === o.caisse_id)?.nom || '',
      _categorie: db.categories.find((c) => c.id === o.categorie_id)?.nom || 'Autre / N.P.',
    });
    return { caisses, ops: ops.map(enrichir), restreint: !general, detail, caissesEglise: caisses.filter((c) => !c.structure_id) };
  }, [db, eglise, egliseId, can, online, user]);
}
