# Mon Église — Analyse de l'application

*État au build 25 (`v1.0-build25`). Matrice des droits calculée automatiquement à partir du code (`src/lib/permissions.js`).*

## 1. Vue d'ensemble

| Élément | Valeur |
|---|---|
| Plateforme | Application Android (APK), aperçu navigateur |
| Code de l'application | ~7 900 lignes (React), 22 écrans principaux, 33 routes |
| Serveur | `schema.sql` (~630 lignes), 2 fonctions Edge (`notifier`, `compte`), 1 tâche planifiée |
| Compilation | GitHub Actions : APK signé à chaque envoi sur `main`, Release à chaque étiquette `v…` |
| Suivi | Issues GitHub (étiquettes : bug, evolution, serveur, decision, a-tester) |

## 2. Architecture

### Application (React + Vite + Capacitor)
- **`src/modules/`** : un dossier par domaine — `finances`, `membres` (fidèles), `structures`, `activites`, `messages`, `admin`, `auth`, `info`.
- **`src/lib/`** : règles métier pures (droits, finances, cotisations, activités, structures, historique, exports, présence…).
- **`src/state/AppContext.jsx`** : état global, toutes les actions (écritures), traçabilité automatique, synchronisation.
- **`src/state/useVue.js`** : ce que chaque utilisateur peut voir (caisses, opérations détaillées ou totaux).
- **`src/data/`** : stockage local, synchronisation Supabase, données de démonstration.

### Fonctionnement « d'abord sur le téléphone »
1. Toute action modifie d'abord la base locale du téléphone (fonctionne hors connexion).
2. Chaque modification est comparée à l'état précédent : on en déduit automatiquement l'**historique** (qui, quoi, quand, avant/après) et la **corbeille**.
3. Les changements partent dans une **file d'attente**, envoyée au serveur dès que le réseau est là.
4. Le téléphone récupère les changements des autres (temps réel + synchronisation périodique). Après une mise à jour de l'application qui ajoute des types de données, tout est rechargé.

### Serveur (Supabase)
- **Une table unique `enregistrements`** (type, id, église, données JSON, date de mise à jour, suppression logique) : ajout de modules sans migration lourde.
- **Sécurité par lignes (RLS)** : chaque lecture et écriture passe par des fonctions de contrôle (`e360_peut_ecrire`, droits par rôle, droits par poste de structure, accès aux caisses de structure…). Masquer un bouton ne suffit jamais : le serveur refuse.
- **Fonctions et déclencheurs** : création des comptes et des fiches de fidèles, inscription aux églises et structures, rappels d'activités.
- **Fonctions Edge** : `notifier` (notifications selon les réglages de chaque profil, envoi Firebase), `compte` (mot de passe temporaire).
- **Tâche planifiée** (`pg_cron`, toutes les 15 min) : rappels d'activités, activités terminées marquées « réalisées ».
- **Stockage** : espace privé `pieces` pour les pièces justificatives.

### Données principales
`eglises`, `users` (comptes et rôles par église), `fideles`, `structures`, `appartenances`, `postes`, `caisses`, `categories`, `operations`, `clotures`, `demandes` (réouverture), `cotisations`, `paiements`, `activites`, `conversations`, `messages`, `lectures`, `notifications`, `historique`, `corbeille`, `presences`, `appareils`.

## 3. Fonctionnalités par module

| Module | Fonctionnalités |
|---|---|
| **Finances** | Caisses de l'église et des structures ; recettes/dépenses catégorisées (« Autre / N.P. » avec description obligatoire) ; transferts ; clôtures mensuelles dans l'ordre ; réouverture (demande, cascade, délai réglable) ; validation par le pasteur (option) ; contre-passation ; pièces justificatives ; import Excel avec correspondance des colonnes ; rapports (résultat puis solde, caissiers, signatures) ; PDF, Excel, CSV |
| **Fidèles** | Fiche unique par personne (avec ou sans compte) ; tout inscrit est fidèle ; liste complète visible par tous, coordonnées réservées ; structures et postes du fidèle ; accès à l'application depuis la fiche |
| **Structures** | Création, désactivation, suppression ; membres et demandes d'adhésion (validées par le président ou le poste désigné) ; bureau aux postes libres, droits par poste, historique des titulaires ; caisse et catégories propres ; cotisations (unique, hebdomadaire, mensuelle, trimestrielle, annuelle), paiement réparti sur les échéances, recette créée automatiquement |
| **Activités** | Église ou structure ; à venir / en cours / terminées (réalisées, annulées, non tenues) ; responsables, destinataires, rappels configurables ; annulation tracée |
| **Messagerie** | Discussions privées, groupes, discussion de l'église, annonces, support ; accusés de réception et de lecture ; présence ; sélection multiple |
| **Notifications** | Centre de notifications + Firebase ; réglage par profil dans Droits d'accès ; l'administrateur de l'application reçoit tout |
| **Traçabilité** | Historique de toutes les actions (avant/après) ; corbeille et bandeau « Annuler » |
| **Comptes** | Inscription (église, structures), validations, multi-église pour les pasteurs, mot de passe oublié (code e-mail), mot de passe temporaire |
| **Configuration** | Assistant en 6 étapes, puis Paramètres de l'église ; droits d'accès par profil |

