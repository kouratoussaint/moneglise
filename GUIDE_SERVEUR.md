# Mon Église — Mettre en place le serveur en ligne (gratuit)

Durée : environ 15 minutes. Outil : un ordinateur ou un téléphone avec internet.

## 1. Créer le projet Supabase
1. Allez sur https://supabase.com et créez un compte gratuit.
2. Cliquez sur « New project ». Nom : MonEglise. Choisissez un mot de passe de base de données (notez-le) et une région en Europe, la plus proche du Burkina Faso.
3. Attendez que le projet soit prêt (1 à 2 minutes).

## 2. Installer la base de données
1. Dans le menu de gauche, ouvrez « SQL Editor », puis « New query ».
2. Copiez tout le contenu du fichier supabase/schema.sql, collez-le, puis cliquez sur « Run ».
3. Le message « Success » doit s'afficher.

## 3. Simplifier les inscriptions (recommandé)
Menu « Authentication » › « Sign In / Providers » › « Email » : désactivez « Confirm email ».
Sinon, chaque personne devra cliquer sur un lien reçu par e-mail avant de se connecter, et l'envoi d'e-mails gratuit de Supabase est très limité.

## 4. Récupérer les deux informations de connexion
**L'adresse du projet (Project URL)**, de la forme https://xxxx.supabase.co. Trois façons de la trouver :
- sur la page d'accueil du projet (cliquez sur le nom du projet) ;
- ou avec le bouton « Connect » en haut de l'écran ;
- ou en la reconstituant : prenez l'identifiant du projet (Project Settings › General › Project ID, ou la suite de lettres après /project/ dans la barre d'adresse) et écrivez https://IDENTIFIANT.supabase.co

**La clé publique** : Project Settings › API Keys. Copiez la « Publishable key » (elle commence par sb_publishable_) ou, dans l'onglet « Legacy API keys », la clé « anon public ». Les deux fonctionnent.
Ne partagez jamais la clé « secret » ni « service_role ».

## 5. Raccorder l'application
Deux possibilités :
- Envoyez ces deux informations au développeur pour qu'il les intègre dans l'APK : personne n'aura rien à saisir (recommandé).
- Ou, sur chaque téléphone : page de connexion › « Mode démonstration · configurer le serveur » › collez l'adresse et la clé › « Tester et enregistrer ».

## 6. Premiers comptes
1. Le responsable crée son compte avec « Inscrire mon église » : il devient administrateur de l'église, et les 4 caisses de départ sont créées automatiquement.
2. Pour les gestionnaires, le pasteur, etc. : l'administrateur les ajoute dans « Utilisateurs et rôles » avec leur adresse e-mail, leur rôle et leurs caisses. Chacun crée ensuite son compte avec cette même adresse : il reçoit automatiquement son rôle.
3. Les fidèles s'inscrivent eux-mêmes avec « Rejoindre mon église ».
4. Super administrateur (gestion de plusieurs églises) : voir les deux dernières lignes du fichier schema.sql.

## Bon à savoir
- Chaque téléphone garde une copie des données : on peut saisir sans réseau, l'envoi se fait au retour de la connexion.
- Offre gratuite : un projet inutilisé pendant une semaine est mis en pause par Supabase. Il suffit de le réactiver depuis supabase.com.

---

# Messagerie et notifications Firebase

## 7. Mettre à jour le serveur pour la messagerie
1. Supabase › SQL Editor › New query : collez **tout** le fichier supabase/schema.sql (nouvelle version) et cliquez sur « Run ». Le script peut être relancé sans danger : vos données sont conservées.
2. Cela ajoute les règles de la messagerie (chacun ne lit que ses discussions) et active le temps réel.

Dès cette étape, la messagerie fonctionne : messages instantanés quand l'application est ouverte, accusés de réception et de lecture.

## 8. Firebase : être prévenu même application fermée (gratuit)

