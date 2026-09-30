# Routine LinkedIn — extension Chrome

Quatre propositions de commentaire, dans ta voix, sur chaque publication que tu
vois sur `linkedin.com`. Le générateur est celui de l'app : même cerveau, même
corpus de tes commentaires réels, mêmes contrôles, même journal de feedback.

**Rien n'est publié.** L'extension remplit le champ de commentaire de LinkedIn ;
c'est toi qui relis et qui appuies sur « Publier ».

---

## Ce qu'elle remplace

| | Avant (app seule) | Avec l'extension |
|---|---|---|
| Récupération des posts | Apify, ~60 €/mois | le fil que tu as déjà sous les yeux — 0 € |
| Publication du commentaire | Unipile, ~50 €/mois | ton propre clic — 0 € |
| Rédaction | Anthropic | Anthropic, inchangé (~2-3 €/mois) |

La curation des comptes reste à ta charge : c'est ce que fait l'extension de
listes que tu utilises déjà. Celle-ci ne s'occupe que de lire et de rédiger.

---

## Installation

### 1. Côté app

Ajoute une variable d'environnement sur Vercel, puis redéploie :

```
EXTENSION_TOKEN=<colle ici le résultat de : openssl rand -base64 32>
```

Moins de 24 caractères et les routes refusent de s'ouvrir — c'est volontaire :
une valeur de test oubliée au déploiement serait devinable.

### 2. Les icônes (une seule fois, si le dossier `icons/` est vide)

```bash
node scripts/generate-extension-icons.mjs
```

### 3. Charger l'extension

1. Ouvre `chrome://extensions`
2. Active **Mode développeur** (en haut à droite)
3. **Charger l'extension non empaquetée** → choisis le dossier `extension/`
4. La page de réglages s'ouvre toute seule
5. **Recharge tes onglets LinkedIn déjà ouverts.** Chrome n'injecte pas un
   script de contenu dans les onglets ouverts avant l'installation : sans ce
   rechargement, il ne se passera rien, et c'est la cause numéro un de
   « aucun bouton n'apparaît ».

### 4. Réglages

- **Adresse de l'app** : l'URL https de ton app Next.js, sans barre finale
- **Jeton d'accès** : la même valeur que `EXTENSION_TOKEN`

Chrome demande alors l'autorisation d'accéder à cette adresse. Elle n'est
demandée que pour ce domaine précis, au moment de l'enregistrement — pas pour
tous les sites, et pas à l'installation.

Clique **Tester la connexion** : le nom du modèle utilisé doit s'afficher.

---

## Usage

Sur `linkedin.com`, deux points d'entrée.

Un **bouton rond en bas à gauche**, toujours présent, avec le nombre de
publications détectées. Il agit sur celle qui est au centre de l'écran. Sa
seule présence prouve que l'extension tourne ; son compteur, qu'elle voit
quelque chose.

Et une **icône** dans la barre d'actions de chaque publication, juste à côté de
« Commenter ». Un clic :

1. lit le texte de la publication dans la page (aucun scraping, aucun appel à
   LinkedIn — c'est ce qui est déjà affiché) ;
2. l'envoie à ton app, qui rédige les quatre registres habituels ;
3. les affiche au fur et à mesure qu'elles arrivent, **dans la carte de la
   publication elle-même**, sous la barre d'actions — là où LinkedIn ouvrirait
   son propre champ de commentaire. La carte grandit en douceur à chaque
   proposition qui arrive (`card resize` de transitions.dev).

Chaque proposition est **modifiable sur place** avant insertion. « Insérer »
ouvre le champ de commentaire de LinkedIn et y écrit le texte ; « Copier » le
met dans le presse-papier. Dans les deux cas, ton choix et tes retouches
partent au journal de feedback — c'est ce qui alimente le corpus et mesure si
le générateur progresse.

Les pastilles d'intention (Question, Soutien, Avis, Humour, Désaccord)
relancent une génération orientée. « Régénérer » en relance une à registre égal.

---

## Quand ça casse

**Commence par le diagnostic.** Page de réglages → **Relire le diagnostic**. Il
dit ce que le script voit réellement sur ton onglet LinkedIn : combien de
boutons « Commenter » repérés, combien de conteneurs reconnus, et le compte de
chaque sélecteur un par un, **et le texte réellement lu sur la première
publication**. Un relevé vide veut dire que le script ne s'est jamais exécuté —
recharge l'onglet.

LinkedIn sert des noms de classes hachés qui changent sans préavis. La parade
tient en deux stratégies jouées ensemble : les conteneurs par sélecteur, et le
bouton « Commenter » par son libellé accessible. Le texte suit la même logique :
les sélecteurs d'abord, puis, si aucun ne répond, une recherche par la structure
— le bloc de texte le plus long situé AU-DESSUS du bouton « Commenter », ce qui
écarte mécaniquement les commentaires des autres, toujours en dessous. La seconde est la plus solide,
parce que LinkedIn doit garder ce libellé pour les lecteurs d'écran. Tout est
regroupé en tête de `src/extract.js`. Quand quelque chose lâche, c'est là et
nulle part ailleurs.

| Symptôme | Cause probable | Où regarder |
|---|---|---|
| Rien du tout, pas même le bouton rond | le script de contenu ne tourne pas | recharge l'onglet LinkedIn |
| Bouton rond présent, compteur à 0 | ni les conteneurs ni les ancres ne répondent | `POST_SELECTORS`, `commentAnchors` |
| Bouton rond présent, pas de bouton par post | l'insertion échoue | `decorate()` dans `src/content.js` |
| Bouton mal placé | `BARRE_SELECTORS` ne trouve plus la barre d'actions | `src/extract.js` |
| « Aucun texte trouvé » | ni `TEXT_SELECTORS` ni la recherche structurelle | `src/extract.js`, et envoie le diagnostic |
| « Champ de commentaire introuvable » | `EDITOR_SELECTORS` ou `COMMENT_BUTTON_SELECTORS` | `src/extract.js` |
| Texte inséré mais « Publier » reste grisé | Quill n'a pas vu la saisie | `fill()` dans `src/content.js` |
| « Jeton refusé » | `EXTENSION_TOKEN` diffère entre l'app et les réglages | les deux |
| « EXTENSION_TOKEN n'est pas configuré » | variable absente sur Vercel, ou déploiement non refait | Vercel |
| « App injoignable » | adresse fausse, ou permission d'hôte non accordée | réglages de l'extension |

Pour lire les erreurs du service worker : `chrome://extensions` → l'extension →
**service worker**. Pour celles du script de contenu : la console de l'onglet
LinkedIn.

Les tests de l'extraction tournent avec le reste :

```bash
npm test
```

---

## Ce qui n'y est pas, volontairement

- **Aucune publication automatique.** L'extension ne clique jamais sur
  « Publier ». C'est la contrainte du projet depuis le premier jour.
- **Aucune génération non demandée.** Un clic, une génération. Générer pour
  tout ce qui défile ferait payer des dizaines d'appels pour des publications
  qu'on ne commentera jamais.
- **Aucune clé d'API dans l'extension.** Un dossier d'extension est lisible par
  quiconque a accès à la machine. La clé Anthropic ne quitte pas le serveur ;
  l'extension ne porte qu'un jeton d'accès à ton app, et ce jeton reste dans le
  service worker — les scripts de la page LinkedIn ne peuvent pas le lire.
- **Aucun en-tête CORS ouvert à `linkedin.com`.** L'appel part du service
  worker, qui a la permission d'hôte et n'y est pas soumis. Ouvrir la route à
  l'origine de LinkedIn la rendrait joignable par n'importe quel script de la
  page.
