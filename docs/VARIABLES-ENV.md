# Guide — générer toutes les variables d'environnement

Douze variables obligatoires, sept optionnelles. Quatre se génèrent en une
commande, huit se récupèrent sur des comptes tiers, le reste a des valeurs par
défaut qui conviennent.

## Raccourci — les quatre générables d'un coup

### Si tu as le dépôt en local

```bash
git clone https://github.com/theogouman/linkedin-routine.git
cd linkedin-routine
npm install
node scripts/generate-secrets.mjs "ton mot de passe"
```

La sortie est un bloc `.env` complet : les quatre valeurs remplies, les huit
autres en attente avec l'endroit exact où les prendre.

### Sans rien cloner — commandes autonomes

Copie ce bloc entier dans ton terminal, après avoir remplacé le mot de passe
de la première ligne. Il ne dépend que de `node` et d'`openssl`, tous deux
déjà présents sur macOS.

```bash
PASS='ton mot de passe'

{
node -e '
const {webcrypto}=require("node:crypto"); const c=globalThis.crypto||webcrypto;
const I=310000, s=c.getRandomValues(new Uint8Array(16));
c.subtle.importKey("raw",new TextEncoder().encode(process.argv[1]),"PBKDF2",false,["deriveBits"])
 .then(k=>c.subtle.deriveBits({name:"PBKDF2",salt:s,iterations:I,hash:"SHA-256"},k,256))
 .then(b=>console.log(`APP_PASSWORD_HASH=pbkdf2$${I}$${Buffer.from(s).toString("base64")}$${Buffer.from(b).toString("base64")}`));
' "$PASS"
echo "SESSION_SECRET=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
npx --yes web-push generate-vapid-keys --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const v=JSON.parse(d);console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${v.publicKey}`);console.log(`VAPID_PUBLIC_KEY=${v.publicKey}`);console.log(`VAPID_PRIVATE_KEY=${v.privateKey}`)})'
}
```

Sortie attendue, six lignes prêtes à coller :

```
APP_PASSWORD_HASH=pbkdf2$310000$…$…
SESSION_SECRET=…
CRON_SECRET=…
NEXT_PUBLIC_VAPID_PUBLIC_KEY=B…
VAPID_PUBLIC_KEY=B…
VAPID_PRIVATE_KEY=…
```

Accents, espaces et caractères spéciaux dans le mot de passe sont gérés —
c'est testé (`scripts/oneliner.test.ts` vérifie que le condensat produit par
cette commande authentifie réellement dans l'app). Seule exception : si ton
mot de passe contient une **apostrophe**, remplace `PASS='…'` par
`PASS="…"` et échappe les `$`, `` ` `` et `\` qu'il contiendrait.

La ligne `PASS=` reste dans l'historique de ton shell. Pour l'en retirer :
`history -d $(history 1)` en zsh, ou fais précéder la ligne d'un **espace**
si `HIST_IGNORE_SPACE` est actif.

### Chaque valeur séparément

| Variable | Commande |
|---|---|
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='` |
| paire VAPID | `npx --yes web-push generate-vapid-keys` |
| `APP_PASSWORD_HASH` | le `node -e` du bloc ci-dessus |

---

## Sommaire

| Variable | Obligatoire | Origine |
|---|---|---|
| `APP_PASSWORD_HASH` | oui | générée |
| `SESSION_SECRET` | oui | générée |
| `CRON_SECRET` | oui | générée |
| `VAPID_PUBLIC_KEY` · `NEXT_PUBLIC_VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` | oui (push) | générées |
| `VAPID_SUBJECT` | oui (push) | ton email |
| `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | oui | console Supabase |
| `APIFY_TOKEN` | oui | console Apify |
| `UNIPILE_DSN` · `UNIPILE_API_KEY` · `UNIPILE_ACCOUNT_ID` | oui | console Unipile |
| `ANTHROPIC_API_KEY` | oui | console Anthropic |
| tout le reste | non | valeurs par défaut |

---

## 1. Les quatre générables

### `APP_PASSWORD_HASH` — le mot de passe qui ouvre l'app

Depuis le dépôt : `node scripts/hash-password.mjs "ton mot de passe"`.
Sans le dépôt : le `node -e` du raccourci ci-dessus.

Sortie : `APP_PASSWORD_HASH=pbkdf2$310000$<sel>$<clé>`.

C'est un condensat PBKDF2-SHA256 à 310 000 itérations avec un sel aléatoire.
Le mot de passe en clair n'existe nulle part — ni en base, ni dans les
variables, ni dans les logs. Relancer la commande sur le même mot de passe
produit un condensat différent (sel neuf) : les deux fonctionnent.

Prends-le long. C'est la seule barrière devant une app qui peut publier au nom
de ton compte LinkedIn.

### `SESSION_SECRET` — signature du cookie de session

```bash
openssl rand -base64 32
```

Signe le JWT de session (HS256). Le changer déconnecte tous les appareils —
c'est d'ailleurs le bouton d'urgence si tu crains une fuite de cookie.

Sans lui, le middleware **refuse toute navigation** et renvoie sur
`/login?error=config`. C'est délibéré : une variable oubliée au déploiement ne
doit pas ouvrir l'app.

### `CRON_SECRET` — accès aux routes d'ordonnanceur

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Protège `/api/cron/drain` et `/api/cron/notify`, appelées sans navigateur donc
sans cookie. Elles attendent `Authorization: Bearer <CRON_SECRET>`.

Sur Vercel, le cron l'envoie automatiquement dès que la variable existe sur le
projet — rien à configurer de plus. Sans elle, les deux routes répondent **503**
plutôt que de s'ouvrir : elles déclenchent des envois sur ton compte LinkedIn
et des appels facturés.

Le format `base64url` (sans `+`, `/`, `=`) évite les surprises d'échappement
dans un en-tête HTTP.

### `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