### A. Créer le projet Firebase
1. Allez sur https://console.firebase.google.com avec un compte Google, puis « Créer un projet » (nom : Mon Eglise). Google Analytics n'est pas nécessaire.
2. Sur la page du projet, cliquez sur l'icône Android pour ajouter une application.
3. Nom du package : **app.eglise360.mobile** (exactement), surnom : Mon Église. Cliquez sur « Enregistrer l'application ».
4. Téléchargez le fichier **google-services.json** et envoyez-le au développeur : il l'intègre dans l'APK. Les étapes suivantes de l'assistant Firebase (SDK) peuvent être ignorées.

### B. Clé du compte de service (à garder secrète)
**Chemin principal (Firebase)**
1. Dans la console Firebase, cliquez sur la roue dentée à côté de « Vue d'ensemble du projet », puis « Paramètres du projet ».
2. Ouvrez l'onglet **« Comptes de service »** (4e onglet en haut, après Général, Cloud Messaging, Intégrations…).
3. La section « SDK Admin Firebase » s'affiche : descendez **en bas de cette section** et cliquez sur **« Générer une nouvelle clé privée »**, puis « Générer la clé ». Un fichier JSON est téléchargé.

**Si le bouton n'apparaît pas ou disparaît (chemin de secours, Google Cloud)**
1. Toujours dans l'onglet « Comptes de service », cliquez sur le lien « Gérer les autorisations des comptes de service » (ou allez sur https://console.cloud.google.com/iam-admin/serviceaccounts et choisissez votre projet).
2. Cliquez sur le compte dont le nom commence par **firebase-adminsdk-**.
3. Onglet **« Clés »** › « Ajouter une clé » › « Créer une clé » › format **JSON** › « Créer ». Le fichier JSON est téléchargé.

Si Google affiche un message indiquant que la création de clés est désactivée par une règle d'organisation, le projet a été créé avec un compte professionnel (Google Workspace) : recréez le projet Firebase avec un compte Gmail personnel, ou demandez à l'administrateur du compte de lever la règle « Disable service account key creation ».

Ne communiquez ce fichier à personne : il se colle uniquement dans Supabase (étape C).

### C. Installer la fonction d'envoi dans Supabase
1. Supabase › Edge Functions › Secrets : ajoutez un secret nommé **FIREBASE_SERVICE_ACCOUNT** et collez comme valeur tout le contenu du fichier JSON de l'étape B.
2. Supabase › Edge Functions › « Deploy a new function » › « Via Editor ». Nom : **notifier**. Remplacez le code d'exemple par le contenu du fichier supabase/functions/notifier/index.ts, puis « Deploy ».
3. Supabase › Database › Webhooks (ou Integrations › Database Webhooks ; activez-les si demandé) › « Create a new hook » :
   - Nom : notifier
   - Table : enregistrements
   - Événements : **Insert** uniquement
   - Type : Supabase Edge Functions › notifier (méthode POST)
   - Gardez l'en-tête d'autorisation avec la clé de service proposé par Supabase
   - « Create webhook »

### D. Vérifier
Installez l'APK qui contient google-services.json, connectez-vous et acceptez les notifications. Fermez complètement l'application, puis envoyez-lui un message depuis un autre téléphone : la notification doit apparaître. Toucher la notification ouvre directement la discussion.

En cas de problème : Supabase › Edge Functions › notifier › Logs affiche le détail de chaque envoi.


---

# Mise à jour : validations, plusieurs églises, configuration

## 9. Mettre à jour le serveur (obligatoire avec cette version)
1. Supabase › SQL Editor : collez **tout** le nouveau fichier supabase/schema.sql et cliquez sur « Run ». Vos données sont conservées.
2. Supabase › Edge Functions › notifier : remplacez le code par le nouveau fichier supabase/functions/notifier/index.ts et redéployez (« Deploy »).

