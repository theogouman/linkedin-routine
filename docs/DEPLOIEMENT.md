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

L'app est mono-utilisateur : aucun `user_id`, tout l'accès données se fait
côté serveur derrière le cookie de session, et le navigateur ne reçoit jamais
de clé Supabase.

La migration 003 active malgré tout la RLS sur toutes les tables, **sans aucune
politique**. C'est ce qui ferme l'API PostgREST à `anon` et `authenticated`
— que l'app n'utilise pas — pendant que `service_role` la contourne
nativement. L'app ne change pas d'une ligne. Sans cela, la seule chose qui
protégerait les tables serait que la clé anon ne soit publiée nulle part, et
ce n'est pas une frontière. L'analyseur Supabase signalera ensuite
`rls_enabled_no_policy` en INFO : c'est le comportement voulu.

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

Coût indicatif : à `claude-haiku-4-5-20251001` (le modèle par défaut), une
génération de commentaire consomme quelques centaines de tokens. À 25
générations par jour, la facture se compte en centimes par mois.

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

### Le plan Hobby de Vercel n'autorise qu'un cron par jour

C'est la contrainte qui décide de toute cette section. Un
`*/5 * * * *` dans `vercel.json` fait **échouer le déploiement** :

> Hobby accounts are limited to daily cron jobs. This cron expression
> (`*/5 * * * *`) would run more than once per day.

Le message parle de **fréquence**, pas de quota : aucun autre projet ne
« consomme » quoi que ce soit, c'est l'expression elle-même qui est refusée.

Or la file d'écriture doit être visitée toutes les quelques minutes. Non pour
envoyer davantage — la cadence (3 à 12 min de délai aléatoire, plafonds,
fenêtre diurne) est réappliquée à chaque passage et ne laisse jamais partir
plus que prévu — mais parce qu'un passage quotidien enverrait deux actions par
jour et la file ne se viderait jamais.

D'où la répartition en trois étages :

| Déclencheur | Fréquence | Rôle | Où |
|---|---|---|---|
| Cron Vercel | 1×/jour, 7 h UTC | Vérification des nouveautés + notification | [`vercel.json`](../vercel.json) |
| **pg_cron (Supabase)** | **toutes les 5 min** | **Purge de la file d'écriture** | [`supabase/migrations/002_drain_schedule.sql`](../supabase/migrations/002_drain_schedule.sql) |
| pg_cron (Supabase) | 1×/jour, 16 h UTC | Seconde vérification, pour tenir les 2/jour de FR-014 | idem |
| Ouverture de l'app | à chaque session | Filet : fait partir ce qui est dû même sans ordonnanceur | `after()` dans le layout |

> `vercel.json` n'accepte **que** `path` et `schedule` dans une entrée `crons`.
> Toute clé supplémentaire — un `comment`, par exemple — fait échouer le build
> avec `Invalid vercel.json - crons[0] should NOT have additional property`.
> Les explications vivent donc ici, pas dans le fichier.

#### Mettre en place pg_cron

Console Supabase → **SQL Editor** → colle
[`002_drain_schedule.sql`](../supabase/migrations/002_drain_schedule.sql) tel
quel → **Run**. La migration s'applique sans rien éditer : elle laisse la
configuration vide et les jobs tournent à vide tant qu'elle l'est.

Puis, une fois l'app déployée, une seule instruction les active :

```sql
update drain_config
   set app_url     = 'https://ton-app.vercel.app',
       cron_secret = 'la valeur de CRON_SECRET sur Vercel',
       updated_at  = now()
 where id = 1;
```

#### Deployment Protection : preview uniquement

La protection Vercel (« Vercel Authentication ») doit être réglée sur
**Preview**, pas sur *All Deployments*. Si elle couvre la production :

- pg_cron reçoit une redirection d'authentification au lieu de la route, et
  **rien ne part jamais** ;
- et surtout, **la PWA elle-même devient inutilisable** : sur iPhone, l'app
  installée heurterait un mur d'authentification Vercel avant même d'atteindre
  l'écran de mot de passe.

Le *Protection Bypass for Automation* résoudrait le premier point mais pas le
second. Sans domaine personnalisé, la production doit donc être ouverte au
réseau — ce qui est sans conséquence, puisque c'est l'app qui se protège :

| Ce qui reste public | Pourquoi c'est sans risque |
|---|---|
| `/login` | Formulaire de mot de passe ; c'est la porte |
| `/manifest.webmanifest`, `/sw.js`, `/offline`, `/icons/*`, `/_next/*` | Statiques, aucun contenu |
| `/api/cron/*` | Répond 401 sans le `CRON_SECRET`, 503 s'il n'est pas configuré |

Tout le reste est fermé par le middleware, qui ferme **par défaut** : on y
liste ce qui est public, jamais ce qui est protégé, pour qu'une route ajoutée
demain le soit sans qu'on y pense. Un test
(`src/middleware-surface.test.ts`) fige cette liste.

Vérification :

```sql
select jobname, schedule, active from cron.job;
select jobname, status, return_message, start_time
  from cron.job_run_details order by start_time desc limit 10;
select id, status_code, created from net._http_response order by id desc limit 10;
```

Un `status_code` 200 dans `net._http_response` signifie que la purge répond.
Un 401 signifie que le `cron_secret` de la table `drain_config` ne correspond
pas à la variable `CRON_SECRET` de Vercel.

Changer l'URL ou le secret plus tard ne demande pas de reprogrammer le job :

```sql
update drain_config set app_url = '…', cron_secret = '…' where id = 1;
```

#### Les autres options

- **GitHub Actions** — [`.github/workflows/drain-queue.yml`](../.github/workflows/drain-queue.yml),
  déjà écrit. Gratuit, mais le cron de GitHub est « best effort » : un
  déclenchement prévu toutes les 5 min arrive souvent avec 10 à 20 min de
  retard. Sans conséquence ici (les envois partent plus tard, jamais plus
  vite), mais pg_cron est plus net. Définis les secrets `APP_URL` et
  `CRON_SECRET` du dépôt pour l'activer ; sans eux, le job se termine
  proprement sans rien appeler.
- **Plan Pro Vercel** (~20 $/mois) — remets simplement le cron `*/5` dans
  `vercel.json` et supprime le job pg_cron. C'est la seule option qui coûte de
  l'argent, et elle n'apporte rien de plus que pg_cron ici.
- **Ne rien mettre du tout** — l'app reste fonctionnelle : la purge
  opportuniste fait partir ce qui est dû à chaque ouverture. Mais rien ne part
  quand l'app est fermée, donc une file constituée le soir attend le lendemain.
  Acceptable pour tester, pas en régime.

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
