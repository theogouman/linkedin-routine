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

### 4. Réglages

- **Adresse de l'app** : l'URL https de ton app Next.js, sans barre finale
- **Jeton d'accès** : la même valeur que `EXTENSION_TOKEN`

Chrome demande alors l'autorisation d'accéder à cette adresse. Elle n'est
demandée que pour ce domaine précis, au moment de l'enregistrement — pas pour
tous les sites, et pas à l'installation.

Clique **Tester la connexion** : le nom du modèle utilisé doit s'afficher.

---

## Usage

Sur `linkedin.com`, chaque publication porte un bouton **Proposer** dans sa
barre d'actions. Un clic :

1. lit le texte de la publication dans la page (aucun scraping, aucun appel à
   LinkedIn — c'est ce qui est déjà affiché) ;
2. l'envoie à ton app, qui rédige les quatre registres habituels ;
3. les affiche au fur et à mesure qu'ils arrivent, dans un panneau en bas à
   droite.

Chaque proposition est **modifiable sur place** avant insertion. « Insérer »
ouvre le champ de commentaire de LinkedIn et y écrit le texte ; « Copier » le
met dans le presse-papier. Dans les deux cas, ton choix et tes retouches
partent au journal de feedback — c'est ce qui alimente le corpus et mesure si
le générateur progresse.

Les pastilles d'intention (Question, Soutien, Avis, Humour, Désaccord)
relancent une génération orientée. « Régénérer » en relance une à registre égal.

---

## Quand ça casse

LinkedIn sert des noms de classes hachés qui changent sans préavis. Les
sélecteurs sont donc tous regroupés en tête de `src/extract.js`, en listes
ordonnées du plus spécifique au plus général. Quand quelque chose lâche, c'est
là et nulle part ailleurs.

| Symptôme | Cause probable | Où regarder |
|---|---|---|
| Aucun bouton n'apparaît | `POST_SELECTORS` ne reconnaît plus les publications | `src/extract.js` |
| Bouton mal placé | `BARRE_SELECTORS` ne trouve plus la barre d'actions | `src/extract.js` |
| « Pas assez de texte » | `TEXT_SELECTORS` ne trouve plus le corps | `src/extract.js` |
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