Ce que cela apporte :
- une nouvelle église reste **en attente** jusqu'à la validation du super administrateur (Menu › Toutes les églises), qui reçoit une notification ;
- un fidèle qui rejoint une église reste **en attente** jusqu'à la validation de l'administrateur (Menu › Utilisateurs et rôles), qui reçoit une notification ;
- seuls les **pasteurs** peuvent appartenir à plusieurs églises : un pasteur demande à rejoindre une autre église (ou en inscrit une nouvelle) depuis « Mes églises », et c'est le **super administrateur** qui valide ; l'administrateur d'une église peut aussi l'ajouter directement avec la même adresse e-mail ;
- seuls les administrateurs et les pasteurs configurent l'église (le super administrateur a tous les droits) ;
- le statut de présence (« en ligne », « vu il y a… ») s'affiche dans la messagerie ;
- le super administrateur peut écrire à n'importe quel membre de n'importe quelle église.

Les églises et membres déjà présents restent actifs : rien à valider pour eux.


---

# Mise à jour : traçabilité, corbeille, notifications par profil

## 10. Mettre à jour le serveur
1. Supabase › SQL Editor : collez **tout** le nouveau supabase/schema.sql et cliquez sur « Run » (données conservées).
2. Supabase › Edge Functions › notifier : remplacez le code par le nouveau supabase/functions/notifier/index.ts et redéployez.
3. Vérifiez que le webhook « notifier » (Database › Webhooks) est bien déclenché sur **Insert** de la table enregistrements : c'est lui qui transforme chaque action enregistrée dans l'historique en notification.

Ce que cela apporte :
- **Historique** : chaque action (ajout, modification, suppression, validation, clôture, import…) est enregistrée avec son auteur, la date et l'heure. Consultation : Menu › Historique (administrateurs, pasteurs, super administrateur).
- **Corbeille** : les opérations, caisses et catégories supprimées peuvent être restaurées (Menu › Corbeille).
- **Notifications par profil** : Menu › Droits d'accès › « Notifications reçues ». Le super administrateur reçoit tout.
- Un espace de stockage privé « pieces » est préparé pour les pièces justificatives.


---

# Mise à jour : validation, réouverture, pièces, récupération de compte

## 11. Serveur
1. Supabase › SQL Editor : relancez **tout** supabase/schema.sql (petite mise à jour pour la validation des opérations par le pasteur ; données conservées).
2. Vérifiez dans Supabase › Storage qu'un espace **pieces** (privé) existe. S'il n'apparaît pas, créez-le : « New bucket », nom `pieces`, **Public désactivé**, puis relancez schema.sql pour ses règles d'accès.

## 12. Mot de passe oublié (code par e-mail)
1. Supabase › Authentication › Emails (ou Email Templates) › **Reset Password** : remplacez le contenu par exemple par :
   `Votre code Mon Église : {{ .Token }}` (le code à 6 chiffres que l'utilisateur saisit dans l'application).
2. Recommandé : Supabase › Authentication › SMTP Settings : branchez un service d'envoi gratuit (par exemple Brevo, 300 e-mails par jour) ; l'envoi intégré de Supabase est très limité.

## 13. Mot de passe temporaire donné par l'administrateur
1. Supabase › Edge Functions › « Deploy a new function » › « Via Editor » : nom **compte**, collez le contenu de supabase/functions/compte/index.ts, puis « Deploy ».
2. Rien d'autre à configurer : l'administrateur ou le pasteur ouvre la fiche du membre (Utilisateurs et rôles) › « Donner un mot de passe temporaire ». Le membre devra choisir son propre mot de passe à la connexion suivante.


---

# Livraison 1 des nouveaux modules : fidèles, structures, bureaux

## 14. Mettre à jour le serveur
Supabase › SQL Editor : relancez **tout** supabase/schema.sql (données conservées).

Ce que fait cette mise à jour :
- crée automatiquement une **fiche de fidèle** pour chaque compte existant (une seule fois, sans doublon), puis pour chaque nouveau compte ;
- ajoute les règles de sécurité des fidèles, des appartenances aux structures et des bureaux :
  - les responsables de l'église voient et gèrent tous les fidèles ;
  - un fidèle voit sa fiche et les membres de ses structures ;
  - un poste du bureau (président, secrétaire…) ne donne que les droits cochés pour lui, dans sa structure uniquement.


