# Déploiement

> Pour l'origine et la génération de chaque variable, voir
> [`VARIABLES-ENV.md`](VARIABLES-ENV.md). Ce document-ci donne l'ordre des
> opérations.

Ordre imposé : la base avant l'app, les fournisseurs avant le premier
lancement. Une variable manquante ne dégrade pas l'app en silence — elle la
bloque avec un message qui nomme la variable.

## 1. Base de données (Supabase)

1. Crée un projet Supabase.
2. Applique [`supabase/migrations/001_init.sql`](../supabase/migrations/001_init.sql)
   dans l'éditeur SQL.
3. Relève `SUPABASE_URL` et la **service role key**.

Il n'y a ni RLS ni clé publique, volontairement : l'app est mono-utilisateur,
tout l'accès données se fait côté serveur derrière le cookie de session, et le
navigateur ne reçoit jamais de clé Supabase. Ajouter de la RLS ici donnerait
une impression de défense sans frontière réelle supplémentaire.

## 2. Récupération (Apify)

Crée un compte Apify et relève le token. Les actors par défaut sont ceux de
HarvestAPI, « no-cookie » — ils n'utilisent jamais ton compte LinkedIn :

| Usage | Actor | Coût indicatif |
|---|---|---|
| Publications des comptes suivis | `harvestapi~linkedin-profile-posts` | ~0,002 $ / publication |
| Commentaires reçus | `harvestapi~linkedin-post-comments` | ~0,002 $ / commentaire |
| Enrichissement des profils (optionnel) | `APIFY_PROFILE_ACTOR` | — |

**Ordre de grandeur du coût.** 100 comptes suivis qui publient chacun 3 fois
par semaine font ~1 300 publications par mois, soit ~2,60 $. Les commentaires
reçus s'ajoutent au même tarif. Les partages ne sont jamais demandés (donc
jamais facturés) et le pré-filtre `postedLimit` évite de payer pour du contenu
antérieur au curseur.

Trois garde-fous de coût sont configurables : `MAX_POSTS_PER_ACCOUNT`,
`MAX_COMMENTS_PER_POST` et `MAX_LOOKBACK_DAYS` (profondeur maximale demandée
après une longue absence).

## 3. Écriture (Unipile)

Connecte **un seul** compte LinkedIn. Relève `UNIPILE_DSN`,
`UNIPILE_API_KEY` et `UNIPILE_ACCOUNT_ID`.

Les chemins d'API sont des constantes en tête de
`src/modules/engagement/providers/unipile.ts` et surchargeables par
`UNIPILE_ROUTE_COMMENT` / `UNIPILE_ROUTE_REACTION` — à vérifier contre la
documentation Unipile courante au moment du provisioning, elle évolue.

## 4. Génération (Anthropic)

Crée une clé d'API **dédiée**. Ne jamais utiliser le jeton d'abonnement Claude
(OAuth Claude Code / claude.ai) : son emploi hors des applications officielles
viole les conditions d'utilisation d'Anthropic et exposerait le compte.

Coût indicatif : à `claude-opus-5` en effort `low`, une génération de
commentaire consomme quelques centaines de tokens. À 25 générations par jour,
on reste sous quelques euros par mois.

## 5. Notifications push

```bash
npx web-push generate-vapid-keys
```

La clé publique va dans **deux** variables : `VAPID_PUBLIC_KEY` (serveur) et
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (navigateur, pour l'abonnement).

## 6. Authentification

```bash
node scripts/generate-secrets.mjs "ton mot de passe"
```

Génère d'un coup `APP_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET` et la
paire VAPID.

Sans `SESSION_SECRET`, le middleware refuse **toute** navigation : une variable
oubliée au déploiement ne doit pas ouvrir l'app.

## 7. Ordonnanceur

`CRON_SECRET` protège les routes `/api/cron/*`, appelées sans navigateur. Sans
lui elles répondent 503 — refuser plutôt qu'ouvrir, puisqu'elles déclenchent
des envois sur le compte LinkedIn et des appels facturés.

[`vercel.json`](../vercel.json) déclare deux tâches :

| Route | Fréquence | Rôle |
|---|---|---|
| `/api/cron/drain` | toutes les 5 min | Purge la file d'envoi. Quasi vide à chaque passage : la cadence vient de la politique, pas de la fréquence |
| `/api/cron/notify` | 7 h et 16 h UTC | Vérifie les nouveautés et envoie la notification (FR-014) |

## 8. Installation sur iPhone

Ouvrir l'app dans Safari → Partager → « Sur l'écran d'accueil ». Le mode
standalone, les splash screens et la compensation d'encoche sont déjà en place.

## Vérification après déploiement

1. Se connecter — le mot de passe doit être demandé.
2. Créer une liste, y coller 2-3 URLs de profils, actualiser.
3. Vérifier dans **File → Réglages → Dernières actualisations** que le passage
   est vert et que des publications sont remontées.
4. Rédiger un commentaire : il doit apparaître en file avec une heure d'envoi,
   et être annulable.
5. Attendre la purge, vérifier sur LinkedIn que le commentaire est bien publié.
