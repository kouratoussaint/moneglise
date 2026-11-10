# Mon Église — Toute votre église à portée de main

Application mobile (Android) de gestion d'église, multi-église.
Développeur : KOURA Toussaint — +226 75 49 35 18 / +226 71 22 22 28 (WhatsApp : +226 75 49 35 18).

## Fonctionnalités

- **Finances** : caisses, recettes et dépenses catégorisées, transferts, clôtures mensuelles et réouvertures (demande, cascade, délai), validation par le pasteur, contre-passation, pièces justificatives, import Excel, rapports (PDF, Excel, CSV).
- **Fidèles** : fiche unique pour chaque personne (tous les responsables sont aussi des fidèles), avec ou sans compte.
- **Structures** (JAD, ASC, MEHB, DENAD, chorale…) : membres, demandes d'adhésion, bureau aux postes configurables avec historique, caisse propre, catégories, cotisations (unique, hebdomadaire, mensuelle, trimestrielle, annuelle).
- **Activités** : à venir, en cours, réalisées, annulées, non tenues ; rappels automatiques.
- **Messagerie** : discussions privées, groupes, annonces, accusés de lecture, présence.
- **Notifications** : centre de notifications et notifications push (Firebase), réglables par profil.
- **Traçabilité** : historique de toutes les actions, corbeille avec restauration.
- **Accueil selon le profil** (responsable, membre de structure, fidèle).
- Rôles : administrateur de l'application, administrateur d'église, pasteur, gestionnaire, fidèle ; droits configurables par église et contrôlés par le serveur.

## Technologies

React 18 + Vite, Capacitor 7 (Android), Supabase (PostgreSQL, sécurité par lignes, fonctions Edge, pg_cron), Firebase Cloud Messaging, Chart.js, jsPDF, SheetJS.
L'application fonctionne d'abord sur le téléphone (hors connexion) et se synchronise avec le serveur.

## Démarrer

```bash
npm install
npm run dev        # aperçu dans le navigateur
```

Sans serveur configuré, l'application fonctionne en **mode démonstration** (données locales).
Comptes de démonstration (mot de passe `demo123`) : admin@demo.bf, pasteur@demo.bf, tresorier@demo.bf, vimab@demo.bf, fidele@demo.bf, superadmin@eglise360.app.

## Compiler l'APK

Prérequis : JDK 21, SDK Android (API 35) et le fichier de signature.

1. Placez la clé `eglise360.keystore` dans `android/` (elle n'est **pas** dans le dépôt).
2. Copiez `android/keystore.properties.exemple` en `android/keystore.properties` et renseignez les mots de passe (fichier ignoré par Git).
3. Lancez `bash android/build.sh`.

L'APK signé est produit dans `android/app/build/outputs/apk/release/`.
Augmentez `versionCode` dans `android/app/build.gradle` à chaque nouvelle version.

> Conservez précieusement la clé de signature : sans elle, une nouvelle version ne peut pas s'installer par-dessus l'application déjà présente sur les téléphones.

## Serveur

Toute la mise en place est décrite dans **GUIDE_SERVEUR.md** :
- `supabase/schema.sql` : tables, règles de sécurité, fonctions, tâche planifiée (à relancer en entier à chaque mise à jour, données conservées) ;
- `supabase/functions/notifier` : notifications (déclenchée par un webhook) ;
- `supabase/functions/compte` : mot de passe temporaire donné par l'administrateur.

L'adresse et la clé publique du serveur se saisissent dans l'application (écran « Serveur »), ou dans `src/config.js` pour les intégrer à l'APK.
Les clés secrètes (rôle de service Supabase, compte de service Firebase) restent dans les réglages de Supabase et ne doivent jamais être ajoutées au dépôt.

## Organisation du code

- `src/modules/finances` : accueil, opérations, saisie, caisses, transferts, clôtures, rapports, import
- `src/modules/membres` : fidèles
- `src/modules/structures` : structures, bureaux, caisses de structure, cotisations
- `src/modules/activites` : activités
- `src/modules/messages` : messagerie
- `src/modules/admin` : paramètres, utilisateurs, droits, historique, corbeille, assistant de configuration
- `src/lib` : règles métier (droits, finances, cotisations, activités, structures, historique, exports)
- `src/state` : état global, synchronisation, visibilité des données
- `src/data` : stockage local, synchronisation Supabase, données de démonstration
