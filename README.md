# Routine — engagement LinkedIn

PWA mobile-first qui remplace le fil natif LinkedIn pour deux routines
quotidiennes : commenter les publications d'une liste curée de créateurs, et
répondre aux commentaires reçus sur ses propres posts.

Le principe tient en un mot : **inbox**. Une file finie, ordonnée, qu'on vide —
pas un flux infini qu'on parcourt.

- **Spécification** : [`specs/001-linkedin-engagement-inbox/spec.md`](specs/001-linkedin-engagement-inbox/spec.md)
- **Déploiement** : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md)
- **Architecture** : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Ce que l'app garantit

| Garantie | Comment |
|---|---|
| Aucune publication manquée | Curseur horodaté par compte ; il n'avance **que** sur succès, jamais sur panne du fournisseur |
| Aucun contenu algorithmique | Le fil lit une table, filtrée par liste, triée par date. Pas de score, pas de recommandation |
| Aucune publication involontaire | Toute écriture passe par une file différée, visible et annulable ; la génération IA écrit dans le champ, jamais dans la file |
| Aucune empreinte d'automatisation en lecture | La récupération passe par des scrapers tiers no-cookie, le compte LinkedIn n'est engagé **que** pour les commentaires, réponses et likes |
| Aucune restriction du compte | Plafonds journaliers, montée en charge progressive, délai aléatoire entre deux envois, fenêtre diurne, coupe-circuit automatique |

## Démarrage

```bash
npm install
cp .env.example .env.local        # puis renseigner les variables
node scripts/hash-password.mjs "ton mot de passe"   # → APP_PASSWORD_HASH
npm run dev
```

Pour développer sans compte Apify ni compte Unipile — donc sans budget et sans
risque d'envoyer un vrai commentaire :

```bash
INGESTION_PROVIDER=fake WRITE_PROVIDER=fake npm run dev
```

Le schéma de base se trouve dans [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) ;
applique-le sur ton projet Supabase avant le premier lancement.

## Vérification

```bash
npm run check     # typecheck + lint + tests
npm test          # 196 tests unitaires
npm run build     # build de production
```

Les tests couvrent la logique dont dépend la sécurité du compte et
l'exhaustivité du fil : cadence et plafonds d'envoi, coupe-circuit, curseurs
incrémentaux, normalisation des charges utiles des fournisseurs, arithmétique
de fuseau horaire, construction des prompts. Ils tournent sans réseau, sans
base de données et sans crédit dépensé.

## Les deux process de génération

`process/commentaire-sur-post.md` et `process/reponse-a-commentaire.md` sont
livrés en **placeholder**. Ils sont relus à chaque génération : les remplacer
par tes règles réelles et commiter suffit, aucun redéploiement n'est
nécessaire. Tant qu'ils portent le marqueur `**Placeholder.**`, l'app le
signale dans les réglages et au moment de chaque génération.

## Pile

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 ·
Supabase Postgres · Anthropic API · Apify (lecture) · Unipile (écriture) ·
web-push.

La direction artistique reprend celle de la plateforme Notion Club : tokens de
couleur, SF Pro Display, fond de marque, rayons, ombres et easings sont repris
du dépôt de référence. Les composants issus de transitions.dev fournissent la
structure et le mouvement, jamais les couleurs.
