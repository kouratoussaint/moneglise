-- =====================================================================
-- Mon Église — installation du serveur (Supabase, offre gratuite)
-- À exécuter une seule fois : Supabase › SQL Editor › New query › coller › Run
-- Le script peut être relancé sans danger.
-- =====================================================================

-- Une seule table générique : chaque ligne est un enregistrement de l'application
-- (église, utilisateur, caisse, catégorie, opération, clôture, journal…)
create table if not exists public.enregistrements (
  table_nom  text        not null,
  id         text        not null,
  eglise_id  text        not null,
  data       jsonb       not null,
  supprime   boolean     not null default false,
  maj_le     timestamptz not null default now(),
  maj_par    uuid,
  primary key (table_nom, id)
);
create index if not exists enr_eglise_maj on public.enregistrements (eglise_id, maj_le);
create index if not exists enr_maj on public.enregistrements (maj_le);
create index if not exists enr_auth on public.enregistrements ((data->>'auth_id')) where table_nom = 'users';
create index if not exists enr_email on public.enregistrements (lower(data->>'email')) where table_nom = 'users';

-- Horodatage serveur de chaque écriture (sert à la synchronisation)
create or replace function public.e360_horodater() returns trigger language plpgsql as $$
begin
  new.maj_le := clock_timestamp();
  new.maj_par := auth.uid();
  return new;
end $$;
drop trigger if exists e360_horodater on public.enregistrements;
create trigger e360_horodater before insert or update on public.enregistrements
  for each row execute function public.e360_horodater();

-- ---------- Adhésions ----------
-- Une même personne (compte) peut appartenir à plusieurs églises : une ligne « users » par église,
-- toutes rattachées au même compte (auth_id). Statut : actif (par défaut), en_attente, refuse.
create or replace function public.e360_mes_adhesions() returns setof public.enregistrements
language sql stable security definer set search_path = public as $$
  select * from enregistrements
  where table_nom = 'users' and data->>'auth_id' = auth.uid()::text and not supprime
    and coalesce((data->>'actif')::boolean, true) and coalesce(data->>'statut', 'actif') = 'actif'
    -- Église suspendue par l'administrateur de l'application : plus aucun accès pour ses membres
    and (data->>'role' = 'super_admin' or not exists (select 1 from enregistrements e
         where e.table_nom = 'eglises' and e.id = enregistrements.eglise_id and e.data->>'statut' = 'suspendue'))
$$;

create or replace function public.e360_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from e360_mes_adhesions() a where a.data->>'role' = 'super_admin')
$$;

create or replace function public.e360_mes_eglises() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(eglise_id), '{}') from e360_mes_adhesions()
$$;

create or replace function public.e360_mes_ids() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from e360_mes_adhesions()
$$;

-- Toutes les églises auxquelles je suis lié, y compris en attente de validation
create or replace function public.e360_eglises_liees() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(eglise_id), '{}') from enregistrements
  where table_nom = 'users' and data->>'auth_id' = auth.uid()::text and not supprime
$$;

-- Mon adhésion dans une église donnée
create or replace function public.e360_moi_dans(eg text) returns jsonb
language sql stable security definer set search_path = public as $$
  select data || jsonb_build_object('id', id, 'eglise_id', eglise_id) from e360_mes_adhesions() where eglise_id = eg limit 1
$$;

-- Compatibilité : première adhésion active
create or replace function public.e360_moi() returns jsonb
language sql stable security definer set search_path = public as $$
  select data || jsonb_build_object('id', id, 'eglise_id', eglise_id) from e360_mes_adhesions() order by (data->>'role' = 'super_admin') desc limit 1
$$;
create or replace function public.e360_mon_eglise() returns text
language sql stable security definer set search_path = public as $$
  select e360_moi()->>'eglise_id'
$$;

-- Droit d'une personne dans une église, d'après la matrice configurée par son administrateur
create or replace function public.e360_droit_role(cle text, eg text, role text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
      select (e.data->'droits'->role->>cle)::boolean
      from enregistrements e where e.table_nom = 'eglises' and e.id = eg
    ), (
      -- Valeurs par défaut des droits ajoutés après la création de l'église
      '{"admin":{"msg.utiliser":true,"msg.prive":true,"msg.groupes":true,"msg.annonces":true,"prog.gerer":true},
        "pasteur":{"msg.utiliser":true,"msg.prive":true,"msg.groupes":true,"msg.annonces":true,"prog.gerer":true},
        "gestionnaire":{"msg.utiliser":true,"msg.prive":true,"msg.groupes":true},
        "fidele":{"msg.utiliser":true,"msg.prive":true}}'::jsonb -> role ->> cle
    )::boolean, false)
$$;

