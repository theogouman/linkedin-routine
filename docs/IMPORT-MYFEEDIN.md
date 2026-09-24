# Import des listes depuis MyFeedIn

Les 10 feeds MyFeedIn ont été importés comme listes de l'app, sous leurs
libellés d'origine : **372 comptes uniques, 490 rattachements**. Les décomptes
par liste correspondent exactement à ceux de MyFeedIn.

| Liste | Membres |
|---|---|
| Allan Dubos Feed | 96 |
| Maeva Audience N°2 | 96 |
| Maeva Audience N°1 | 93 |
| Réciprocité N°1 | 87 |
| Leads | 31 |
| Good ones | 27 |
| Maeva Audience N°3 | 27 |
| Clients | 15 |
| Créateurs dans l'Immo | 15 |
| Notion followers | 3 |

490 rattachements pour 372 comptes : beaucoup de profils appartiennent à
plusieurs listes, et l'import les déduplique — un même créateur n'est stocké
qu'une fois et ne sera récupéré qu'une fois, quel que soit le nombre de listes
qui le contiennent.

Les 8 contacts du CSV sans aucune liste n'ont pas été importés : une liste est
le périmètre d'attention, un compte sans liste n'apparaîtrait nulle part.

## Rejouer l'import

`import_feed(nom, profils)` est idempotent : réexécuter le même import ne crée
ni liste jumelle, ni compte en double, ni rattachement en double. Les noms et
autres métadonnées ne sont complétés que s'ils manquent — ce qui vient de
LinkedIn est plus frais que l'import.

Les URLs passées doivent être **déjà canoniques**. La fonction les valide et
refuse le reste plutôt que de les « réparer » à sa façon (cf. migration 006).

## Deux pièges rencontrés, et corrigés dans le normaliseur

**Les identifiants opaques sont sensibles à la casse.** MyFeedIn renvoie
majoritairement des URLs de la forme `/in/ACoAAAyy6A8BPf1WGmlGI2UUwvDLX4tIxpzpRrk`
— l'identifiant encodé du membre, et non le slug choisi par la personne. Le
normaliseur mettait tout en minuscules, ce qui est juste pour un slug et
produit une URL morte pour ces identifiants. Il distingue désormais les deux
formes, sur le préfixe `ACoA` et la longueur exacte de 39 caractères.

**Un slug LinkedIn peut contenir des emoji.** `/in/dorian-soler-☀️-254915147`
est un profil réel. Le motif d'identifiant, restreint aux lettres et aux
chiffres, rejetait quatre profils en silence. Il n'exclut plus que ce qui ne
peut pas être un identifiant — espaces et séparateurs de chemin — et exige au
moins une lettre ou un chiffre.

Les deux cas sont couverts par des tests dans
`src/modules/lists/lib/profile-url.test.ts`.

## Coût de la première récupération

372 comptes à amorcer. Avec `INITIAL_BACKFILL_DAYS=7`, la première
actualisation demandera au plus 7 jours de publications par compte, plafonnés
par `MAX_POSTS_PER_ACCOUNT` (20 par défaut). À ~0,002 $ la publication, un
amorçage complet coûte quelques dollars, une seule fois. Les actualisations
suivantes sont incrémentales et ne redemandent que ce qui est paru depuis.

Pour amorcer moins large, baisser `INITIAL_BACKFILL_DAYS` avant la première
actualisation — après, le curseur est posé et la fenêtre se referme d'elle-même.
