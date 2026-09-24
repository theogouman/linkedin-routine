# Architecture

## Découpage

```
src/
  app/                    Routes Next.js + Server Actions (orchestration)
  server/                 Composition : branche les modules entre eux
  shared/
    components/           UI partagée (navigation, avatar, composer, alertes)
    motion/               transitions.dev — un composant par transition
    lib/                  Client DB, types de lignes, URLs LinkedIn, format
  modules/
    auth/                 Mot de passe unique, session, middleware
    lists/                Listes et comptes suivis
    feed/                 Publications du fil
    inbox/                Commentaires reçus
    engagement/           File d'écriture, plafonds, coupe-circuit, journal
    ingestion/            Curseurs, normalisation, fournisseurs de lecture
    ai/                   Process Markdown, prompts, appel Anthropic
    notifications/        Abonnements et envois push
supabase/migrations/      Schéma SQL versionné
process/                  Les deux process de génération (Markdown)
```

**Règle d'isolation, vérifiée par ESLint** : un module n'importe jamais un
autre module. Le partage passe par `@/shared`, l'orchestration par `src/server`
ou `src/app`. La règle n'est pas de la cérémonie — c'est elle qui rend la file
d'écriture testable sans le fil, et le fil remplaçable sans toucher à la file.

## Le patron qui revient : ports injectés

Deux endroits orchestrent plusieurs modules à la fois — l'actualisation et la
purge de la file. Plutôt que de leur laisser importer la base et trois modules,
ils sont écrits contre des **ports** :

```ts
// src/modules/ingestion/lib/sync.ts
export async function runSync(provider, ports: SyncPorts, options)
```

`src/server/sync-service.ts` fournit l'implémentation réelle des ports.
Conséquence directe : l'invariant le plus important de l'app — *le curseur
n'avance jamais sur un échec* — se teste avec un objet littéral, sans Postgres
et sans dépenser un crédit de scraping.

## Où vit quoi

| Décision | Fichier | Pourquoi là |
|---|---|---|
| Cadence, plafonds, montée en charge | `modules/engagement/lib/policy.ts` | Pur et testé : c'est ce qui protège le compte, ça doit être vérifiable sans base |
| Coupe-circuit | `modules/engagement/lib/circuit.ts` | Idem — reconnaissance des signaux et arbitrage des 72 h |
| Fenêtres de récupération | `modules/ingestion/lib/cursor.ts` | Idem — backfill initial, chevauchement, plafond de rattrapage |
| Traduction des charges utiles fournisseur | `modules/ingestion/lib/normalize.ts` | Première couche à casser quand un fournisseur change ; testée sur échantillons figés |
| Appels réseau | `*/providers/*.ts` | Derrière une interface, remplaçables |
| Accès base | `*/server/repository.ts` | `server-only`, jamais importable côté client |

## Les deux interfaces remplaçables

Le marché des fournisseurs de données LinkedIn est instable — Proxycurl a fermé
en 2025 après une action en justice. Lecture et écriture passent donc chacune
par une interface unique :

```ts
interface IngestionProvider { fetchPostsForProfile, fetchCommentsForPosts, fetchProfile? }
interface WriteProvider     { publishComment, publishReply, publishLike }
```

Chacune a trois implémentations : la réelle (Apify, Unipile), une fausse en
mémoire pour le développement et les tests, et le point de résolution par
variable d'environnement. Changer de fournisseur = écrire une implémentation.

## La séparation lecture / écriture

C'est la décision structurante du produit, pas une optimisation :

- **Lecture** — scrapers tiers no-cookie. Le compte LinkedIn de l'utilisateur
  n'est jamais engagé, donc il ne porte aucune empreinte d'automatisation en
  consultation.
- **Écriture** — Unipile, compte connecté, mais uniquement pour des actions que
  l'utilisateur a validées une par une, émises à rythme humain plafonné.

Le code rend la confusion difficile : les deux couches ne partagent aucun type,
aucun client HTTP, aucun secret.

## Chemin d'une action d'écriture

```
Composer (UI)
  → submitComment (Server Action)
    → commentOnPost (src/server/engagement-service.ts)
      → enqueueWriteAction (modules/engagement/server/queue.ts)
        → computeNextSlot (policy.ts)  ← plafonds, cadence, fenêtre
        → INSERT write_actions (status=pending, scheduled_for)

/api/cron/drain (toutes les 5 min)
  → drainQueue
    → claimAction (verrou : pending → sending, conditionnel)
    → WriteProvider.publishComment
    → succès : markActionSent + ports.onSent → post marqué traité
    → signal de restriction : releaseAction + suspendQueue + alerte push
```

