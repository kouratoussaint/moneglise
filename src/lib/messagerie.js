// Messagerie : conversations visibles, messages, non-lus, accusés de réception et de lecture.
export const TYPES_CONV = {
  annonces: { icone: 'Megaphone', couleur: '#C98A06' },
  eglise: { icone: 'Church', couleur: '#1F5FD6' },
  groupe: { icone: 'Users', couleur: '#7A4FD6' },
  prive: { icone: 'User', couleur: '#0E9F6E' },
  support: { icone: 'LifeBuoy', couleur: '#0B2A66' },
};

// Personnes connues : annuaire du serveur (en ligne) ou utilisateurs locaux (démo)
export const personnes = (db) => {
  // Annuaire du serveur complété par les fiches déjà connues sur le téléphone
  const m = new Map((db.annuaire || []).map((u) => [u.id, u]));
  for (const u of db.users || []) if (!m.has(u.id)) m.set(u.id, u); else if (u.photo !== undefined && !m.get(u.id).photo) m.set(u.id, { ...m.get(u.id), photo: u.photo });
  return [...m.values()].filter((u) => (u.statut || 'actif') === 'actif');
};
export const personne = (db, id) => personnes(db).find((u) => u.id === id) || db.users.find((u) => u.id === id);
export const nomCourt = (u) => (u ? `${u.prenom || ''} ${u.nom ? `${u.nom[0]}.` : ''}`.trim() : 'Membre');

export function estMembre(conv, user) {
  if (!conv || !user) return false;
  if (conv.type === 'eglise' || conv.type === 'annonces') return conv.eglise_id === user.eglise_id;
  return (conv.membres || []).includes(user.id);
}

export function membresDe(db, conv) {
  if (conv.type === 'eglise' || conv.type === 'annonces') {
    return personnes(db).filter((u) => u.eglise_id === conv.eglise_id && u.actif !== false && u.role !== 'super_admin');
  }
  return (conv.membres || []).map((id) => personne(db, id)).filter(Boolean);
}

export function titreConv(db, conv, user) {
  if (conv.type === 'prive') {
    const autre = (conv.membres || []).find((id) => id !== user.id);
    const p = personne(db, autre);
    return p ? `${p.prenom} ${p.nom}` : 'Message privé';
  }
  if (conv.type === 'support' && !conv.titre) return 'Support Mon Église';
  return conv.titre || 'Discussion';
}

export const messagesDe = (db, convId) => (db.messages || []).filter((m) => m.conversation_id === convId).sort((a, b) => a.le.localeCompare(b.le));
export const lectureDe = (db, convId, userId) => (db.lectures || []).find((l) => l.conversation_id === convId && l.user_id === userId);

// Individuelles (messages privés) ou de groupe (annonces, discussion de l'église, groupes, support)
export const famille = (c) => (c.type === 'prive' ? 'individuel' : 'groupe');

export function conversationsDe(db, user) {
  const ordre = { annonces: 0, eglise: 1 };
  return (db.conversations || [])
    .filter((c) => estMembre(c, user))
    .map((c) => {
      const pref = lectureDe(db, c.id, user.id) || {};
      const msgs = messagesDe(db, c.id).filter((m) => !pref.masque_avant || m.le > pref.masque_avant);
      const dernier = msgs[msgs.length - 1];
      const lu = pref.lu || '';
      const nonLus = msgs.filter((m) => m.auteur_id !== user.id && m.le > lu && !m.supprime).length;
      // Une discussion privée « supprimée » réapparaît à l'arrivée d'un nouveau message
      const masquee = !!pref.masque_avant && !dernier;
      return { ...c, dernier, nonLus, masquee, epingle: !!pref.epingle, sourdine: !!pref.sourdine, tri: dernier?.le || c.cree_le || '' };
    })
    .filter((c) => !c.masquee)
    .sort((a, b) => (b.epingle - a.epingle) || (ordre[a.type] ?? 9) - (ordre[b.type] ?? 9) || b.tri.localeCompare(a.tri));
}

export const totalNonLus = (db, user) => (user ? conversationsDe(db, user).reduce((t, c) => t + c.nonLus, 0) : 0);

// Statut d'un de mes messages : attente (pas encore envoyé), envoye, recu (par tous), lu (par tous)
export function statutMessage(db, conv, m, enAttente) {
  if (enAttente) return { statut: 'attente' };
  const autres = membresDe(db, conv).filter((u) => u.id !== m.auteur_id);
  if (!autres.length) return { statut: 'envoye', autres };
  const lect = autres.map((u) => ({ u, l: lectureDe(db, conv.id, u.id) }));
  const lus = lect.filter((x) => x.l?.lu >= m.le);
  const recus = lect.filter((x) => x.l?.recu >= m.le || x.l?.lu >= m.le);
  const statut = lus.length === autres.length ? 'lu' : recus.length === autres.length ? 'recu' : 'envoye';
  return { statut, lus, recus, autres };
}

// Statut de présence d'un membre : en ligne (activité depuis moins de 3 minutes) ou « vu il y a… »
export function presence(db, userId) {
  const p = (db.presences || []).find((x) => x.user_id === userId);
  if (!p?.vu_le) return { enLigne: false, texte: '' };
  const min = Math.round((Date.now() - Date.parse(p.vu_le)) / 60000);
  if (min < 3) return { enLigne: true, texte: 'En ligne' };
  if (min < 60) return { enLigne: false, texte: `Vu il y a ${min} min` };
  const h = Math.round(min / 60);
  if (h < 24) return { enLigne: false, texte: `Vu il y a ${h} h` };
  const j = Math.round(h / 24);
  if (j < 7) return { enLigne: false, texte: j === 1 ? 'Vu hier' : `Vu il y a ${j} jours` };
  const d = new Date(p.vu_le);
  return { enLigne: false, texte: `Vu le ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` };
}
