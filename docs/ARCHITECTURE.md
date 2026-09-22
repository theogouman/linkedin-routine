# Architecture

## Découpage

```
src/
  app/                    Routes Next.js + Server Actions (orchestration)
  server/                 Composition : branche les modules entre eux
  shared/                 Transverse — client DB, types de lignes, UI, format
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

196 tests, tous sans réseau ni base. Ils portent sur ce qui casse cher :

| Sujet | Ce qui est vérifié |
|---|---|
| `policy` | Les plafonds ne sont jamais dépassés, la cadence est respectée, la suite d'envois est croissante et toujours dans la fenêtre |
| `circuit` | 429, 5xx, checkpoints et sessions expirées suspendent ; une erreur banale non ; les 72 h sont opposables à la seconde |
| `cursor` / `sync` | Un échec ne fait pas avancer le curseur ; un compte en panne n'empêche pas les autres |
| `normalize` | Partages exclus, doublons écartés, date invalide refusée plutôt que ramenée à 1970 |
| `timezone` | Aller-retour stable sur une année, passage à l'heure d'été compris |
| `profile-url` | Onze formes d'URL LinkedIn convergent vers une seule |

Un test a déjà attrapé un bug réel avant qu'il n'existe en production : un
503 dont le corps contenait « service unavailable » était classé « profil
restreint », ce qui aurait marqué un compte sain comme définitivement mort.
