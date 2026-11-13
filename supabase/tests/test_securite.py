"""Tests des règles de sécurité du serveur (Supabase / PostgreSQL).

Lancement : python3 supabase/tests/test_securite.py
Base : variables PG* habituelles (par défaut postgres@localhost, base e360test).
Le script prépare une base « façon Supabase » (rôles, schéma auth), applique schema.sql
deux fois (il doit pouvoir être relancé sans erreur), puis vérifie qui peut lire et écrire quoi.
"""
import json, os, subprocess, sys, uuid
import psycopg2

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
conn = psycopg2.connect(dbname=os.environ.get('PGDATABASE', 'e360test'))
conn.autocommit = True
cur = conn.cursor()
resultats = []

def sql(q, *a):
    cur.execute(q, a or None)
    return cur.fetchall() if cur.description else None

def preparer():
    sql("""do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;""")
    sql("create schema if not exists auth")
    sql("create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb)")
    sql("create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$")
    sql("grant usage on schema auth, public to anon, authenticated, service_role")
    schema = open(os.path.join(RACINE, 'supabase', 'schema.sql')).read()
    for _ in range(2):
        sql(schema)
    sql("grant all on all tables in schema public to anon, authenticated, service_role")
    sql("grant execute on all functions in schema public to anon, authenticated, service_role")
    sql("grant execute on function auth.uid() to anon, authenticated, service_role")

def matrice():
    js = subprocess.run(['npx', 'esbuild', os.path.join(RACINE, 'scripts', 'matrice.mjs'), '--bundle', '--platform=node', '--log-level=error'],
                        capture_output=True, text=True, cwd=RACINE, check=True).stdout
    return subprocess.run(['node'], input=js, capture_output=True, text=True, check=True).stdout.strip()

UID = {}
def compte(nom):
    UID.setdefault(nom, str(uuid.uuid4()))
    return UID[nom]

def ins(table, id, eg, data):
    sql("insert into enregistrements (table_nom, id, eglise_id, data) values (%s, %s, %s, %s) on conflict (table_nom, id) do update set data = excluded.data, supprime = false",
        table, id, eg, json.dumps(data))

def comme(nom, requete, *a):
    """Exécute une requête en tant qu'utilisateur connecté ; renvoie (réussite, lignes)."""
    try:
        cur.execute("begin")
        cur.execute("set local role authenticated")
        cur.execute("select set_config('request.jwt.claim.sub', %s, true)", (compte(nom),))
        cur.execute(requete, a or None)
        lignes = cur.fetchall() if cur.description else None
        cur.execute("commit")
        return True, lignes
    except psycopg2.Error:
        cur.execute("rollback")
        return False, None

def ecrire(nom, table, id, eg, data):
    return comme(nom, "insert into enregistrements (table_nom, id, eglise_id, data) values (%s, %s, %s, %s) on conflict (table_nom, id) do update set data = excluded.data",
                 table, id, eg, json.dumps(data))[0]

def ids(nom, table):
    ok, l = comme(nom, "select id from enregistrements where table_nom = %s and not supprime order by id", table)
    return [x[0] for x in l] if ok else None

def verifier(libelle, obtenu, attendu):
    resultats.append((libelle, obtenu == attendu, obtenu, attendu))

def donnees():
    sql("truncate enregistrements")
    sql("delete from auth.users")
    m = matrice()
    for eg in ('e1', 'e2'):
        sql("insert into enregistrements (table_nom, id, eglise_id, data) values ('eglises', %s, %s, %s)", eg, eg, json.dumps({'nom': eg.upper(), 'droits': json.loads(m)}))
    sql(open(os.path.join(RACINE, 'supabase', 'schema.sql')).read())  # applique les migrations aux églises
    comptes = {'admin': ('e1', 'admin', []), 'pasteur': ('e1', 'pasteur', []), 'gest': ('e1', 'gestionnaire', ['c_eg']),
               'tres': ('e1', 'fidele', []), 'pres': ('e1', 'fidele', []), 'membre': ('e1', 'fidele', []), 'externe': ('e2', 'fidele', []),
               'appli': ('_global', 'super_admin', [])}
    for nom, (eg, role, caisses) in comptes.items():
        sql("insert into auth.users (id, email) values (%s, %s)", compte(nom), f'{nom}@test.bf')
        ins('users', f'u_{nom}', eg, {'prenom': nom, 'role': role, 'caisses': caisses, 'auth_id': compte(nom)})
    ins('fideles', 'f_sans', 'e1', {'prenom': 'SansCompte', 'telephone': '70000000', 'adresse': 'Secteur 22'})
    sql(open(os.path.join(RACINE, 'supabase', 'schema.sql')).read())  # migration #11
    ins('caisses', 'c_eg', 'e1', {'nom': 'Caisse Église'})
    ins('structures', 's_jad', 'e1', {'nom': 'JAD'}); ins('structures', 's_asc', 'e1', {'nom': 'ASC'})
    ins('caisses', 'c_jad', 'e1', {'nom': 'Caisse JAD', 'structure_id': 's_jad', 'visible_fideles': False})
    for f in ('tres', 'pres', 'membre'):
        ins('appartenances', f'ap_{f}', 'e1', {'structure_id': 's_jad', 'fidele_id': f'f_u_{f}'})
    ins('postes', 'p_tres', 'e1', {'structure_id': 's_jad', 'intitule': 'Trésorier', 'fidele_id': 'f_u_tres', 'droits': {'saisir': True, 'voir_details': True, 'cotisations': True}})
    ins('postes', 'p_pres', 'e1', {'structure_id': 's_jad', 'intitule': 'Président', 'fidele_id': 'f_u_pres', 'droits': {'membres': True, 'bureau': True, 'activites': True, 'voir_details': True}})
    ins('operations', 'op_eg', 'e1', {'caisse_id': 'c_eg', 'type': 'recette', 'montant': 1000, 'date': '2026-09-10'})
    ins('clotures', 'cl_eg', 'e1', {'caisse_id': 'c_eg', 'mois': '2026-09'})