-- Droit d'une personne dans une église. Les responsables sont aussi des membres :
-- ils ont toujours au minimum les droits d'un fidèle.
create or replace function public.e360_droit(cle text, eg text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when e360_super() then true
    when e360_moi_dans(eg) is null then false
    else e360_droit_role(cle, eg, e360_moi_dans(eg)->>'role') or e360_droit_role(cle, eg, 'fidele')
  end
$$;
create or replace function public.e360_droit(cle text) returns boolean
language sql stable security definer set search_path = public as $$
  select e360_droit(cle, e360_mon_eglise())
$$;

-- Configuration de l'église : administrateurs et pasteurs (le super administrateur a tous les droits)
create or replace function public.e360_config(eg text) returns boolean
language sql stable security definer set search_path = public as $$
  select e360_super() or e360_droit('admin.eglise', eg) or coalesce(e360_moi_dans(eg)->>'role', '') = 'pasteur'
$$;

-- Un gestionnaire n'écrit que dans les caisses qui lui sont attribuées
create or replace function public.e360_gere(caisse text, eg text) returns boolean
language sql stable security definer set search_path = public as $$
  select e360_super() or e360_moi_dans(eg)->>'role' <> 'gestionnaire'
      or e360_droit('fin.saisir_toutes', eg)
      or coalesce((e360_moi_dans(eg)->'caisses') ? caisse, false)
$$;

-- ---------- Fidèles, structures et bureaux ----------
-- Ma fiche de fidèle dans une église (liée à mon compte)
create or replace function public.e360_mon_fidele(eg text) returns text
language sql stable security definer set search_path = public as $$
  select f.id from enregistrements f
  where f.table_nom = 'fideles' and f.eglise_id = eg and not f.supprime and f.data->>'user_id' = any(e360_mes_ids()) limit 1
$$;

-- Suis-je membre (actif) de cette structure ?
create or replace function public.e360_membre_structure(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enregistrements a
    where a.table_nom = 'appartenances' and not a.supprime and a.data->>'structure_id' = sid
      and coalesce(a.data->>'jusqu_au', '') = '' and coalesce(a.data->>'statut', 'actif') = 'actif'
      and a.data->>'fidele_id' = e360_mon_fidele(a.eglise_id))
$$;

-- Droit lié au poste que j'occupe dans le bureau d'une structure (président, trésorier…)
create or replace function public.e360_droit_poste(sid text, cle text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enregistrements p
    where p.table_nom = 'postes' and not p.supprime and p.data->>'structure_id' = sid and coalesce((p.data->>'actif')::boolean, true)
      and p.data->>'fidele_id' = e360_mon_fidele(p.eglise_id) and coalesce((p.data->'droits'->>cle)::boolean, false))
$$;

-- Caisse d'une structure : la structure à laquelle elle appartient
create or replace function public.e360_structure_caisse(cid text) returns text
language sql stable security definer set search_path = public as $$
  select data->>'structure_id' from enregistrements where table_nom = 'caisses' and id = cid
$$;

create or replace function public.e360_structure_cotisation(cid text) returns text
language sql stable security definer set search_path = public as $$
  select data->>'structure_id' from enregistrements where table_nom = 'cotisations' and id = cid
$$;

-- Accès à la caisse d'une structure selon le poste occupé dans son bureau
-- (« voir_details » est aussi accordé aux membres si la structure l'a choisi)
create or replace function public.e360_acces_caisse(cid text, cle text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(e360_structure_caisse(cid), '') <> '' and (
    e360_droit_poste(e360_structure_caisse(cid), cle)
    or (cle = 'voir_details' and e360_membre_structure(e360_structure_caisse(cid))
        and coalesce((select (st.data->>'membres_voient_details')::boolean from enregistrements st where st.table_nom = 'structures' and st.id = e360_structure_caisse(cid)), false)))
$$;

-- Gestion des fidèles : responsables de l'église ou poste chargé des membres (président, secrétaire…)
create or replace function public.e360_gere_fideles(eg text) returns boolean
language sql stable security definer set search_path = public as $$
  select e360_super() or e360_config(eg) or e360_droit('admin.utilisateurs', eg)
      or exists (select 1 from enregistrements p where p.table_nom = 'postes' and p.eglise_id = eg and not p.supprime
                   and p.data->>'fidele_id' = e360_mon_fidele(eg) and coalesce((p.data->'droits'->>'membres')::boolean, false))
$$;

-- Coordonnées d'un fidèle (téléphone, e-mail, adresse, date de naissance, informations) : #11
-- transmises seulement aux responsables, aux postes chargés des membres et à la personne elle-même
create or replace function public.e360_voit_coordonnees(eg text, fid text) returns boolean
language sql stable security definer set search_path = public as $$
  select e360_gere_fideles(eg) or e360_droit('fin.voir_details', eg)
      or exists (select 1 from enregistrements f where f.table_nom = 'fideles' and f.id = fid and f.data->>'user_id' = any(e360_mes_ids()))
$$;

-- Une fiche de fidèle est visible par les responsables, par le fidèle lui-même
-- et par les membres des structures auxquelles il appartient
create or replace function public.e360_fidele_visible(eg text, fid text, d jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  -- Décision #1 : tout membre de l'église voit la liste complète des fidèles
  select e360_super() or eg = any(e360_mes_eglises())
$$;

-- ---------- Activités ----------
-- Visible par : responsables, membres de la structure organisatrice, destinataires choisis ;
-- une activité de l'église (sans structure) est visible par tous les membres de l'église.
create or replace function public.e360_activite_visible(eg text, d jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select e360_super() or e360_config(eg) or e360_droit('acc.toutes_structures', eg)
      or coalesce(d->>'structure_id', '') = '' or coalesce(d->>'destinataires', '') = 'eglise'
      or e360_membre_structure(d->>'structure_id')
      or coalesce((d->'fideles') ? e360_mon_fidele(eg), false)
      or coalesce((d->'responsables') ? e360_mon_fidele(eg), false)
$$;

-- Comptes à prévenir pour une activité (membres de la structure, toute l'église ou une liste)
create or replace function public.e360_destinataires_activite(aid text) returns setof text
language sql stable security definer set search_path = public as $$
  with a as (select eglise_id, data from enregistrements where table_nom = 'activites' and id = aid),
  fid as (
    select f.id, f.data->>'user_id' as uid from enregistrements f, a
    where f.table_nom = 'fideles' and f.eglise_id = a.eglise_id and not f.supprime and coalesce(f.data->>'user_id', '') <> ''
      and (
        (coalesce(a.data->>'destinataires', 'structure') = 'eglise'
          or (coalesce(a.data->>'structure_id', '') = '' and coalesce(a.data->>'destinataires', '') <> 'liste'))
        or (coalesce(a.data->>'destinataires', 'structure') = 'structure' and exists (select 1 from enregistrements ap where ap.table_nom = 'appartenances' and not ap.supprime
              and ap.data->>'structure_id' = a.data->>'structure_id' and ap.data->>'fidele_id' = f.id and coalesce(ap.data->>'jusqu_au', '') = '' and coalesce(ap.data->>'statut', 'actif') = 'actif'))
        or coalesce((a.data->'fideles') ? f.id, false)
        or coalesce((a.data->'responsables') ? f.id, false))
  )
  select distinct fid.uid from fid join enregistrements u on u.table_nom = 'users' and u.id = fid.uid
  where not u.supprime and coalesce((u.data->>'actif')::boolean, true) and coalesce(u.data->>'statut', 'actif') = 'actif'
$$;

-- Tâche planifiée (toutes les 15 minutes) : activités terminées marquées « réalisées »
-- (jamais les annulées) et rappels envoyés avant le début, même si personne n'ouvre l'application
create or replace function public.e360_rappels_activites() returns int
language plpgsql security definer set search_path = public as $$
declare
  a record; r int; dest text; n int := 0; dus int[];
  maintenant timestamp := (now() at time zone 'UTC');
  debut timestamp;
begin
  update enregistrements set data = data || '{"statut":"realisee","statut_auto":true}'::jsonb
   where table_nom = 'activites' and not supprime and coalesce(data->>'statut', 'programmee') = 'programmee'
     and coalesce(nullif(data->>'fin', '')::timestamp, (data->>'debut')::timestamp + interval '2 hours') < maintenant;
  for a in select id, eglise_id, data from enregistrements
           where table_nom = 'activites' and not supprime and coalesce(data->>'statut', 'programmee') = 'programmee' and (data->>'debut')::timestamp > maintenant loop
    debut := (a.data->>'debut')::timestamp;
    -- Rappels arrivés à échéance et pas encore envoyés : un seul message, même si plusieurs sont dus
    select coalesce(array_agg(x), '{}') into dus from (select (jsonb_array_elements_text(coalesce(a.data->'rappels', '[1440, 120]'::jsonb)))::int x) t
     where debut - make_interval(mins => x) <= maintenant and not coalesce((a.data->'rappels_envoyes') ? x::text, false);
    if array_length(dus, 1) > 0 then
      r := (select min(x) from unnest(dus) x);
      for dest in select e360_destinataires_activite(a.id) loop
        insert into enregistrements (table_nom, id, eglise_id, data) values ('notifications', 'nt_rap_' || a.id || '_' || r || '_' || dest, a.eglise_id, jsonb_build_object(
          'id', 'nt_rap_' || a.id || '_' || r || '_' || dest, 'user_id', dest, 'type', 'activites', 'push', true, 'lu', false, 'le', now(),
          'titre', 'Rappel · ' || (a.data->>'titre'),
          'texte', 'Le ' || to_char(debut, 'DD/MM à HH24"h"MI') || coalesce(' — ' || nullif(a.data->>'lieu', ''), ''),
          'lien', '/activites/' || a.id)) on conflict (table_nom, id) do nothing;
        n := n + 1;
      end loop;
      update enregistrements set data = jsonb_set(data, '{rappels_envoyes}', coalesce(data->'rappels_envoyes', '[]'::jsonb) || (select jsonb_agg(x::text) from unnest(dus) x))
       where table_nom = 'activites' and id = a.id;
    end if;
  end loop;
  return n;
end $$;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule('e360-rappels') where exists (select 1 from cron.job where jobname = 'e360-rappels');
  perform cron.schedule('e360-rappels', '*/15 * * * *', 'select public.e360_rappels_activites()');
exception when others then raise notice 'Tâche planifiée non installée (activez l''extension pg_cron) : %', sqlerrm;
end $$;

-- ---------- Messagerie ----------
create or replace function public.e360_conv_visible(eg text, d jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select (d->>'type' in ('eglise', 'annonces') and eg = any(e360_mes_eglises()) and e360_droit('msg.utiliser', eg))
      or coalesce((d->'membres') ?| e360_mes_ids(), false)
$$;

create or replace function public.e360_conv_acces(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enregistrements c
                 where c.table_nom = 'conversations' and c.id = cid and not c.supprime
                   and e360_conv_visible(c.eglise_id, c.data))
$$;

-- ---------- Droits d'écriture ----------
create or replace function public.e360_peut_ecrire(t text, eg text, d jsonb, rid text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  m jsonb := e360_moi_dans(eg);
  sup boolean := e360_super();
  mes text[] := e360_mes_ids();
  conv record;
  ancien jsonb;
begin
  if auth.uid() is null then return false; end if;
  -- Messagerie : mêmes règles pour tous, super administrateur compris
  if t = 'conversations' then
    if d->>'type' not in ('eglise', 'annonces') and not coalesce((d->'membres') ?| mes, false) then return false; end if;
    return case d->>'type'
      when 'prive' then (sup or e360_droit('msg.prive', eg)) and jsonb_array_length(d->'membres') = 2
      when 'groupe' then sup or (m is not null and e360_droit('msg.groupes', eg))
      when 'support' then sup or m->>'role' = 'admin'
      else sup or (m is not null and e360_droit('admin.eglise', eg))
    end;
  end if;
  if t = 'messages' then
    select c.eglise_id, c.data into conv from enregistrements c where c.table_nom = 'conversations' and c.id = d->>'conversation_id';
    return d->>'auteur_id' = any(mes) and e360_conv_acces(d->>'conversation_id')
       and (coalesce(conv.data->>'type', '') <> 'annonces' or e360_droit('msg.annonces', conv.eglise_id));
  end if;
  if t = 'lectures' then return d->>'user_id' = any(mes) and e360_conv_acces(d->>'conversation_id'); end if;
  if t = 'appareils' then return d->>'user_id' = any(mes); end if;
  if t = 'presences' then return d->>'user_id' = any(mes); end if;
  -- Historique : on ajoute ses propres actions, on ne modifie jamais une ligne existante
  if t = 'historique' then
    return d->>'user_id' = any(mes) and not exists (select 1 from enregistrements where table_nom = 'historique' and id = rid);
  end if;
  -- Notifications : créées par le serveur ; chacun peut seulement marquer les siennes comme lues
  if t = 'notifications' then
    return d->>'user_id' = any(mes) and exists (select 1 from enregistrements where table_nom = 'notifications' and id = rid);
  end if;
  if t = 'corbeille' then return sup or (m is not null and (d->>'supprime_par' = any(mes) or e360_config(eg))); end if;
  -- Paramètres de l'application (modèles des nouvelles églises, maintenance…) : l'administrateur de l'application seul
  if t = 'parametres' then return sup; end if;
  if t = 'demandes' then
    return sup or (m is not null and (d->>'demandeur' = any(mes) or e360_droit('fin.rouvrir', eg)));
  end if;
  if sup then return true; end if;
  if m is null then return false; end if;
  case t
    when 'operations' then
      select data into ancien from enregistrements where table_nom = 'operations' and id = rid;
      -- Seuls ceux qui ont le droit de valider peuvent marquer une opération comme validée
      if d->>'statut' = 'validee' and coalesce(ancien->>'statut', '') <> 'validee' and not e360_droit('fin.valider', eg) and not e360_acces_caisse(d->>'caisse_id', 'valider') then return false; end if;
      -- Caisse d'une structure : le trésorier (ou le poste autorisé) de cette structure seulement
      if e360_acces_caisse(d->>'caisse_id', 'saisir') or e360_acces_caisse(d->>'caisse_id', 'valider') then return true; end if;
      -- Transfert : vers ou depuis la caisse d'une structure, seulement par ses responsables ou ceux de l'église
      if d ? 'transfert_id' and d->>'transfert_id' <> '' then
        return (e360_droit('fin.transferer', eg) or e360_droit('fin.valider', eg))
           and (coalesce(e360_structure_caisse(d->>'caisse_id'), '') = '' or e360_config(eg));
      end if;
      return (e360_droit('fin.saisir', eg) or e360_droit('fin.saisir_toutes', eg) or e360_droit('fin.modifier', eg) or e360_droit('fin.supprimer', eg) or e360_droit('fin.valider', eg))
         and (e360_gere(d->>'caisse_id', eg) or e360_droit('fin.valider', eg));
    when 'clotures' then
      return (e360_droit('fin.cloturer', eg) and e360_gere(d->>'caisse_id', eg)) or e360_droit('fin.rouvrir', eg) or e360_acces_caisse(d->>'caisse_id', 'saisir') or e360_acces_caisse(d->>'caisse_id', 'valider');
    when 'caisses' then return e360_droit('admin.caisses', eg) or e360_config(eg);
    when 'categories' then return e360_droit('admin.categories', eg) or e360_droit('admin.caisses', eg) or e360_config(eg) or e360_acces_caisse(d->>'caisse_id', 'categories');
    when 'cotisations' then return e360_config(eg) or e360_droit_poste(d->>'structure_id', 'cotisations');
    when 'paiements' then return e360_config(eg) or e360_droit_poste(e360_structure_cotisation(d->>'cotisation_id'), 'cotisations');
    when 'structures' then return e360_config(eg) or (exists (select 1 from enregistrements where table_nom = 'structures' and id = rid) and e360_droit_poste(rid, 'membres'));
    when 'fideles' then
      return e360_config(eg) or e360_droit('admin.utilisateurs', eg)
          or exists (select 1 from enregistrements p where p.table_nom = 'postes' and p.eglise_id = eg and not p.supprime
                       and p.data->>'fidele_id' = e360_mon_fidele(eg) and coalesce((p.data->'droits'->>'membres')::boolean, false))
          -- chacun peut compléter sa propre fiche (téléphone, adresse…), sans la rattacher à un autre compte
          or (d->>'user_id' = any(mes) and exists (select 1 from enregistrements f where f.table_nom = 'fideles' and f.id = rid and f.data->>'user_id' = d->>'user_id'));
    when 'coordonnees' then
      return rid = d->>'fidele_id' and (e360_gere_fideles(eg)
          or exists (select 1 from enregistrements f where f.table_nom = 'fideles' and f.id = rid and f.data->>'user_id' = any(mes)));
    when 'activites' then
      return e360_config(eg) or (coalesce(d->>'structure_id', '') <> '' and e360_droit_poste(d->>'structure_id', 'activites'))
          -- séance d'un programme régulier (culte, prière…) : droit « Gérer les programmes et le planning »
          or (coalesce(d->>'programme_id', '') <> '' and e360_droit('prog.gerer', eg));
    when 'listes', 'programmes' then return e360_config(eg) or e360_droit('prog.gerer', eg);
    when 'appartenances' then
      return e360_config(eg) or e360_droit_poste(d->>'structure_id', 'membres')
          -- un fidèle peut demander à rejoindre une structure ; le président (ou le poste désigné) valide
          or (d->>'fidele_id' = e360_mon_fidele(eg) and d->>'statut' = 'en_attente'
              and not exists (select 1 from enregistrements x where x.table_nom = 'appartenances' and x.id = rid));
    when 'postes' then return e360_config(eg) or e360_droit_poste(d->>'structure_id', 'bureau');
    when 'eglises' then
      -- L'administrateur configure son église mais ne peut pas la valider lui-même
      select data into ancien from enregistrements where table_nom = 'eglises' and id = rid;
      -- Les droits d'accès ne changent qu'avec le droit « Configurer les droits d'accès » (décision #10 : pas le pasteur)
      if (d->'droits') is distinct from (ancien->'droits') and not (e360_super() or e360_droit('admin.droits', eg)) then return false; end if;
      return rid = eg and (e360_config(eg) or e360_droit('admin.droits', eg))
         and coalesce(d->>'statut', 'actif') is not distinct from coalesce(ancien->>'statut', 'actif');
    when 'users' then
      select data into ancien from enregistrements where table_nom = 'users' and id = rid;
      -- La demande d'un pasteur pour rejoindre une autre église est validée par le super administrateur seul
      if ancien->>'statut' = 'en_attente' and ancien->>'role' = 'pasteur' and coalesce(d->>'statut', 'actif') <> 'en_attente' then return false; end if;
      if e360_droit('admin.utilisateurs', eg) or e360_config(eg) then return coalesce(d->>'role', '') <> 'super_admin'; end if;
      -- Chacun peut modifier son propre profil (nom, photo), sans changer son rôle, ses caisses ni son statut
      return rid = m->>'id'
         and d->>'role' = m->>'role'
         and coalesce(d->'caisses', '[]'::jsonb) = coalesce(m->'caisses', '[]'::jsonb)
         and d->>'auth_id' = m->>'auth_id'
         and coalesce(d->>'statut', 'actif') = 'actif';
    when 'journal' then return true;
    else return false;
  end case;
end $$;

-- ---------- Sécurité au niveau des lignes ----------
alter table public.enregistrements enable row level security;
revoke all on public.enregistrements from anon;
grant select, insert, update on public.enregistrements to authenticated;

drop policy if exists e360_lecture on public.enregistrements;
create policy e360_lecture on public.enregistrements for select to authenticated using (
  case
    when table_nom = 'parametres' then true
    when table_nom = 'conversations' then e360_conv_visible(eglise_id, data)
    when table_nom in ('messages', 'lectures') then e360_conv_acces(data->>'conversation_id')
    when table_nom = 'appareils' then data->>'user_id' = any(e360_mes_ids())
    when table_nom = 'presences' then e360_super() or eglise_id = any(e360_mes_eglises()) or data->>'role' = 'super_admin'
    when table_nom = 'notifications' then data->>'user_id' = any(e360_mes_ids())
    when table_nom = 'activites' then eglise_id = any(e360_mes_eglises()) and e360_activite_visible(eglise_id, data) or e360_super()
    when table_nom in ('listes', 'programmes') then eglise_id = any(e360_mes_eglises()) or e360_super()
    when table_nom = 'coordonnees' then eglise_id = any(e360_mes_eglises()) and e360_voit_coordonnees(eglise_id, data->>'fidele_id') or e360_super()
    when table_nom = 'fideles' then eglise_id = any(e360_mes_eglises()) and e360_fidele_visible(eglise_id, id, data) or e360_super()
    when table_nom in ('appartenances', 'postes') then e360_super() or (eglise_id = any(e360_mes_eglises()) and (e360_config(eglise_id) or e360_droit('fin.voir_details', eglise_id)
      or e360_droit('admin.utilisateurs', eglise_id) or e360_membre_structure(data->>'structure_id') or data->>'fidele_id' = e360_mon_fidele(eglise_id)))
    -- Chacun relit ses propres actions : nécessaire à l'envoi (insertion avec mise à jour) des actions des fidèles
    when table_nom = 'historique' then e360_super() or (eglise_id = any(e360_mes_eglises()) and e360_config(eglise_id)) or data->>'user_id' = any(e360_mes_ids())
    when table_nom = 'corbeille' then e360_super() or (eglise_id = any(e360_mes_eglises()) and (e360_config(eglise_id) or data->>'supprime_par' = any(e360_mes_ids())))
    when table_nom = 'demandes' then e360_super() or (eglise_id = any(e360_mes_eglises()) and (e360_droit('fin.voir_details', eglise_id) or data->>'demandeur' = any(e360_mes_ids())))
    -- Ses propres adhésions (même en attente) et les églises correspondantes
    when table_nom = 'users' and data->>'auth_id' = auth.uid()::text then true
    when table_nom = 'eglises' and id = any(e360_eglises_liees()) then true
    else e360_super() or (
      eglise_id = any(e360_mes_eglises()) and (
        table_nom in ('eglises', 'caisses', 'categories', 'structures')
        or (table_nom = 'users' and (e360_droit('fin.voir_details', eglise_id) or e360_droit('admin.utilisateurs', eglise_id)))
        or (table_nom in ('operations', 'clotures', 'journal') and e360_droit('fin.voir_details', eglise_id))
        or (table_nom in ('operations', 'clotures') and e360_acces_caisse(data->>'caisse_id', 'voir_details'))
        or (table_nom = 'cotisations' and (e360_droit('fin.voir_details', eglise_id) or e360_membre_structure(data->>'structure_id') or e360_droit_poste(data->>'structure_id', 'cotisations')))
        or (table_nom = 'paiements' and (e360_droit('fin.voir_details', eglise_id) or data->>'fidele_id' = e360_mon_fidele(eglise_id)
            or e360_droit_poste(e360_structure_cotisation(data->>'cotisation_id'), 'cotisations')))
      )
    )
  end
);

drop policy if exists e360_ajout on public.enregistrements;
create policy e360_ajout on public.enregistrements for insert to authenticated
  with check (e360_peut_ecrire(table_nom, eglise_id, data, id));

drop policy if exists e360_modif on public.enregistrements;
create policy e360_modif on public.enregistrements for update to authenticated
  using (e360_peut_ecrire(table_nom, eglise_id, data, id))
  with check (e360_peut_ecrire(table_nom, eglise_id, data, id));

-- ---------- Inscription et adhésions ----------
-- À la création d'un compte :
--  * rattachement à toutes les invitations portant la même adresse e-mail (déjà validées) ;
--  * sinon création d'une nouvelle église, EN ATTENTE de validation par le super administrateur ;
--  * sinon demande d'adhésion à une église existante, EN ATTENTE de validation par son administrateur.
create or replace function public.e360_nouveau_compte() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  n int;
  eid text;
  uid_txt text := 'u_' || replace(new.id::text, '-', '');
begin
  update enregistrements set data = data || jsonb_build_object('auth_id', new.id::text)
   where table_nom = 'users' and lower(data->>'email') = lower(new.email)
     and coalesce(data->>'auth_id', '') = '' and not supprime;
  get diagnostics n = row_count;
  if n > 0 then return new; end if;

  if jsonb_typeof(meta->'eglise') = 'object' and coalesce(meta->'eglise'->>'id', '') <> '' then
    eid := meta->'eglise'->>'id';
    insert into enregistrements (table_nom, id, eglise_id, data)
      values ('eglises', eid, eid, (meta->'eglise') || '{"statut":"en_attente","configuree":false}'::jsonb);
    insert into enregistrements (table_nom, id, eglise_id, data) values ('users', uid_txt, eid, jsonb_build_object(
      'id', uid_txt, 'eglise_id', eid, 'prenom', meta->>'prenom', 'nom', meta->>'nom', 'email', lower(new.email),
      'role', 'admin', 'caisses', '[]'::jsonb, 'actif', true, 'statut', 'actif', 'auth_id', new.id::text, 'le', now()));
  elsif coalesce(meta->>'eglise_id', '') <> ''
        and exists (select 1 from enregistrements where table_nom = 'eglises' and id = meta->>'eglise_id' and not supprime) then
    eid := meta->>'eglise_id';
    insert into enregistrements (table_nom, id, eglise_id, data) values ('users', uid_txt, eid, jsonb_build_object(
      'id', uid_txt, 'eglise_id', eid, 'prenom', meta->>'prenom', 'nom', meta->>'nom', 'email', lower(new.email),
      'role', 'fidele', 'caisses', '[]'::jsonb, 'actif', true, 'statut', 'en_attente', 'auth_id', new.id::text, 'le', now()));
    -- Structures choisies à l'inscription : demandes d'adhésion à valider par chaque structure
    if jsonb_typeof(meta->'structures') = 'array' then
      insert into enregistrements (table_nom, id, eglise_id, data)
      select 'appartenances', 'ap_' || uid_txt || '_' || st.id, eid, jsonb_build_object('id', 'ap_' || uid_txt || '_' || st.id, 'structure_id', st.id,
             'fidele_id', 'f_' || uid_txt, 'statut', 'en_attente', 'depuis', to_char(now(), 'YYYY-MM-DD'), 'demande', true)
      from enregistrements st
      where st.table_nom = 'structures' and st.eglise_id = eid and not st.supprime and st.id in (select jsonb_array_elements_text(meta->'structures'))
      on conflict (table_nom, id) do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists e360_nouveau_compte on auth.users;
create trigger e360_nouveau_compte after insert on auth.users
  for each row execute function public.e360_nouveau_compte();

-- Chaque compte d'une église a sa fiche de fidèle (créée automatiquement, sans doublon)
create or replace function public.e360_fiche_auto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.table_nom = 'users' and not new.supprime and coalesce(new.data->>'role', '') <> 'super_admin' and new.eglise_id <> '_global'
     and not exists (select 1 from enregistrements f where f.table_nom = 'fideles' and f.data->>'user_id' = new.id) then
    insert into enregistrements (table_nom, id, eglise_id, data) values ('fideles', 'f_' || new.id, new.eglise_id, jsonb_build_object(
      'id', 'f_' || new.id, 'prenom', new.data->>'prenom', 'nom', new.data->>'nom', 'user_id', new.id,
      'date_enregistrement', to_char(now(), 'YYYY-MM-DD'), 'actif', true)) on conflict (table_nom, id) do nothing;
    if coalesce(new.data->>'email', '') <> '' then
      insert into enregistrements (table_nom, id, eglise_id, data) values ('coordonnees', 'f_' || new.id, new.eglise_id,
        jsonb_build_object('fidele_id', 'f_' || new.id, 'email', new.data->>'email')) on conflict (table_nom, id) do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists e360_fiche_auto on public.enregistrements;
create trigger e360_fiche_auto after insert on public.enregistrements
  for each row when (new.table_nom = 'users') execute function public.e360_fiche_auto();

-- Fiches des comptes déjà existants (migration, sans doublon)
insert into enregistrements (table_nom, id, eglise_id, data)
select 'fideles', 'f_' || u.id, u.eglise_id, jsonb_build_object('id', 'f_' || u.id, 'prenom', u.data->>'prenom', 'nom', u.data->>'nom',
       'user_id', u.id, 'date_enregistrement', to_char(u.maj_le, 'YYYY-MM-DD'), 'actif', true)
from enregistrements u
where u.table_nom = 'users' and not u.supprime and coalesce(u.data->>'role', '') <> 'super_admin' and u.eglise_id <> '_global'
  and not exists (select 1 from enregistrements f where f.table_nom = 'fideles' and f.data->>'user_id' = u.id)
on conflict (table_nom, id) do nothing;

-- Rattache au compte connecté les invitations reçues depuis (ex. un pasteur invité dans une 2e église)
create or replace function public.e360_rattacher() returns int
language plpgsql security definer set search_path = public as $$
declare n int; mail text;
begin
  select email into mail from auth.users where id = auth.uid();
  if mail is null then return 0; end if;
  update enregistrements set data = data || jsonb_build_object('auth_id', auth.uid()::text)
   where table_nom = 'users' and lower(data->>'email') = lower(mail) and coalesce(data->>'auth_id', '') = '' and not supprime;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.e360_rattacher() to authenticated;

-- Un pasteur inscrit une autre église (en attente de validation par le super administrateur)
create or replace function public.e360_creer_eglise(eglise jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare eid text := eglise->>'id'; mail text; base jsonb;
begin
  if auth.uid() is null or coalesce(eid, '') = '' or exists (select 1 from enregistrements where table_nom = 'eglises' and id = eid) then
    raise exception 'Église invalide';
  end if;
  if not exists (select 1 from e360_mes_adhesions() a where a.data->>'role' in ('pasteur', 'super_admin')) then
    raise exception 'Seuls les pasteurs peuvent inscrire une autre église';
  end if;
  select email into mail from auth.users where id = auth.uid();
  select data into base from enregistrements where table_nom = 'users' and data->>'auth_id' = auth.uid()::text and not supprime limit 1;
  insert into enregistrements (table_nom, id, eglise_id, data) values ('eglises', eid, eid, eglise || '{"statut":"en_attente","configuree":false}'::jsonb);
  insert into enregistrements (table_nom, id, eglise_id, data) values ('users', 'u_' || md5(auth.uid()::text || eid), eid, jsonb_build_object(
    'id', 'u_' || md5(auth.uid()::text || eid), 'eglise_id', eid, 'prenom', base->>'prenom', 'nom', base->>'nom', 'photo', base->>'photo',
    'email', lower(mail), 'role', 'admin', 'caisses', '[]'::jsonb, 'actif', true, 'statut', 'actif', 'auth_id', auth.uid()::text, 'le', now()));
  return eid;
end $$;
grant execute on function public.e360_creer_eglise(jsonb) to authenticated;

-- Un pasteur demande à rejoindre une autre église (validation par le super administrateur)
create or replace function public.e360_rejoindre(eglise text) returns text
language plpgsql security definer set search_path = public as $$
declare mail text; base jsonb; uid_txt text := 'u_' || md5(auth.uid()::text || eglise);
begin
  if auth.uid() is null or not exists (select 1 from enregistrements where table_nom = 'eglises' and id = eglise and not supprime
                                       and coalesce(data->>'statut', 'actif') = 'actif') then
    raise exception 'Église introuvable';
  end if;
  if exists (select 1 from enregistrements where table_nom = 'users' and eglise_id = eglise and data->>'auth_id' = auth.uid()::text and not supprime) then
    return 'deja';
  end if;
  if not exists (select 1 from e360_mes_adhesions() a where a.data->>'role' = 'pasteur') then
    raise exception 'Seuls les pasteurs peuvent rejoindre une autre église';
  end if;
  select email into mail from auth.users where id = auth.uid();
  select data into base from enregistrements where table_nom = 'users' and data->>'auth_id' = auth.uid()::text and not supprime limit 1;
  insert into enregistrements (table_nom, id, eglise_id, data) values ('users', uid_txt, eglise, jsonb_build_object(
    'id', uid_txt, 'eglise_id', eglise, 'prenom', base->>'prenom', 'nom', base->>'nom', 'photo', base->>'photo', 'email', lower(mail),
    'role', 'pasteur', 'caisses', '[]'::jsonb, 'actif', true, 'statut', 'en_attente', 'validation', 'super', 'auth_id', auth.uid()::text, 'le', now()))
  on conflict (table_nom, id) do update set data = excluded.data, supprime = false;
  return uid_txt;
end $$;
grant execute on function public.e360_rejoindre(text) to authenticated;

-- Structures d'une église, pour l'écran d'inscription (nom uniquement)
create or replace function public.liste_structures(eglise text) returns table (id text, nom text, description text)
language sql stable security definer set search_path = public as $$
  select id, data->>'nom', data->>'description' from enregistrements
  where table_nom = 'structures' and eglise_id = eglise and not supprime and coalesce((data->>'actif')::boolean, true) order by 2
$$;
grant execute on function public.liste_structures(text) to anon, authenticated;

-- Liste des églises validées (inscription, adhésion)
create or replace function public.liste_eglises() returns table (id text, nom text, ville text)
language sql stable security definer set search_path = public as $$
  select id, data->>'nom', data->>'ville' from enregistrements
  where table_nom = 'eglises' and not supprime and coalesce(data->>'statut', 'actif') = 'actif' order by 2
$$;
grant execute on function public.liste_eglises() to anon, authenticated;

-- Totaux mensuels par caisse pour les profils sans accès au détail (fidèles)
create or replace function public.resume_caisses()
returns table (caisse_id text, mois text, recettes numeric, depenses numeric)
language sql stable security definer set search_path = public as $$
  select o.data->>'caisse_id', left(o.data->>'date', 7),
         sum(case when o.data->>'type' = 'recette' then (o.data->>'montant')::numeric else 0 end),
         sum(case when o.data->>'type' = 'depense' then (o.data->>'montant')::numeric else 0 end)
  from enregistrements o
  join enregistrements c on c.table_nom = 'caisses' and c.id = o.data->>'caisse_id' and not c.supprime
       and ((coalesce(c.data->>'structure_id', '') = '' and coalesce((c.data->>'visible_fideles')::boolean, true))
            or (coalesce(c.data->>'structure_id', '') <> '' and e360_membre_structure(c.data->>'structure_id')))
  join enregistrements e on e.table_nom = 'eglises' and e.id = o.eglise_id
  where o.table_nom = 'operations' and not o.supprime
    and o.eglise_id = any(e360_mes_eglises()) and (e360_droit('fin.voir_totaux', o.eglise_id) or coalesce(c.data->>'structure_id', '') <> '')
    and (not coalesce((e.data->'parametres'->>'fideles_mois_clotures')::boolean, false)
         or exists (select 1 from enregistrements k where k.table_nom = 'clotures' and not k.supprime
                    and k.data->>'caisse_id' = o.data->>'caisse_id' and k.data->>'mois' = left(o.data->>'date', 7)))
  group by 1, 2
$$;
grant execute on function public.resume_caisses() to authenticated;

-- Annuaire de la messagerie : noms, rôles et photos (sans e-mail).
-- Membres de mes églises et super administrateurs (pour reconnaître qui écrit) ;
-- le super administrateur voit les membres de toutes les églises.
drop function if exists public.annuaire();
create or replace function public.annuaire()
returns table (id text, eglise_id text, prenom text, nom text, role text, actif boolean, photo text)
language sql stable security definer set search_path = public as $$
  select u.id, u.eglise_id, u.data->>'prenom', u.data->>'nom', u.data->>'role', coalesce((u.data->>'actif')::boolean, true), u.data->>'photo'
  from enregistrements u
  where u.table_nom = 'users' and not u.supprime and auth.uid() is not null
    and coalesce(u.data->>'statut', 'actif') = 'actif'
    and (e360_super()
         or u.eglise_id = any(e360_mes_eglises())
         or u.data->>'role' = 'super_admin')
$$;
grant execute on function public.annuaire() to authenticated;

-- Pièces justificatives : stockage privé « pieces », un dossier par église
-- (lecture : ceux qui voient le détail des opérations ; ajout : les membres de l'église)
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit) values ('pieces', 'pieces', false, 5242880) on conflict (id) do nothing;
  execute 'drop policy if exists e360_pieces_lecture on storage.objects';
  execute 'create policy e360_pieces_lecture on storage.objects for select to authenticated using (bucket_id = ''pieces'' and (public.e360_super() or public.e360_droit(''fin.voir_details'', (storage.foldername(name))[1])))';
  execute 'drop policy if exists e360_pieces_ajout on storage.objects';
  execute 'create policy e360_pieces_ajout on storage.objects for insert to authenticated with check (bucket_id = ''pieces'' and (public.e360_super() or public.e360_moi_dans((storage.foldername(name))[1]) is not null))';
exception when others then raise notice 'Stockage des pièces non configuré : %', sqlerrm;
end $$;

-- Décision #2 : droit « Transférer » accordé à l'administrateur (une seule fois par église,
-- pour ne pas écraser un réglage modifié ensuite dans Droits d'accès)
update enregistrements
   set data = jsonb_set(jsonb_set(data, '{droits,admin,fin.transferer}', 'true'), '{migrations}', coalesce(data->'migrations', '[]'::jsonb) || '"admin_transferer"'::jsonb)
 where table_nom = 'eglises' and data ? 'droits' and data->'droits' ? 'admin'
   and not coalesce((data->'migrations') ? 'admin_transferer', false);

-- Décision #9 : le pasteur ne rouvre pas les mois clôturés (une seule fois par église)
update enregistrements
   set data = jsonb_set(jsonb_set(data, '{droits,pasteur,fin.rouvrir}', 'false'), '{migrations}', coalesce(data->'migrations', '[]'::jsonb) || '"pasteur_sans_reouverture"'::jsonb)
 where table_nom = 'eglises' and data ? 'droits' and data->'droits' ? 'pasteur'
   and not coalesce((data->'migrations') ? 'pasteur_sans_reouverture', false);

-- #11 : les coordonnées quittent les fiches de fidèles pour la table protégée « coordonnees »
insert into enregistrements (table_nom, id, eglise_id, data)
select 'coordonnees', f.id, f.eglise_id,
       jsonb_strip_nulls(jsonb_build_object('fidele_id', f.id, 'telephone', f.data->'telephone', 'email', f.data->'email',
         'adresse', f.data->'adresse', 'date_naissance', f.data->'date_naissance', 'notes', f.data->'notes'))
         || coalesce((select c.data from enregistrements c where c.table_nom = 'coordonnees' and c.id = f.id), '{}'::jsonb)
from enregistrements f
where f.table_nom = 'fideles' and f.data ?| array['telephone', 'email', 'adresse', 'date_naissance', 'notes']
on conflict (table_nom, id) do update set data = excluded.data, supprime = false;
-- e-mails des comptes : dans les coordonnées des fiches correspondantes
insert into enregistrements (table_nom, id, eglise_id, data)
select 'coordonnees', 'f_' || u.id, u.eglise_id, jsonb_build_object('fidele_id', 'f_' || u.id, 'email', u.data->>'email')
from enregistrements u
where u.table_nom = 'users' and not u.supprime and coalesce(u.data->>'email', '') <> '' and coalesce(u.data->>'role', '') <> 'super_admin'
  and exists (select 1 from enregistrements f where f.table_nom = 'fideles' and f.id = 'f_' || u.id)
on conflict (table_nom, id) do nothing;
update enregistrements set data = data - 'telephone' - 'email' - 'adresse' - 'date_naissance' - 'notes'
 where table_nom = 'fideles' and data ?| array['telephone', 'email', 'adresse', 'date_naissance', 'notes'];

-- Temps réel (messages instantanés)
do $$ begin
  alter publication supabase_realtime add table public.enregistrements;
exception when others then null;
end $$;

-- =====================================================================
-- Pour devenir SUPER ADMINISTRATEUR (une seule fois, après votre inscription),
-- remplacez l'adresse ci-dessous puis exécutez uniquement cette commande :
--
-- update public.enregistrements set data = jsonb_set(data, '{role}', '"super_admin"')
--  where table_nom = 'users' and lower(data->>'email') = lower('votre@email.com');
-- =====================================================================
