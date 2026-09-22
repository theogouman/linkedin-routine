# Feature Specification: Inbox d'engagement LinkedIn

**Feature Branch**: `001-linkedin-engagement-inbox`

**Created**: 2026-09-22

**Status**: Implémentée — cf. `docs/ARCHITECTURE.md`

**Input**: User description: "Application mobile-first (PWA iOS) qui remplace le fil natif LinkedIn pour deux routines d'engagement quotidiennes : commenter les publications d'une liste curée de créateurs, et répondre aux commentaires reçus sur ses propres posts. Listes de comptes curées, fil non algorithmique, commentaire depuis l'app, génération IA selon un process fourni, traitement en mode inbox."

## Contexte & Problème

Le fil natif LinkedIn est algorithmique et bruyant. Deux conséquences pour un utilisateur qui fait de l'engagement une routine commerciale quotidienne :

1. **Aucune garantie d'exhaustivité** — rien n'assure de voir toutes les publications des comptes qui comptent réellement ; un post manqué est une opportunité de visibilité perdue, sans moyen de le savoir.
2. **Coût attentionnel** — chaque ouverture de LinkedIn expose à un fil conçu pour retenir, alors que la session visée dure quelques minutes.

L'objectif est d'isoler ces deux routines dans un espace dédié où la file d'éléments à traiter est **finie, ordonnée et vidable** — une inbox, pas un fil infini.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Curer les comptes à suivre (Priority: P1)

L'utilisateur constitue une ou plusieurs listes de comptes LinkedIn (par exemple « Créateurs B2B », « Prospects », « Pairs »). Il ajoute un profil en collant l'URL de son profil LinkedIn, unitairement ou en masse, retire un compte devenu non pertinent, renomme ou supprime une liste. C'est la définition de son périmètre d'attention : ce qui n'est pas dans une liste n'apparaîtra jamais dans l'app.

**Why this priority**: Aucune autre fonctionnalité n'a de sens sans périmètre défini. C'est la première chose qu'un nouvel utilisateur fait, et la seule qui n'a aucune dépendance.

**Independent Test**: Créer une liste, y coller 20 URLs de profils, en retirer 2, renommer la liste, la rouvrir après fermeture de l'app — la composition doit être exacte et persistante. Livre déjà de la valeur : la liste curée est un actif en soi.

**Acceptance Scenarios**:

1. **Given** aucune liste existante, **When** l'utilisateur crée une liste nommée « Créateurs B2B », **Then** elle apparaît vide et sélectionnable dans le filtre du fil.
2. **Given** une liste existante, **When** l'utilisateur colle 30 URLs de profils en une fois, **Then** les 30 comptes sont ajoutés avec leur nom et leur photo, et les doublons (déjà présents dans la liste ou répétés dans le collage) sont ignorés sans erreur.
3. **Given** une URL de profil syntaxiquement invalide dans un collage en masse, **When** l'utilisateur valide, **Then** les entrées valides sont ajoutées et les entrées rejetées sont listées explicitement avec leur motif.
4. **Given** un compte dont les publications ne sont pas récupérables (profil restreint), **When** l'utilisateur consulte la liste, **Then** ce compte porte un marqueur visuel distinctif indiquant qu'aucune publication ne remontera de lui.
5. **Given** une liste contenant des comptes, **When** l'utilisateur supprime la liste, **Then** les publications déjà récupérées restent en base et ne sont plus visibles dans le fil filtré sur cette liste.

---

### User Story 2 - Consulter un fil exhaustif et non algorithmique (Priority: P1)

L'utilisateur ouvre l'app sur son téléphone. Elle se met à jour et affiche uniquement les publications originales des membres de ses listes, de la plus récente à la plus ancienne, sans recommandation, sans suggestion, sans contenu sponsorisé. Il peut filtrer par liste. Chaque publication affiche son texte complet et son média quand il est restituable ; sinon un lien d'ouverture directe dans LinkedIn.

**Why this priority**: C'est la promesse centrale — l'exhaustivité que le fil natif ne donne pas. Combinée à US1, elle constitue déjà un produit utilisable : l'utilisateur voit tout, et clique vers LinkedIn pour agir.

**Independent Test**: Suivre 10 comptes actifs, relever manuellement leurs publications sur 48 h depuis LinkedIn, comparer au fil de l'app — aucune publication originale ne doit manquer, aucun repost ne doit apparaître.

**Acceptance Scenarios**:

1. **Given** des listes peuplées, **When** l'utilisateur ouvre l'app, **Then** une actualisation se déclenche et le fil affiche les publications par ordre antichronologique strict.
2. **Given** un compte suivi qui a partagé le post d'un tiers, **When** le fil s'actualise, **Then** ce repost n'apparaît pas dans le fil.
3. **Given** une publication contenant une vidéo ou un carrousel document non restituable, **When** l'utilisateur l'affiche, **Then** le texte est affiché intégralement et le média est remplacé par un lien d'ouverture de la publication dans LinkedIn.
4. **Given** une actualisation précédente horodatée, **When** l'utilisateur déclenche une nouvelle actualisation, **Then** seules les publications parues depuis ce curseur sont récupérées, et aucune publication déjà connue n'est re-facturée ni dupliquée.
5. **Given** l'utilisateur est hors connexion, **When** il ouvre l'app, **Then** le dernier état synchronisé reste consultable en lecture et toute action d'écriture est indisponible avec un message explicite.
6. **Given** plusieurs listes, **When** l'utilisateur filtre sur l'une d'elles, **Then** seules les publications de ses membres sont affichées.

---

### User Story 3 - Commenter une publication depuis l'app (Priority: P2)

Depuis une publication du fil, l'utilisateur rédige un commentaire — texte, éventuellement une image ou un GIF — et le valide. Le commentaire part sur LinkedIn sous cette publication, au nom de son compte. L'utilisateur n'a jamais eu besoin d'ouvrir LinkedIn.

**Why this priority**: Transforme l'app de lecteur en outil de routine. Dépend de US2 mais reste testable seule dès qu'une publication est disponible.

**Independent Test**: Rédiger un commentaire sur une publication du fil, le valider, vérifier sur LinkedIn qu'il apparaît sous le bon post, au bon nom, avec le bon contenu.

**Acceptance Scenarios**:

1. **Given** une publication affichée, **When** l'utilisateur saisit un texte et valide, **Then** le commentaire entre dans la file d'envoi avec un état « en attente » et une heure d'envoi estimée.
2. **Given** un commentaire en attente dans la file, **When** l'utilisateur l'annule avant son envoi, **Then** il est retiré de la file et rien n'est publié sur LinkedIn.
3. **Given** un commentaire envoyé avec succès, **When** l'utilisateur revient sur la publication, **Then** elle est marquée comme traitée et le commentaire figure au journal des actions.
4. **Given** l'utilisateur joint une image ou un GIF, **When** le commentaire est envoyé, **Then** le média apparaît avec le commentaire sur LinkedIn.
5. **Given** la publication cible a été supprimée sur LinkedIn entre la mise en file et l'envoi, **When** l'envoi est tenté, **Then** l'élément passe en échec avec un motif explicite, sans bloquer le reste de la file.

---

### User Story 4 - Protéger le compte LinkedIn (Priority: P2)

Toute action d'écriture passe par une file d'attente qui impose un rythme humain : plafonds journaliers, délais aléatoires entre deux envois, fenêtre diurne. L'utilisateur voit à tout moment ce qui est en attente et peut annuler. Si un signal de restriction apparaît, la file se suspend d'elle-même et ne reprend que sur décision explicite de l'utilisateur.

**Why this priority**: Le compte protégé compte ~11 000 abonnés et sert commercialement ; une restriction coûterait infiniment plus que le gain de l'app. Ce garde-fou conditionne toute écriture (US3, US6, US7) et doit exister avant elles, mais se teste indépendamment via la file.

**Independent Test**: Empiler plus d'actions que le plafond journalier, observer que les envois s'étalent selon la cadence configurée, que le surplus est reporté, et que l'injection d'un signal de restriction simulé suspend immédiatement la file.

**Acceptance Scenarios**:

1. **Given** le plafond journalier de commentaires est atteint, **When** l'utilisateur valide un commentaire supplémentaire, **Then** il est accepté en file mais programmé pour le jour ouvré suivant, et l'utilisateur en est informé au moment de la validation.
2. **Given** deux actions consécutives en file, **When** elles s'envoient, **Then** l'intervalle réel entre les deux est un délai aléatoire compris dans la plage configurée.
3. **Given** l'heure courante est hors de la fenêtre diurne configurée, ou un jour désactivé, **When** la file est évaluée, **Then** aucun envoi n'a lieu et les éléments restent en attente jusqu'à la prochaine fenêtre.
4. **Given** un signal de restriction (erreur de type 429/500 du fournisseur d'écriture, checkpoint 2FA/OTP/CAPTCHA, validation in-app, expiration de session, demande de vérification d'identité), **When** il est détecté, **Then** la file est suspendue, aucun envoi supplémentaire n'a lieu, et l'utilisateur est alerté avec le motif.
5. **Given** une file suspendue par le coupe-circuit, **When** l'utilisateur tente de la reprendre avant 72 h, **Then** la reprise est refusée avec le délai restant ; après 72 h, la reprise manuelle redémarre à environ 30 % des plafonds antérieurs puis les remonte progressivement.
6. **Given** un démarrage à froid (premières semaines d'usage), **When** les plafonds sont calculés, **Then** ils valent environ la moitié du régime de croisière pendant deux semaines, puis augmentent de 10 à 20 % par semaine en l'absence de signal d'alerte.

---

### User Story 5 - Traiter le fil comme une inbox (Priority: P2)

Chaque publication et chaque commentaire reçu porte un statut traité / non traité. La session d'engagement consiste à vider la file : l'utilisateur voit combien d'éléments restent, les traite un à un — en commentant, en répondant, ou en marquant « ignorer » — et la file atteint zéro.

**Why this priority**: C'est le mécanisme qui rend la session bornée et son exhaustivité vérifiable. Sans lui, l'app redevient un fil qu'on parcourt sans savoir où l'on s'est arrêté.

**Independent Test**: Partir d'une file de 20 éléments non traités, en traiter 12 (7 commentés, 5 ignorés), fermer et rouvrir l'app — le compteur doit indiquer exactement 8 restants, et les 12 traités ne doivent pas réapparaître.

**Acceptance Scenarios**:

1. **Given** une publication non traitée, **When** un commentaire est effectivement publié dessus, **Then** elle bascule en traitée.
2. **Given** une publication non traitée sur laquelle l'utilisateur ne souhaite pas intervenir, **When** il la marque « ignorer », **Then** elle bascule en traitée sans qu'aucune action ne parte sur LinkedIn.
3. **Given** des éléments traités et non traités, **When** l'utilisateur ouvre l'app, **Then** le nombre d'éléments non traités est visible immédiatement et le tri met les non traités en tête.
4. **Given** un élément traité, **When** l'utilisateur consulte l'app plus tard, **Then** il reste accessible en consultation mais n'est plus compté dans la file à traiter.
5. **Given** un commentaire en file d'attente non encore envoyé, **When** l'utilisateur consulte la publication cible, **Then** son état reflète l'envoi en attente et se distingue d'un traitement abouti.

---

### User Story 6 - Traiter les commentaires reçus sur ses publications (Priority: P3)

L'utilisateur voit, dans la même logique d'inbox, les commentaires reçus sur ses propres publications des 30 derniers jours — y compris les réponses aux réponses, à tous les niveaux d'imbrication — et y répond depuis l'app.

**Why this priority**: Deuxième routine du brief, aussi structurante que la première, mais indépendante : elle peut être livrée après le fil sortant sans le remettre en cause.

**Independent Test**: Provoquer des commentaires et des réponses imbriquées sur une publication récente de l'utilisateur, vérifier qu'ils remontent tous dans la file, y répondre depuis l'app et vérifier l'apparition de la réponse au bon niveau d'imbrication sur LinkedIn.

**Acceptance Scenarios**:

1. **Given** des commentaires reçus sur les publications de l'utilisateur des 30 derniers jours, **When** l'app s'actualise, **Then** tous apparaissent en file de traitement, à tous les niveaux d'imbrication, avec leur auteur, leur texte et leur date.
2. **Given** un commentaire reçu, **When** l'utilisateur y répond, **Then** la réponse est publiée en réponse à ce commentaire précis et non à la publication.
3. **Given** un commentaire reçu sur une publication vieille de plus de 30 jours, **When** l'app s'actualise, **Then** il n'entre pas dans la file (fenêtre glissante) et les commentaires déjà récupérés restent consultables.
4. **Given** un commentaire reçu déjà traité, **When** une nouvelle actualisation a lieu, **Then** il ne réapparaît pas comme non traité.
5. **Given** un commentaire supprimé sur LinkedIn après récupération, **When** l'utilisateur tente d'y répondre, **Then** l'échec est signalé avec un motif explicite.

---

### User Story 7 - Générer un commentaire assisté par IA (Priority: P3)

Sur une publication du fil comme sur un commentaire reçu, un bouton « Générer » produit une proposition de commentaire rédigée selon un process défini par l'utilisateur — un process pour les commentaires chez les autres, un autre pour les réponses chez soi. La proposition arrive dans le champ de saisie, éditable. Rien ne part sans validation manuelle.

**Why this priority**: Accélérateur de la routine, pas sa condition. La routine fonctionne sans IA ; l'IA la rend rapide.

**Independent Test**: Sur une publication, cliquer « Générer », vérifier que la proposition respecte les règles du fichier de process correspondant, l'éditer, la publier — et vérifier qu'aucune proposition ne peut partir sans passage par la validation.

**Acceptance Scenarios**:

1. **Given** une publication du fil, **When** l'utilisateur clique « Générer », **Then** une proposition apparaît dans le champ de saisie, entièrement modifiable, et rien n'est publié.
2. **Given** un commentaire reçu sur une publication de l'utilisateur, **When** il clique « Générer », **Then** la proposition est produite selon le process « réponse » et non le process « commentaire chez un tiers ».
3. **Given** un fichier de process modifié dans le dépôt, **When** une génération suivante a lieu, **Then** elle suit les règles mises à jour sans intervention sur le reste de l'app.
4. **Given** une génération en échec (service indisponible), **When** l'utilisateur clique « Générer », **Then** l'échec est signalé et le champ de saisie reste utilisable pour une rédaction manuelle.
5. **Given** un commentaire publié, **When** l'utilisateur consulte le journal, **Then** son origine (manuel ou IA éditée) y figure.

---

### User Story 8 - Liker depuis l'app (Priority: P4)

L'utilisateur peut liker une publication du fil ou un commentaire reçu sans quitter l'app.

**Why this priority**: Complément à faible effort de la routine, sans lequel l'app reste pleinement utilisable.

**Independent Test**: Liker une publication depuis l'app, vérifier sur LinkedIn que la réaction est enregistrée au nom du compte de l'utilisateur, et qu'elle est décomptée du plafond de likes.

**Acceptance Scenarios**:

1. **Given** une publication du fil, **When** l'utilisateur la like, **Then** l'action entre dans la file d'envoi sous les mêmes plafonds et cadences que les commentaires.
2. **Given** le plafond journalier de likes est atteint, **When** l'utilisateur like encore, **Then** l'action est reportée et l'utilisateur en est informé.
3. **Given** un like déjà émis sur une publication, **When** l'utilisateur revient dessus, **Then** l'état liké est visible et l'action n'est pas doublonnée.

---

### User Story 9 - Être notifié des nouveaux éléments à traiter (Priority: P4)

Quand de nouveaux éléments non traités existent — publications des listes ou commentaires reçus — l'utilisateur reçoit une notification push sur son téléphone.

**Why this priority**: Confort de déclenchement de la routine. L'app reste utilisable en ouverture volontaire.

**Independent Test**: Provoquer une nouvelle publication chez un compte suivi, attendre la vérification serveur suivante, vérifier la réception de la notification et son atterrissage sur la file concernée.

**Acceptance Scenarios**:

1. **Given** de nouveaux éléments non traités détectés lors d'une vérification serveur, **When** la vérification se termine, **Then** une notification push est envoyée indiquant le nombre d'éléments par file.
2. **Given** aucun nouvel élément non traité, **When** la vérification serveur a lieu, **Then** aucune notification n'est envoyée.
3. **Given** l'utilisateur ouvre l'app depuis la notification, **When** l'app se charge, **Then** elle ouvre la file concernée.
4. **Given** la fréquence de vérification configurée, **When** l'utilisateur la modifie, **Then** les vérifications suivantes suivent la nouvelle fréquence.

---

### User Story 10 - Consulter le journal des actions émises (Priority: P4)

L'utilisateur consulte l'historique de tout ce qui est parti depuis l'app : commentaires, réponses, likes, avec la cible, la date et l'origine (manuel ou IA éditée).

**Why this priority**: Traçabilité et mémoire de ce qui a déjà été dit à qui — utile, mais postérieur à la routine elle-même.

**Independent Test**: Émettre cinq actions de natures différentes, ouvrir le journal, vérifier que les cinq y figurent avec cible, date, texte et origine exacts.

**Acceptance Scenarios**:

1. **Given** des actions émises depuis l'app, **When** l'utilisateur ouvre le journal, **Then** il les voit par ordre antichronologique avec texte, publication cible, date et origine.
2. **Given** une entrée du journal, **When** l'utilisateur l'ouvre, **Then** un lien permet d'ouvrir la publication ou le commentaire cible dans LinkedIn.
3. **Given** une action en échec, **When** l'utilisateur consulte le journal, **Then** l'échec et son motif y figurent.

---

### Edge Cases

**Récupération**

- Un compte suivi passe en profil restreint après son ajout : il est marqué visuellement, la récupération cesse de le tenter à chaque cycle, et ses publications déjà récupérées restent en base.
- L'utilisateur n'ouvre pas l'app pendant trois semaines : l'actualisation suivante récupère tout depuis le curseur, sans fenêtre fixe ; la file peut être volumineuse et doit rester navigable.
- Le fournisseur de récupération est indisponible ou son quota est épuisé : l'app affiche le dernier état connu, signale l'échec d'actualisation, et le curseur n'avance pas (aucune perte silencieuse de contenu).
- Une même publication remonte par deux chemins de récupération : elle n'apparaît qu'une fois dans le fil.
- Une publication est modifiée sur LinkedIn après récupération : le contenu stocké peut différer ; le lien d'ouverture reste la source de vérité.

**Écriture**

- Le plafond est atteint en cours de session : l'utilisateur continue à préparer des actions, qui sont programmées au jour suivant plutôt que refusées.
- La session du compte connecté expire : coupe-circuit, file suspendue, alerte, reprise manuelle après reconnexion.
- Deux actions visent la même publication (like + commentaire) : chacune est décomptée de son propre plafond et du plafond global d'actions d'écriture.
- L'app est fermée alors que des éléments sont en file : la file est serveur, les envois se poursuivent selon le calendrier prévu.

**État & interface**

- Le même élément est traité depuis deux appareils : le dernier état synchronisé fait foi, sans double envoi.
- Hors connexion : lecture du dernier état possible, toute écriture bloquée avec message explicite ; aucune action n'est perdue ni envoyée deux fois au retour de la connexion.
- Une publication du fil est supprimée sur LinkedIn : elle reste consultable dans l'app, son lien signale l'indisponibilité à l'ouverture.

## Requirements *(mandatory)*

### Functional Requirements

**Curation**

- **FR-001** : L'utilisateur MUST pouvoir créer, renommer et supprimer des listes de comptes LinkedIn.
- **FR-002** : L'utilisateur MUST pouvoir ajouter un compte à une liste via l'URL de son profil LinkedIn — unitairement ou en masse par collage d'une liste d'URLs — et l'en retirer. Le système MUST signaler visuellement, dans la liste, tout compte dont les publications s'avèrent non récupérables (profil restreint).

**Récupération**

- **FR-003** : La récupération des publications MUST être incrémentale : à chaque actualisation, le système ne récupère que les contenus publiés depuis la date de la dernière actualisation (curseur horodaté), jamais une fenêtre fixe. Tout contenu récupéré MUST être conservé en base de façon permanente. L'actualisation MUST être déclenchée à l'ouverture de l'app et par un bouton manuel, sans aucune synchronisation périodique en arrière-plan hormis la vérification de FR-014. À l'ajout d'un compte jamais suivi, le premier passage MUST remonter les **7 derniers jours** (paramétrable, `INITIAL_BACKFILL_DAYS`) : assez pour que le fil ne soit pas vide à l'ajout, assez court pour que l'amorçage de 100+ comptes reste marginal en coût. Après une longue absence, la profondeur demandée MUST être plafonnée (`MAX_LOOKBACK_DAYS`, 90 jours par défaut) et la troncature MUST être signalée.
- **FR-008** : Le système MUST récupérer les commentaires reçus sur les publications de l'utilisateur des 30 derniers jours (fenêtre glissante), de manière incrémentale selon les mêmes règles que FR-003, à tous les niveaux d'imbrication (réponses aux réponses incluses), et les présenter en file de traitement.
- **FR-020** : Le système MUST rendre la couche de récupération interchangeable derrière une interface unique, de sorte qu'un fournisseur défaillant ou disparu puisse être remplacé sans modification du reste de l'application.
- **FR-021** : Le système MUST ne jamais utiliser le compte LinkedIn de l'utilisateur pour la récupération de contenu ; la lecture et l'écriture MUST rester strictement séparées.
- **FR-022** : En cas d'échec d'une actualisation, le système MUST ne pas avancer le curseur horodaté et MUST signaler l'échec à l'utilisateur, afin qu'aucun contenu ne soit silencieusement manqué.

**Fil**

- **FR-004** : Le fil MUST afficher les publications par ordre antichronologique, filtrable par liste, avec le contenu complet du post (texte, média si disponible). Seuls les posts originaux MUST être affichés — les reposts effectués par les comptes suivis MUST être exclus. Chaque publication et chaque commentaire MUST comporter un lien d'ouverture directe dans LinkedIn ; un média non restituable (vidéo, carrousel document) MUST être remplacé par ce lien.

**Écriture**

- **FR-005** : L'utilisateur MUST pouvoir rédiger et publier un commentaire — texte, avec possibilité de joindre une image ou un GIF — sur toute publication du fil ; le commentaire MUST être publié sur LinkedIn au nom de son compte.
- **FR-009** : L'utilisateur MUST pouvoir répondre à chaque commentaire reçu depuis l'app, avec la même génération IA que FR-006.
- **FR-013** : L'utilisateur MUST pouvoir liker une publication du fil et un commentaire reçu depuis l'app. Les reposts restent hors périmètre.
- **FR-017** : Toute action d'écriture (commentaire, réponse, like) MUST passer par une file d'attente de publication appliquant : des plafonds journaliers configurables — régime de croisière 25 commentaires/réponses, 60 likes, 90 actions d'écriture par jour au maximum ; un démarrage à environ 50 % de ces plafonds pendant 2 semaines, puis une montée de 10 à 20 % par semaine en l'absence de signal d'alerte ; un délai aléatoire de 3 à 12 minutes entre deux envois ; jamais plus de 3 à 4 commentaires par heure ; une fenêtre diurne configurable (8 h–19 h avec creux méridien, aucun envoi nocturne ni le week-end par défaut). La file MUST être visible par l'utilisateur, avec ses éléments en attente et la possibilité de les annuler.
- **FR-018** : Le système MUST suspendre automatiquement la file et alerter l'utilisateur dès détection d'un signal de restriction (erreur 429/500 du fournisseur d'écriture, checkpoint 2FA/OTP/CAPTCHA/validation in-app, expiration de session, demande de vérification d'identité). La reprise MUST être exclusivement manuelle, refusée avant 72 h, et reprendre à environ 30 % du volume antérieur avant re-montée progressive.

**Génération IA**

- **FR-006** : Chaque publication MUST proposer un bouton « Générer un commentaire » produisant une proposition insérée dans le champ de saisie, éditable avant publication. Aucun commentaire MUST être publié sans validation manuelle.
- **FR-007** : Le système MUST charger deux process de génération distincts — un pour le commentaire sur un post d'autrui, un pour la réponse à un commentaire reçu — définis chacun dans un fichier `.md` versionné dans le dépôt (ton, structure, règles, exemples). Les deux fichiers MUST être créés en placeholder au build, et l'app MUST signaler visuellement qu'un process n'a pas encore été rédigé — dans les réglages et au moment de chaque génération. Le contenu rédactionnel reste à fournir par l'utilisateur ; il n'est pas bloquant, le chargeur relit les fichiers à chaque génération.
- **FR-019** : La génération IA MUST utiliser une clé d'API dédiée pour un modèle configurable. Le jeton d'abonnement Claude (OAuth Claude Code / claude.ai) MUST NOT être utilisé : son emploi hors des applications officielles viole les conditions d'utilisation d'Anthropic et exposerait le compte.

**Traitement & traçabilité**

- **FR-010** : Chaque publication du fil et chaque commentaire reçu MUST porter un statut traité / non traité. Le traitement — commentaire publié, réponse envoyée, ou marquage manuel « ignorer » — MUST faire passer l'élément en traité.
- **FR-016** : Le système MUST conserver un journal consultable de tous les commentaires et réponses émis via l'app : texte, publication cible, date, origine (manuel ou IA éditée).
- **FR-023** : Le journal MUST également enregistrer les likes émis et les actions en échec avec leur motif.

**Plateforme & accès**

- **FR-011** : L'app MUST être installable en PWA sur iOS, utilisable au format téléphone, et conserver son état entre les sessions. Hors connexion, la lecture du dernier état synchronisé MUST rester possible et toute action d'écriture MUST être indisponible. L'interface responsive MUST rester utilisable sur desktop.
- **FR-012** : L'app MUST être mono-utilisateur, connectée à un seul compte LinkedIn, celui de l'utilisateur.
- **FR-014** : L'app MUST envoyer une notification push quand de nouveaux éléments non traités arrivent (publications des listes, commentaires reçus). La détection MUST reposer sur une vérification serveur à fréquence réduite — 2 fois par jour, paramétrable — pour rester compatible avec l'objectif de coût de FR-003.
- **FR-015** : L'accès à l'app MUST être protégé par une authentification simple, pour un seul utilisateur autorisé.

**Direction artistique**

- **FR-024** : L'interface MUST reproduire à l'identique la direction artistique de la plateforme Notion Club (couleurs, typographies, animations, conventions de composants), extraite du dépôt de référence au moment de l'implémentation. Les bibliothèques de composants et d'animations retenues MUST fournir la structure et les interactions, jamais la direction artistique : tout composant importé MUST être thémé avec les tokens du design system Notion Club.

### Key Entities

- **Liste** : groupe de comptes suivis définissant un périmètre d'attention. Attributs : nom, membres, date de création.
- **Compte suivi** : profil LinkedIn membre d'une ou plusieurs listes. Attributs : nom, URL du profil, photo, état de récupérabilité (récupérable / restreint), date d'ajout.
- **Publication** : post LinkedIn d'un compte suivi ou de l'utilisateur. Attributs : auteur, texte, média (ou marqueur de média non restituable), date de publication, URL LinkedIn, nature (originale / repost), statut de traitement.
- **Commentaire reçu** : commentaire déposé sur une publication de l'utilisateur, à un niveau d'imbrication quelconque. Attributs : auteur, texte, date, publication racine, commentaire parent, statut de traitement.
- **Action émise** : commentaire, réponse ou like publié depuis l'app. Attributs : type, texte, cible (publication ou commentaire), date de mise en file, date d'envoi, origine (manuel / IA éditée), état (en attente, envoyé, annulé, en échec + motif).
- **File d'envoi** : ordonnancement des actions émises sous contrainte de plafonds et de cadence. Attributs : éléments en attente, plafonds courants, état (active / suspendue), motif et horodatage de suspension.
- **Curseur de récupération** : horodatage de dernière récupération réussie, par source (publications d'un compte suivi, commentaires reçus).
- **Process IA** : règles de génération, un par contexte (commentaire chez un tiers, réponse chez soi). Versionné dans le dépôt, édité par l'utilisateur.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** : Sur un échantillon de contrôle de 10 comptes suivis observés sur 7 jours, 100 % de leurs publications originales apparaissent dans le fil et 0 repost y figure.
- **SC-002** : Une session d'engagement quotidienne complète — fil et commentaires reçus ramenés à zéro élément non traité — se traite en moins de 15 minutes pour un volume nominal de 20 publications et 10 commentaires reçus.
- **SC-003** : À l'ouverture de l'app, le fil est consultable en moins de 5 secondes et l'actualisation incrémentale s'achève en moins de 60 secondes pour plus de 100 comptes suivis.
- **SC-004** : Le coût mensuel total de fonctionnement (récupération, écriture, génération) reste sous le budget cible à l'échelle de plus de 100 comptes suivis, et la récupération d'un cycle n'inclut aucun contenu déjà récupéré.
- **SC-005** : 100 % des actions d'écriture ont été validées manuellement par l'utilisateur, et 0 action ne dépasse les plafonds journaliers ni la fenêtre horaire configurée, mesuré sur le journal.
- **SC-006** : Aucun élément marqué traité ne réapparaît comme non traité, et aucun élément non traité ne disparaît de la file sans action explicite de l'utilisateur, sur 30 jours d'usage.
- **SC-007** : Un signal de restriction détecté suspend la file avant tout envoi supplémentaire et alerte l'utilisateur en moins d'une minute.
- **SC-008** : Aucune restriction du compte LinkedIn de l'utilisateur sur les 3 premiers mois d'usage.
- **SC-009** : L'app s'installe sur l'écran d'accueil iOS et reste consultable en lecture hors connexion, sans perte de l'état de traitement.
- **SC-010** : Une proposition de commentaire générée est disponible en moins de 10 secondes, et l'utilisateur en publie la majorité après édition plutôt que rédaction intégrale.

## Assumptions

- Les process IA, tant que leurs fichiers `.md` ne sont pas rédigés, sont des placeholders : la génération reste techniquement fonctionnelle mais la qualité rédactionnelle n'est pas évaluable avant leur rédaction.
- L'authentification « simple » de FR-015 désigne un secret unique connu du seul utilisateur et une session persistante sur l'appareil ; aucun parcours d'inscription, de récupération de mot de passe ni de gestion de rôles n'est prévu.
- Les éléments non traités n'expirent pas automatiquement : la file ne se vide que par action de l'utilisateur. Une absence prolongée produit une file volumineuse, qui reste le comportement attendu (exhaustivité avant confort).
- L'app est utilisée principalement depuis un seul téléphone ; l'usage multi-appareils simultané est possible mais non optimisé.
- Les plafonds de FR-017 et les seuils de FR-018 sont issus d'une recherche préalable sur les pratiques d'automatisation LinkedIn et sont traités comme des valeurs de départ configurables, non comme des garanties.
- La fenêtre de 30 jours de FR-008 est jugée suffisante : les commentaires reçus au-delà sont rares et leur réponse tardive a peu de valeur.
- Les publications de l'utilisateur lui-même sont récupérées au même titre que celles des comptes suivis, puisqu'elles portent les commentaires reçus de FR-008.

## Contraintes & Dépendances externes

*Ces éléments relèvent de la faisabilité et bornent le plan technique ; ils ne sont pas des choix d'implémentation mais des contraintes imposées.*

- **Séparation lecture / écriture** : la récupération passe exclusivement par des fournisseurs tiers « no-cookie » n'impliquant jamais le compte LinkedIn de l'utilisateur. Le compte n'est connecté que pour les actions d'écriture indispensables (commentaires, réponses, likes), toujours validées manuellement et à rythme humain plafonné. Le compte ne doit porter aucune empreinte d'automatisation en lecture.
- **Interchangeabilité des fournisseurs de récupération** : le marché est instable (fermeture de Proxycurl en 2025 après action en justice de LinkedIn). La couche de récupération est découplée derrière une interface unique.
- **Scraper maison écarté** : contourner l'authwall et l'anti-bot LinkedIn exige proxies résidentiels et maintenance permanente, déplace le risque juridique sur l'utilisateur, pour une économie marginale face au coût des fournisseurs existants.
- **Dimensionnement** : plus de 100 comptes suivis au total ; la récupération doit rester viable en coût à cette échelle.
- **Prérequis à provisionner avant le build** : un compte chez le fournisseur de récupération avec les actors retenus (posts, profils, commentaires no-cookie) ; un compte chez le fournisseur d'écriture, un seul compte LinkedIn connecté ; une clé d'API dédiée pour la génération ; une paire de clés VAPID pour les notifications push web.
- **Direction artistique** : dépôt de référence du design system Notion Club, à inspecter au moment de l'implémentation pour en extraire couleurs, typographies, animations et conventions de composants. Bibliothèques socle pour la structure et les interactions : transitions.dev, beui.dev, interior, rareui — thémées avec les tokens Notion Club.

## Hors périmètre (v1)

- Publication de posts : l'app n'est ni un outil de publication ni un outil de programmation de contenu.
- Messages privés et prospection, couverts par d'autres outils.
- Reposts et partages (les likes, eux, sont dans le périmètre — FR-013).
- Analytics et statistiques d'engagement.
- Multi-comptes et multi-utilisateurs.
- Suivi des réponses reçues sur ses propres commentaires postés chez les créateurs.

## Points clarifiés

1. **Profondeur de la première récupération** (FR-003) — *tranché* : 7 jours,
   paramétrable, avec plafond de rattrapage à 90 jours. À 100 comptes, l'amorçage
   coûte une poignée de dollars une seule fois, et le fil n'est pas vide au premier
   lancement.
2. **Contenu rédactionnel des deux process IA** (FR-007) — *ouvert, non bloquant* :
   les placeholders sont livrés, l'app signale qu'ils ne sont pas rédigés, et les
   remplacer ne demande ni redéploiement ni changement de code.

## Écarts assumés entre la spec et l'implémentation

- **FR-017 — les plafonds et la cadence sont arithmétiquement incompatibles à
  leur maximum.** 90 actions par jour à un délai moyen de 7,5 minutes
  demanderaient ~11 h d'émission, pour ~9,5 h de fenêtre ouverte (8 h-19 h moins
  le creux méridien). L'implémentation fait gagner la cadence — c'est elle qui
  protège le compte — et reporte le surplus au jour suivant. Les plafonds sont
  donc des maxima, jamais des objectifs. Les deux jeux de valeurs sont
  paramétrables ; baisser le délai ou les plafonds de likes lève la tension.
- **Un like ne fait pas passer un élément en traité.** FR-010 nomme trois
  déclencheurs (commentaire publié, réponse envoyée, marquage manuel) ; le like
  n'en fait pas partie. L'implémentation s'y tient : liker puis commenter reste
  une séquence valide.