Le verrou de `claimAction` est une mise à jour conditionnelle sur le statut :
deux purges simultanées ne peuvent pas envoyer deux fois le même commentaire,
la seconde ne touche aucune ligne.

## Tests

245 tests, tous sans réseau ni base. Ils portent sur ce qui casse cher :

| Sujet | Ce qui est vérifié |
|---|---|
| `policy` | Les plafonds ne sont jamais dépassés, la cadence est respectée, la suite d'envois est croissante et toujours dans la fenêtre |
| `circuit` | 429, 5xx, checkpoints et sessions expirées suspendent ; une erreur banale non ; les 72 h sont opposables à la seconde |
| `cursor` / `sync` | Un échec ne fait pas avancer le curseur ; un compte en panne n'empêche pas les autres |
| `normalize` | Partages exclus, doublons écartés, date invalide refusée plutôt que ramenée à 1970 |
| `timezone` | Aller-retour stable sur une année, passage à l'heure d'été compris |
| `linkedin-url` | Onze formes d'URL LinkedIn convergent vers une seule ; un identifiant opaque garde sa casse |
| `profiles` | L'appariement d'un lot d'enrichissement se fait par identifiant, jamais par position |
| `model` | Haiku par défaut, et `output_config` n'est transmis qu'aux modèles qui le connaissent |
| `nav-routes` | Aucun écran du groupe `(app)` n'est absent de la barre ; `/file` n'allume pas l'onglet `/fil` |
| `reactions` | Le vocabulaire des six réactions est exactement celui de la contrainte SQL, et une valeur inconnue se dégrade en « J'aime » au lieu de lever |
| `normalize` (engagement) | Le compteur affiché somme la ventilation par type, et vaut `null` — jamais `0` — quand le fournisseur se tait |

Deux tests ont déjà attrapé un bug réel avant qu'il n'existe en production :
un 503 dont le corps contenait « service unavailable » était classé « profil
restreint », ce qui aurait marqué un compte sain comme définitivement mort ; et
un `startsWith` nu faisait allumer l'onglet « Fil » sur l'écran « File ».


## Les écrans