---

# Livraison 2 : caisses des structures, cotisations, adhésions aux structures

## 15. Mettre à jour le serveur
1. Supabase › SQL Editor : relancez **tout** supabase/schema.sql (données conservées).
2. Supabase › Edge Functions › notifier : remplacez le code par le nouveau supabase/functions/notifier/index.ts et redéployez (notification du président quand un fidèle demande à rejoindre sa structure).

Ce que cela apporte :
- chaque structure peut avoir **sa propre caisse** : seul le poste autorisé de cette structure (trésorier…) y saisit ; les membres voient le solde et les totaux (ou le détail si la structure le permet) ;
- les **cotisations** et leurs paiements : chaque paiement crée la recette correspondante dans la caisse de la structure ;
- à l'inscription, le fidèle choisit ses **structures** : l'administrateur valide son adhésion à l'église, le président (ou le poste chargé des membres) valide son adhésion à chaque structure ;
- une catégorie déjà utilisée n'est plus supprimée mais **désactivée**.


---

# Livraison 3 : activités, rappels, accueil selon le profil

## 16. Activer la tâche planifiée (rappels et activités terminées)
1. Supabase › Database › Extensions (ou Integrations › Cron) : activez l'extension **pg_cron**.
2. Supabase › SQL Editor : relancez **tout** supabase/schema.sql (données conservées). Le script programme la tâche « e360-rappels », exécutée toutes les 15 minutes.
3. Vérification : Supabase › Integrations › Cron › Jobs doit afficher **e360-rappels**. Vous pouvez aussi lancer `select public.e360_rappels_activites();` dans SQL Editor : le résultat est le nombre de rappels envoyés.

## 17. Mettre à jour la fonction de notifications
Supabase › Edge Functions › notifier : remplacez le code par le nouveau supabase/functions/notifier/index.ts et redéployez. Elle envoie désormais :
- les notifications de **nouvelle activité**, de **changement de date, d'heure ou de lieu**, et d'**annulation**, aux personnes concernées (membres de la structure, toute l'église ou une liste) ;
- les **rappels** préparés par la tâche planifiée (la veille, 2 heures avant… selon l'activité).


---

# Audit et corrections

## 18. Mettre à jour le serveur
Supabase › SQL Editor : relancez **tout** supabase/schema.sql (données conservées). Corrections incluses :
- un transfert vers ou depuis la caisse d'une structure n'est permis qu'aux responsables de l'église (séparation stricte des caisses) ;
- le trésorier d'une structure peut clôturer les mois de sa propre caisse.

---

# Décisions #1 et #2

## 19. Mettre à jour le serveur
Supabase › SQL Editor : relancez **tout** supabase/schema.sql (données conservées).
- **#1** : tout membre de l'église voit la liste complète des fidèles. Les coordonnées (téléphone, adresse, e-mail, date de naissance, informations) restent affichées seulement aux responsables, aux postes chargés des membres et à la personne elle-même.
- **#2** : l'administrateur reçoit le droit « Transférer » dans chaque église existante. Ce réglage n'est appliqué qu'une fois : si vous le retirez ensuite dans Droits d'accès, il ne sera pas rétabli.

## 20. Décisions #9 et #10, historique des fidèles
Supabase › SQL Editor : relancez **tout** supabase/schema.sql (données conservées).
- **#9** : le pasteur ne rouvre plus les mois clôturés (retiré une seule fois dans chaque église ; réglable ensuite dans Droits d'accès).
- **#10** : seul l'administrateur (droit « Configurer les droits d'accès ») peut modifier les droits, y compris via l'assistant.
- **Correction** : les actions des fidèles (demandes d'adhésion, paiements saisis par un trésorier de structure, activités d'un président…) sont de nouveau acceptées dans l'historique.