```bash
npx web-push generate-vapid-keys
```

**La clé publique va dans deux variables.** `VAPID_PUBLIC_KEY` est lue par le
serveur pour signer les envois ; `NEXT_PUBLIC_VAPID_PUBLIC_KEY` est envoyée au
navigateur, qui en a besoin pour s'abonner. Même valeur, deux noms — le préfixe
`NEXT_PUBLIC_` est ce qui autorise Next à l'exposer côté client.

La clé privée ne sort jamais du serveur.

Si tu régénères la paire, tous les abonnements existants deviennent invalides :
il faut réactiver les notifications sur chaque appareil.

### `VAPID_SUBJECT`

```
VAPID_SUBJECT=mailto:toi@tondomaine.fr
```

Ton email, au format `mailto:`. C'est le contact que les services de push
(Apple, Google) utilisent en cas de problème. Une URL `https://` convient
aussi. Pas de valeur bidon : un `mailto:admin@example.com` peut faire rejeter
les envois.

---

## 2. Supabase — la base de données

### `SUPABASE_URL`

Console Supabase → ton projet → **Project Settings ▸ Data API** → champ
**Project URL**.

Forme : `https://abcdefghijklm.supabase.co`. Pas de `/` final.

### `SUPABASE_SERVICE_ROLE_KEY`

Même écran, section **API Keys** (ou **Project Settings ▸ API**) → clé
**`service_role`**, pas `anon`.

> ⚠️ Cette clé contourne toute politique de sécurité de la base. Elle n'est
> lue que côté serveur (`src/shared/lib/db.ts` importe `server-only`, ce qui
> transforme toute fuite vers un composant client en **erreur de build**). Ne
> la mets jamais dans une variable préfixée `NEXT_PUBLIC_`.

### Avant le premier lancement

Applique le schéma : console Supabase → **SQL Editor** → colle le contenu de
[`supabase/migrations/001_init.sql`](../supabase/migrations/001_init.sql) →
**Run**.

Vérification : l'onglet **Table Editor** doit montrer `lists`, `accounts`,
`posts`, `received_comments`, `write_actions`, `sync_cursors`, `queue_state`,
`settings`, `push_subscriptions`, `sync_runs`.

---

## 3. Apify — la récupération (lecture)

### `APIFY_TOKEN`

Console Apify → **Settings ▸ API & Integrations** → **Personal API tokens** →
crée un token.

Forme : `apify_api_` suivi d'une longue chaîne.

Le plan gratuit donne ~5 $ de crédit mensuel, assez pour tester. En régime, les
actors facturent ~0,002 $ par publication et par commentaire ; 100 comptes
suivis coûtent quelques dollars par mois.

### `APIFY_POSTS_ACTOR`, `APIFY_COMMENTS_ACTOR` — optionnelles

Valeurs par défaut, déjà les bonnes :

```
APIFY_POSTS_ACTOR=harvestapi~linkedin-profile-posts
APIFY_COMMENTS_ACTOR=harvestapi~linkedin-post-comments
```

Format `utilisateur~actor` (tilde, pas slash). Ce sont des actors
« no-cookie » : ils n'utilisent jamais ton compte LinkedIn.

Tu n'as **rien à activer** sur Apify — le token suffit, les actors se lancent
à la demande. Tu peux les remplacer sans toucher au code le jour où l'un
d'eux disparaît (le marché est instable : Proxycurl a fermé en 2025).

### `APIFY_PROFILE_ACTOR` — optionnelle