## 4. Droits d'accès

### Règles générales
- **Administrateur de l'application** : tous les droits, sur toutes les églises.
- **Pasteur** : configure l'église (caisses, catégories, utilisateurs, paramètres) même si ces cases ne sont pas cochées pour lui, et voit toutes les structures.
- **Responsables = fidèles** : un administrateur, pasteur ou gestionnaire a toujours au minimum les droits d'un fidèle.
- **Gestionnaire** : saisit uniquement dans les caisses qui lui sont attribuées.
- **Postes de structure** : un poste (président, trésorier…) ne donne que les droits cochés pour lui, dans sa structure seulement — jamais de droits sur l'église.
- Tout est réglable par église dans **Droits d'accès** (sauf l'administrateur de l'application).

### Matrice par profil (réglages par défaut)

| Droit | Admin. appli | Admin | Pasteur | Gestionnaire | Fidèle |
|---|:-:|:-:|:-:|:-:|:-:|
| **Finances — consultation** | | | | | |
| Voir les soldes et totaux des caisses | ✓ | ✓ | ✓ | ✓ | ✓ |
| Voir le détail des opérations | ✓ | ✓ | ✓ | ✓ | · |
| Voir les graphiques | ✓ | ✓ | ✓ | ✓ | ✓ |
| Consulter les rapports | ✓ | ✓ | ✓ | ✓ | · |
| Exporter, imprimer et partager | ✓ | ✓ | ✓ | ✓ | · |
| **Finances — gestion** | | | | | |
| Saisir des recettes et dépenses (caisses attribuées) | ✓ | · | · | ✓ | · |
| Saisir dans toutes les caisses | ✓ | · | · | · | · |
| Modifier une opération | ✓ | · | · | ✓ | · |
| Supprimer une opération | ✓ | · | · | ✓ | · |
| Faire des transferts entre caisses | ✓ | ✓ | · | ✓ | · |
| Clôturer un mois | ✓ | ✓ | · | ✓ | · |
| Rouvrir un mois clôturé | ✓ | ✓ | ✓ | · | · |
| Valider les opérations (si la validation est activée) | ✓ | · | ✓ | · | · |
| **Accueil et structures** | | | | | |
| Voir les données de toutes les structures (accueil, activités) | ✓ | · | ✓ | · | · |
| **Messagerie** | | | | | |
| Utiliser la messagerie (discussion de l'église) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Envoyer des messages privés | ✓ | ✓ | ✓ | ✓ | ✓ |
| Créer des groupes de discussion | ✓ | ✓ | ✓ | ✓ | · |
| Publier des annonces | ✓ | ✓ | ✓ | · | · |
| **Notifications reçues** | | | | | |
| Inscriptions et validations d'églises | ✓ | ✓ | ✓ | · | · |
| Demandes et validations d'adhésion | ✓ | ✓ | ✓ | · | · |
| Membres : ajouts, rôles, modifications | ✓ | ✓ | ✓ | · | · |
| Nouvelles recettes et dépenses | ✓ | ✓ | ✓ | ✓ | · |
| Modifications, suppressions et restaurations d'opérations | ✓ | ✓ | ✓ | ✓ | · |
| Imports Excel | ✓ | ✓ | ✓ | ✓ | · |
| Clôtures, réouvertures et demandes | ✓ | ✓ | ✓ | ✓ | · |
| Caisses, catégories, droits et paramètres | ✓ | ✓ | ✓ | · | · |
| Messages privés et groupes | ✓ | ✓ | ✓ | ✓ | ✓ |
| Annonces de l'église | ✓ | ✓ | ✓ | ✓ | ✓ |
| Activités : nouvelles, modifiées, annulées, rappels | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Administration** | | | | | |
| Gérer les caisses | ✓ | ✓ | ✓ | · | · |
| Gérer les catégories | ✓ | ✓ | ✓ | · | · |
| Gérer les utilisateurs et rôles | ✓ | ✓ | ✓ | · | · |
| Configurer les droits d'accès | ✓ | ✓ | · | · | · |
| Paramètres de l'église | ✓ | ✓ | ✓ | · | · |


### Droits portés par les postes de structure
Cochés poste par poste, valables uniquement dans la structure :
voir le détail des opérations de la caisse · gérer les membres et les informations · gérer le bureau · saisir dans la caisse · valider les opérations · gérer les cotisations · gérer les catégories · gérer les activités.
Proposés par défaut selon l'intitulé : *Président* (détail, membres, bureau, activités) ; *Secrétaire* (détail, membres, activités) ; *Trésorier* (détail, saisie, cotisations, catégories) ; *Adjoints et autres* (détail ou rien).

## 5. Principaux écrans par profil

| Profil | Barre du bas | Accueil | Écrans principaux |
|---|---|---|---|
| **Administrateur de l'application** | Accueil · Opérations · + · Messages · Rapports · Plus | Accueil complet de l'église consultée, raccourcis structures, toutes les structures | Tout, plus **Toutes les églises** (validation des églises et des pasteurs) |
| **Administrateur d'église** | Accueil · Opérations · Messages · Rapports · Plus | Solde, caisses, membres, graphiques, dernières opérations, raccourcis structures, prochaines activités, ses structures | Paramètres, assistant, caisses, catégories, utilisateurs, droits d'accès, historique, corbeille, clôtures, transferts, fidèles, structures, activités |
| **Pasteur** | Accueil · Opérations · Messages · Rapports · Plus | Comme l'administrateur + **toutes les structures** | Idem administrateur (sans droits d'accès), validation des opérations, réouverture des mois |
| **Gestionnaire** | Accueil · Opérations · + · Messages · Rapports · Plus | Accueil complet, ses structures | Saisie dans ses caisses, transferts, clôtures, demandes de réouverture, import Excel, rapports |
| **Fidèle membre d'une structure** | Accueil · Messages · Plus | **Ses structures d'abord** (caisse, cotisation due, activités, opérations selon le poste), puis activités et caisses de l'église | Fidèles, structures, activités, messagerie, profil (mes structures, rejoindre une structure) |
| **Fidèle avec un poste** (ex. trésorier JAD) | Accueil · + · Messages · Plus | Comme ci-dessus | En plus : saisie, cotisations, catégories, clôture de la caisse de sa structure ; bureau ou membres selon le poste |
| **Fidèle sans structure** | Accueil · Messages · Plus | **Activités de l'église d'abord**, invitation à rejoindre une structure, puis totaux de l'église | Fidèles, structures, activités, messagerie, profil |
| **Inscrit en attente** | — | Écran « adhésion en attente » | Aucun accès avant validation |

## 6. Constats de l'analyse

Les points ci-dessous sont suivis dans les Issues GitHub.

1. **Barre du bas des postes de structure** : un trésorier ou une secrétaire de structure (rôle fidèle) peut ouvrir Opérations et Rapports pour sa caisse, mais ces onglets n'apparaissent pas dans sa barre du bas (ils dépendent encore du droit général).
2. **Pasteur : rouvrir sans clôturer** : par défaut le pasteur peut rouvrir un mois mais pas le clôturer.
3. **Pasteur et droits d'accès** : le pasteur configure l'église mais ne peut pas modifier les droits d'accès.
4. **Coordonnées des fidèles** : masquées par l'application, mais transmises au téléphone par le serveur ; une protection stricte demanderait de séparer ces données.
5. **Tests automatiques** : la compilation automatique ne vérifie ni l'analyse statique ni les règles du serveur ; les ajouter éviterait des régressions.
6. **Conflits hors connexion** : deux modifications du même élément faites hors connexion sur deux téléphones → la dernière envoyée l'emporte (l'historique garde les deux).