def tests():
    # Fiches de fidèles créées automatiquement pour chaque compte
    verifier("Fiche de fidèle créée pour chaque compte", len([i for i in ids('admin', 'fideles') or [] if i.startswith('f_u_')]), 6)
    # #1 Liste des fidèles : toute l'église, jamais une autre église
    verifier("#1 Un simple fidèle voit toutes les fiches de son église", len(ids('membre', 'fideles')), 7)
    verifier("#1 Un fidèle d'une autre église ne voit que la sienne", ids('externe', 'fideles'), ['f_u_externe'])
    # Historique : on ajoute, on ne modifie jamais
    verifier("Historique : ajout de sa propre action", ecrire('membre', 'historique', 'h1', 'e1', {'user_id': 'u_membre', 'action': 'creation'}), True)
    verifier("Historique : action d'un trésorier de structure (rôle fidèle)", ecrire('tres', 'historique', 'h2', 'e1', {'user_id': 'u_tres', 'action': 'creation', 'table': 'paiements'}), True)
    verifier("Historique : un fidèle ne lit pas les actions des autres", ids('membre', 'historique'), ['h1'])
    verifier("Historique : modification refusée", ecrire('membre', 'historique', 'h1', 'e1', {'user_id': 'u_membre', 'action': 'falsifiee'}), False)
    # Caisses des structures : séparation stricte
    verifier("Trésorier JAD : saisie dans la caisse JAD", ecrire('tres', 'operations', 'op_j1', 'e1', {'caisse_id': 'c_jad', 'type': 'recette', 'montant': 500, 'date': '2026-10-05'}), True)
    verifier("Trésorier JAD : saisie dans la caisse de l'église refusée", ecrire('tres', 'operations', 'op_j2', 'e1', {'caisse_id': 'c_eg', 'type': 'recette', 'montant': 500, 'date': '2026-10-05'}), False)
    verifier("Gestionnaire église : transfert vers la caisse JAD refusé", ecrire('gest', 'operations', 'tr1', 'e1', {'caisse_id': 'c_jad', 'type': 'recette', 'montant': 1, 'date': '2026-10-05', 'transfert_id': 'x'}), False)
    verifier("#2 Administrateur : transfert vers la caisse JAD", ecrire('admin', 'operations', 'tr2', 'e1', {'caisse_id': 'c_jad', 'type': 'recette', 'montant': 1, 'date': '2026-10-05', 'transfert_id': 'y'}), True)
    verifier("Simple membre JAD : ne voit pas le détail des opérations JAD", 'op_j1' in (ids('membre', 'operations') or []), False)
    ok, l = comme('membre', "select caisse_id from resume_caisses()")
    verifier("Simple membre JAD : voit les totaux de la caisse JAD", 'c_jad' in [x[0] for x in (l or [])], True)
    verifier("Trésorier JAD : clôture de sa caisse", ecrire('tres', 'clotures', 'cl_jad', 'e1', {'caisse_id': 'c_jad', 'mois': '2026-09'}), True)
    # Structures : droits portés par les postes
    verifier("Président JAD : ajoute un membre à la JAD", ecrire('pres', 'appartenances', 'ap_x', 'e1', {'structure_id': 's_jad', 'fidele_id': 'f_u_gest'}), True)
    verifier("Président JAD : rien sur l'ASC", ecrire('pres', 'appartenances', 'ap_y', 'e1', {'structure_id': 's_asc', 'fidele_id': 'f_u_gest'}), False)
    verifier("Président JAD : ne crée pas de structure", ecrire('pres', 'structures', 's_x', 'e1', {'nom': 'X'}), False)
    verifier("Simple membre : demande d'adhésion à l'ASC", ecrire('membre', 'appartenances', 'ap_dem', 'e1', {'structure_id': 's_asc', 'fidele_id': 'f_u_membre', 'statut': 'en_attente'}), True)
    verifier("Simple membre : ne valide pas sa propre demande", ecrire('membre', 'appartenances', 'ap_dem', 'e1', {'structure_id': 's_asc', 'fidele_id': 'f_u_membre', 'statut': 'actif'}), False)
    # Activités
    verifier("Président JAD : programme une activité JAD", ecrire('pres', 'activites', 'act1', 'e1', {'structure_id': 's_jad', 'titre': 'Réunion', 'debut': '2030-01-01T10:00'}), True)
    verifier("Président JAD : pas d'activité au nom de l'église", ecrire('pres', 'activites', 'act2', 'e1', {'titre': 'Culte', 'debut': '2030-01-01T10:00'}), False)
    verifier("Fidèle d'une autre église : ne voit pas l'activité", ids('externe', 'activites'), [])
    # Notifications
    verifier("Fidèle : ne crée pas de notification", ecrire('membre', 'notifications', 'n1', 'e1', {'user_id': 'u_membre'}), False)
    # #10 Pasteur et droits d'accès
    ok, l = comme('pasteur', "select data from enregistrements where table_nom = 'eglises' and id = 'e1'")
    e = l[0][0]
    verifier("#10 Pasteur : modifie le nom de l'église", ecrire('pasteur', 'eglises', 'e1', 'e1', {**e, 'nom': 'E1 renommée'}), True)
    d = json.loads(json.dumps(e)); d['nom'] = 'E1 renommée'; d['droits']['fidele']['fin.voir_details'] = True
    verifier("#10 Pasteur : ne modifie pas les droits d'accès", ecrire('pasteur', 'eglises', 'e1', 'e1', d), False)
    verifier("#10 Administrateur : modifie les droits d'accès", ecrire('admin', 'eglises', 'e1', 'e1', {**d, 'droits': {**d['droits'], 'fidele': {**d['droits']['fidele'], 'fin.voir_details': False}}}), True)
    # Paramètres de l'application
    verifier("Paramètres : l'administrateur de l'application les modifie", ecrire('appli', 'parametres', 'application', '_global', {'valeur': {'maintenance': {'actif': False}}}), True)
    verifier("Paramètres : lisibles par tout compte", ids('membre', 'parametres'), ['application'])
    verifier("Paramètres : un administrateur d'église ne les modifie pas", ecrire('admin', 'parametres', 'application', '_global', {'valeur': {'maintenance': {'actif': True}}}), False)
    # Console : église suspendue par l'administrateur de l'application
    sql("update enregistrements set data = data || '{\"statut\": \"suspendue\"}' where table_nom = 'eglises' and id = 'e2'")
    verifier("Église suspendue : ses membres ne lisent plus rien", ids('externe', 'fideles'), [])
    verifier("Église suspendue : ses membres n'écrivent plus rien", ecrire('externe', 'fideles', 'f_x', 'e2', {'prenom': 'X'}), False)
    sql("update enregistrements set data = data || '{\"statut\": \"actif\"}' where table_nom = 'eglises' and id = 'e2'")
    verifier("Église réactivée : accès rétabli", ids('externe', 'fideles'), ['f_u_externe'])
    # #11 Coordonnées des fidèles protégées par le serveur
    verifier("#11 La fiche ne contient plus de téléphone", 'telephone' in sql("select data from enregistrements where table_nom = 'fideles' and id = 'f_sans'")[0][0], False)
    verifier("#11 Un simple fidèle ne lit pas les coordonnées des autres", [i for i in (ids('membre', 'coordonnees') or []) if i != 'f_u_membre'], [])
    verifier("#11 L'administrateur lit les coordonnées", 'f_sans' in (ids('admin', 'coordonnees') or []), True)
    verifier("#11 Le président (poste chargé des membres) lit les coordonnées", 'f_sans' in (ids('pres', 'coordonnees') or []), True)
    verifier("#11 Un fidèle complète ses propres coordonnées", ecrire('membre', 'coordonnees', 'f_u_membre', 'e1', {'fidele_id': 'f_u_membre', 'telephone': '76000000'}), True)
    verifier("#11 Un fidèle lit ses propres coordonnées", 'f_u_membre' in (ids('membre', 'coordonnees') or []), True)
    verifier("#11 Un fidèle ne modifie pas celles d'un autre", ecrire('membre', 'coordonnees', 'f_sans', 'e1', {'fidele_id': 'f_sans', 'telephone': '0'}), False)
    # #9 Pasteur et réouverture
    verifier("#9 Pasteur : ne rouvre pas un mois", comme('pasteur', "update enregistrements set supprime = true where table_nom = 'clotures' and id = 'cl_eg'")[0] and
             sql("select supprime from enregistrements where table_nom = 'clotures' and id = 'cl_eg'")[0][0], False)
    verifier("#9 Administrateur : rouvre un mois", comme('admin', "update enregistrements set supprime = true where table_nom = 'clotures' and id = 'cl_eg'")[0] and
             sql("select supprime from enregistrements where table_nom = 'clotures' and id = 'cl_eg'")[0][0], True)

preparer()
donnees()
tests()
echecs = [r for r in resultats if not r[1]]
for libelle, ok, obtenu, attendu in resultats:
    print(('  ✓ ' if ok else '  ✗ ') + libelle + ('' if ok else f'  (obtenu : {obtenu}, attendu : {attendu})'))
print(f"\n{len(resultats) - len(echecs)}/{len(resultats)} tests réussis")
sys.exit(1 if echecs else 0)