```
APIFY_PROFILE_ACTOR=harvestapi~linkedin-profile-scraper
```

Récupère le **nom et la photo de profil** d'un compte. Une valeur par défaut
est fournie (celle ci-dessus) : il n'y a rien à renseigner.

Elle était vide auparavant, et c'était un trou. Les métadonnées sont bien
déduites gratuitement de la première publication récupérée — mais **seulement
si le compte a publié** sur la fenêtre d'actualisation. Un créateur importé qui
n'a rien posté depuis un mois restait sans nom et sans visage dans ses listes,
indéfiniment, sans que rien ne le signale.

Le bouton **« Photos (N) »** de l'écran Listes lance la récupération pour les
comptes concernés, par lots de cent. Coût : environ 4 $ pour mille profils —
soit ~1,50 $ une seule fois pour les 372 comptes importés. Les photos des
comptes qui publient se rafraîchissent ensuite gratuitement à chaque
actualisation, ce qui est nécessaire : les URLs du CDN LinkedIn sont signées et
expirent.

---

## 4. Unipile — l'écriture (le seul point qui engage ton compte)

Compte payant, ~49 €/mois, un seul compte LinkedIn connecté.

### `UNIPILE_DSN`

> Le DSN est **normalisé au premier envoi** : le schéma `https://` est ajouté
> s'il manque, et `/api/v1` aussi. Coller la valeur telle que le tableau de
> bord Unipile l'affiche (`api3.unipile.com:13031`) fonctionne donc. Une valeur
> inexploitable est refusée avec un message qui dit quoi corriger, au lieu d'un
> « fetch failed » au journal.

Dashboard Unipile → l'adresse de **ton** instance. Forme :

```
https://api3.unipile.com:13031/api/v1
```

Le numéro d'instance et le port te sont propres — ne recopie pas cet exemple.
Inclure `/api/v1`, sans `/` final.

### `UNIPILE_API_KEY`

Dashboard → section **Access tokens** / **API keys**. Envoyée en en-tête
`X-API-KEY`.

### `UNIPILE_ACCOUNT_ID`

Identifiant du compte LinkedIn connecté. Visible dans la liste des comptes du
dashboard après la connexion, ou par l'API :

```bash
curl -s -H "X-API-KEY: $UNIPILE_API_KEY" "$UNIPILE_DSN/accounts" | head -40
```

Prends l'`id` de la ligne dont le `type` est `LINKEDIN`.

### `UNIPILE_ROUTE_COMMENT`, `UNIPILE_ROUTE_REACTION` — optionnelles

Les chemins d'API par défaut sont `/posts/{postId}/comments` et
`/posts/reaction`. Unipile fait évoluer ses routes ; si un envoi échoue en 404,
corrige ici plutôt que dans le code :

```
UNIPILE_ROUTE_COMMENT=/posts/{postId}/comments
UNIPILE_ROUTE_REACTION=/posts/reaction
```

C'est le seul point que je n'ai pas pu tester contre l'API réelle — tu n'avais
pas encore de compte. À confronter à leur documentation au moment du
provisioning.

---

## 5. Anthropic — la génération

### `ANTHROPIC_API_KEY`

