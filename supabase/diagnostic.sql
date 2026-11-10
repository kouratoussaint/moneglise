-- Diagnostic en lecture seule : rattachement des comptes de connexion aux églises
\pset footer off
begin read only;

\echo '=== Comptes de connexion sans aucune adhésion active reliée ==='
select a.email as compte, a.created_at::date as cree_le, a.last_sign_in_at::date as derniere_connexion,
       (select string_agg(coalesce(u.eglise_id, '?') || ' / ' || coalesce(u.data->>'role', '?') || ' / ' || coalesce(u.data->>'statut', 'actif')
              || case when u.data->>'auth_id' is null or u.data->>'auth_id' = '' then ' / non relié'
                      when u.data->>'auth_id' <> a.id::text then ' / relié à un AUTRE compte' else ' / relié' end
              || case when u.supprime then ' / supprimé' else '' end
              || case when coalesce((u.data->>'actif')::boolean, true) then '' else ' / désactivé' end, ' ; ')
          from enregistrements u where u.table_nom = 'users' and lower(u.data->>'email') = lower(a.email)) as adhesions_meme_email
from auth.users a
where not exists (select 1 from enregistrements u where u.table_nom = 'users' and not u.supprime and u.data->>'auth_id' = a.id::text)
order by a.created_at;

\echo '=== Adhésions reliées à un compte qui n''existe plus ==='
select u.id, u.eglise_id, u.data->>'prenom' as prenom, u.data->>'email' as email, u.data->>'role' as role, coalesce(u.data->>'statut', 'actif') as statut
from enregistrements u
where u.table_nom = 'users' and not u.supprime and coalesce(u.data->>'auth_id', '') <> ''
  and not exists (select 1 from auth.users a where a.id::text = u.data->>'auth_id');

\echo '=== Adhésions dont l''e-mail diffère de celui du compte relié ==='
select u.id, u.eglise_id, u.data->>'email' as email_adhesion, a.email as email_compte
from enregistrements u join auth.users a on a.id::text = u.data->>'auth_id'
where u.table_nom = 'users' and not u.supprime and lower(coalesce(u.data->>'email', '')) <> lower(a.email);

\echo '=== Récapitulatif par église ==='
select coalesce(e.data->>'nom', u.eglise_id) as eglise, coalesce(e.data->>'statut', 'actif') as statut_eglise,
       count(*) as adhesions, count(*) filter (where coalesce(u.data->>'statut', 'actif') = 'actif') as actives,
       count(*) filter (where coalesce(u.data->>'statut', 'actif') = 'en_attente') as en_attente,
       count(*) filter (where coalesce(u.data->>'auth_id', '') = '') as sans_compte
from enregistrements u left join enregistrements e on e.table_nom = 'eglises' and e.id = u.eglise_id
where u.table_nom = 'users' and not u.supprime group by 1, 2 order by 1;
rollback;