| Route | Ce qu'on y répond |
|---|---|
| `/fil` | Qu'est-ce que mes créateurs ont publié, et que je n'ai pas encore traité (« Feed » à l'écran) |
| `/inbox` | Qui m'a répondu, et à qui je n'ai pas encore répondu |
| `/file` | Qu'est-ce qui va partir, quand, et combien me reste-t-il aujourd'hui |
| `/listes` | Qui je suis, et dans quel périmètre |
| `/reglages` | Comment le compte se comporte en général |

`/reglages` était un repli de `/file`. Deux questions très différentes — ce qui
part aujourd'hui, et le régime du compte — partageaient un écran, et la seconde
poussait la première sous la ligne de flottaison.

La barre de navigation est **haute sur desktop, basse sur mobile**, rendue par
un seul composant : dupliquer la liste d'onglets garantirait qu'un jour l'une
des deux oublie un écran. L'ordre des onglets vit dans
`shared/components/nav-routes.ts`, et c'est de lui que la transition de page
tire son sens de glissement.

## Navigation : ce qui la rend légère

Trois choses, dans cet ordre d'importance :

1. **Les compteurs ne bloquent plus le rendu.** Ils vivaient dans un `await`
   du layout : trois allers-retours Postgres s'ajoutaient à l'affichage de
   chaque écran, y compris quand l'écran lui-même était prêt. Chacun est
   maintenant sa propre frontière `Suspense` — la coquille et la barre partent
   au premier octet, les pastilles arrivent derrière.
2. **Un `loading.tsx` par route.** L'App Router l'affiche instantanément
   pendant que le segment se rend côté serveur. C'est ce qui change la nature
   du clic : l'écran arrive avec sa structure et se remplit, au lieu de laisser
   l'écran précédent figé.
3. **`prefetch` sur les liens de la barre, et un `template.tsx`** qui rejoue la
   transition d'entrée à chaque navigation. Un `layout.tsx` serait réutilisé et
   ne rejouerait rien.

Aucune des trois ne supprime le rendu serveur : les données restent fraîches à
chaque affichage, c'est l'attente qui a changé de place.

## Bibliothèque de mouvement

`shared/motion/` porte les transitions de [transitions.dev](https://transitions.dev),
une par fichier, reprises **verbatim** : pas de raccourci, pas de suppression
du `will-change`, garde `prefers-reduced-motion` conservé partout. Ce qui a été
adapté, et uniquement cela :

- les **couleurs** viennent du design system Notion Club, jamais des valeurs
  d'exemple de la bibliothèque (le cœur du bouton « liker » est à la marque, pas
  au rouge de la démo) ;
- les **valeurs réglables** documentées comme telles (la course d'un pouce
  d'interrupteur, les dimensions ouvertes d'une morphose) sont passées en
  variables plutôt que codées aux dimensions de la démo ;
- deux raccords de spécificité vivent en bas de `globals.css`, commentés :
  les utilitaires Tailwind sont dans une couche CSS et perdent donc contre les
  snippets quel que soit l'ordre.

Une seule transition du catalogue n'est pas installée : **reasoning stream**,
qui fait défiler un transcript de raisonnement d'agent deux lignes à la fois.
L'app n'en affiche aucun, et lui en fabriquer un pour justifier l'animation
serait exactement ce que le mouvement ne doit pas faire.

Les trente et une autres portent chacune un état réel. Quelques exemples de ce
que cela veut dire concrètement :

| Transition | Ce qu'elle rend visible |
|---|---|
| Card resize + accordion | L'ouverture d'une liste, d'un réglage, du composer |
| Notification badge + number pop-in | « Il y a maintenant quelque chose à traiter », puis « il y en a un de plus » |
| Like button | Le seul geste qui ne coûte qu'un clic mérite d'être satisfaisant |
| Thinking states + streaming text | Ce que fait la génération, et le temps de lire avant de valider (FR-006) |
| Shimmer | Un envoi en cours — le seul état de la file où quelque chose se passe à l'instant où on regarde |
| Skeleton reveal | Le chargement de chaque portrait, au lieu de photos qui sautent une par une |
| Banner stacking | Trois alertes qui s'empilent au lieu de repousser le fil sous la ligne de flottaison |
| Error shake | Une erreur là où on la corrige, plutôt qu'un toast à l'autre bout de l'écran |
| Modal + dropdown | `window.prompt` et `window.confirm`, qui affichent le nom d'hôte en PWA installée |
| Card tilt | Au pointeur fin uniquement, et coupé pendant la rédaction |


## Les réactions

Six réactions LinkedIn, pas seulement le pouce. Le vocabulaire vit à un seul
endroit — `shared/lib/reactions.ts` — et il est répliqué en trois autres :

1. une contrainte `check` en base (migration 007), pour qu'une valeur
   impossible soit refusée à l'écriture et non à l'envoi ;
2. `reaction_type` sur `write_actions`, relu au moment de la purge : l'action
   part avec le type validé au clic, même deux heures plus tard ;
3. `reaction_type` sur `posts` et `received_comments`, qui dit CE QUI a été
   posé là où `liked_at` ne disait que QUAND.

Un test compare la liste TypeScript à celle de la migration. Sans lui, ajouter
une réaction dans l'interface et oublier la contrainte donnerait une erreur au
moment de la mise en file — c'est-à-dire après la validation manuelle, quand
l'utilisateur croit son geste enregistré.

Le menu s'ouvre au survol sur pointeur fin et à l'appui long au doigt. Un
`hover` n'existe pas sous un pouce, et s'arrêter là aurait réservé les six
réactions au desktop — sur une app dont l'usage principal est le téléphone.

## Les compteurs d'engagement

`engagement.reactions[]` et `engagement.comments` sont **déjà** dans la charge
utile de l'actor de publications : les afficher n'a coûté aucun appel
supplémentaire, c'est la seule raison de le faire.

Le total affiché est la somme de la ventilation par type, pas le champ `likes`
qui ne compte que le pouce bleu — un post à quarante « bravo » afficherait
sinon un chiffre faux, et plus bas que la réalité.

`null` et `0` sont distingués partout : LinkedIn masque ces compteurs sur
certaines publications (`hideReactionsCount`), et afficher « 0 » sur un
compteur masqué serait un mensonge.