[console.anthropic.com](https://console.anthropic.com) → **API keys** →
**Create key**. Forme : `sk-ant-api03-…`.

> ⚠️ **Une clé d'API dédiée, jamais ton jeton d'abonnement Claude.** Le jeton
> OAuth de Claude Code ou de claude.ai n'est pas utilisable ici : son emploi
> hors des applications officielles viole les conditions d'utilisation
> d'Anthropic et exposerait ton compte Claude. Le code ne lit que
> `ANTHROPIC_API_KEY`, il n'y a aucun chemin d'accès à l'autre.

Coût : à `claude-haiku-4-5-20251001`, une génération consomme quelques
centaines de tokens. 25 générations par jour se comptent en centimes par mois.

### `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` — optionnelles

```
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_EFFORT=low          # low | medium | high | xhigh | max
```

Haiku est le défaut : rédiger cinquante mots selon un process fourni n'est pas
une tâche de raisonnement, c'est de la mise en forme contrainte. Si les
propositions te semblent plates une fois tes process rédigés, passe à
`claude-sonnet-5` avant de toucher à autre chose.

`ANTHROPIC_EFFORT` n'est transmis **que** pour la famille Claude 5
(`claude-opus-5`, `claude-sonnet-5`, `claude-fable-5-1`). Le paramètre
`output_config` n'existe pas sur Haiku 4.5 : le lui envoyer ferait rejeter
chaque requête. Le code teste donc le nom du modèle avant de l'inclure, et la
variable est simplement sans effet sur Haiku.

---

## 6. Les réglages — tous optionnels

```bash
APP_TIMEZONE=Europe/Paris          # fuseau des plafonds et de la fenêtre d'envoi
INITIAL_BACKFILL_DAYS=7            # profondeur du 1er passage sur un compte ajouté
RECEIVED_COMMENTS_WINDOW_DAYS=30   # fenêtre glissante des commentaires reçus
MAX_LOOKBACK_DAYS=90               # plafond de rattrapage après une longue absence
MAX_POSTS_PER_ACCOUNT=20           # garde-fou de coût, par appel
MAX_COMMENTS_PER_POST=50           # garde-fou de coût, par appel
```

Les plafonds d'envoi, la cadence et la fenêtre diurne ne sont **pas** ici : ils
se règlent dans l'app (**File ▸ Réglages**) et vivent en base, pour être
modifiables depuis le téléphone sans redéployer.

### `INGESTION_PROVIDER`, `WRITE_PROVIDER`

```bash
INGESTION_PROVIDER=apify    # ou `fake`
WRITE_PROVIDER=unipile      # ou `fake`
```

`fake` = fournisseurs en mémoire. En développement, c'est ce qui te permet de
toucher à la file d'envoi **sans envoyer de vrais commentaires depuis ton vrai
compte**. Utilise-les tant que tu n'as pas provisionné les comptes payants :

```bash
INGESTION_PROVIDER=fake WRITE_PROVIDER=fake npm run dev
```

---

## 7. Où poser les valeurs

**En local** — fichier `.env.local` à la racine. Il est déjà dans
`.gitignore` ; ne crée pas `.env` tout court, même règle mais moins explicite.

**Sur Vercel** — Project Settings ▸ Environment Variables. Coche
Production **et** Preview (sinon les déploiements de preview partent avec des
variables vides et échouent de façon opaque).

Le bloc produit par `generate-secrets.mjs` se colle tel quel dans l'import en
masse de Vercel.

---

## 8. Vérifier que tout est bon

```bash
npm run check    # typecheck + lint + tests — ne touche à aucune variable
npm run build    # échoue si une variable requise au build manque
npm run dev
```

Puis, dans l'ordre :

1. **`/login`** demande le mot de passe → `APP_PASSWORD_HASH` et
   `SESSION_SECRET` sont bons. Une redirection vers `/login?error=config`
   signale un `SESSION_SECRET` manquant.
2. **Créer une liste, y coller deux profils, actualiser.** Des publications
   remontent → `SUPABASE_*` et `APIFY_TOKEN` sont bons. Sinon, **File ▸
   Réglages ▸ Dernières actualisations** donne le message d'erreur exact.
3. **Bouton « Générer »** sur une publication → `ANTHROPIC_API_KEY` est bonne.
   Un avertissement « process non rédigé » est normal tant que tu n'as pas
   écrit tes `process/*.md` — ce n'est pas une erreur de configuration.
4. **Rédiger un commentaire.** Il apparaît en file avec une heure d'envoi.
   Après la purge, il doit être visible sur LinkedIn → les trois `UNIPILE_*`
   sont bonnes.
5. **Notifications** — File ▸ Réglages ▸ « Activer sur cet appareil ». Un échec
   pointe `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
6. **Routes cron** :

```bash
curl -i https://ton-app.vercel.app/api/cron/drain
# attendu : 401 (secret présent, en-tête absent) — surtout pas 200
curl -i -H "Authorization: Bearer $CRON_SECRET" https://ton-app.vercel.app/api/cron/drain
# attendu : 200 avec un rapport JSON
```

Un **503** au premier appel signifie `CRON_SECRET` absent. Un **200** au
premier appel serait une faille : ça voudrait dire que la route est ouverte.

---

## 9. Que faire en cas de fuite

| Ce qui a fuité | Conséquence | Action |
|---|---|---|
| `SESSION_SECRET` | N'importe qui peut forger une session | Régénère-le → tous les appareils sont déconnectés |
| `APP_PASSWORD_HASH` | Attaque hors-ligne possible, lente (310 k itérations) | Change le mot de passe et régénère le condensat |
| `SUPABASE_SERVICE_ROLE_KEY` | Accès total à la base | Révoque et régénère dans la console Supabase |
| `UNIPILE_API_KEY` | **Publication au nom de ton compte LinkedIn** | Révoque immédiatement, c'est le plus grave |
| `ANTHROPIC_API_KEY` | Consommation facturée | Révoque dans la console |
| `APIFY_TOKEN` | Consommation facturée | Révoque dans la console |
| `CRON_SECRET` | Déclenchement des envois et des récupérations | Régénère-le |
| `VAPID_PRIVATE_KEY` | Notifications usurpées | Régénère la paire → réactive sur chaque appareil |
