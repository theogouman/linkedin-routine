/**
 * Lecture d'une publication dans le DOM de LinkedIn.
 *
 * Tout ce que ce fichier contient est fragile par nature : LinkedIn sert des
 * noms de classes hachés qui changent sans préavis. La parade n'est pas de
 * trouver LE bon sélecteur, c'est d'en essayer plusieurs et de dégrader
 * proprement. Chaque cible a donc une liste ordonnée, du plus spécifique au
 * plus général, et l'échec rend une valeur vide plutôt qu'une exception.
 *
 * Les attributs qui bougent le moins sont les attributs de données
 * (`data-urn`, `data-id`) et les rôles ARIA, parce qu'ils portent du sens
 * fonctionnel ; les classes purement visuelles sont les premières à changer.
 * Les listes sont ordonnées en conséquence.
 *
 * Fichier sans dépendance et sans accès au DOM à l'import : il est chargé tel
 * quel comme script de contenu, et importé tel quel par les tests.
 */

(function attachExtract(root) {
  "use strict";

  /** Conteneurs de publication, du plus fiable au plus général. */
  const POST_SELECTORS = [
    '[data-urn^="urn:li:activity:"]',
    '[data-id^="urn:li:activity:"]',
    "div.feed-shared-update-v2",
    "div.occludable-update",
  ];

  const AUTHOR_SELECTORS = [
    '.update-components-actor__title span[aria-hidden="true"]',
    ".update-components-actor__name",
    ".update-components-actor__title",
    ".feed-shared-actor__name",
    '[data-view-name="feed-actor-name"]',
  ];

  const TEXT_SELECTORS = [
    ".update-components-update-v2__commentary",
    ".feed-shared-inline-show-more-text",
    ".update-components-text",
    ".feed-shared-update-v2__description",
    ".feed-shared-text",
    '[data-view-name="feed-commentary"]',
    '[data-view-name*="commentary"]',
  ];

  /**
   * Ordre volontaire : la vidéo et le document l'emportent sur l'image, parce
   * qu'ils embarquent une vignette qui est, elle, une image. Tester l'image en
   * premier classerait tous les carrousels comme des photos.
   */
  const MEDIA_SELECTORS = [
    ["video", ["video", ".update-components-linkedin-video", ".video-s-loader", '[class*="video-player"]']],
    ["document", [".update-components-document", ".document-s-container", 'iframe[title*="ocument" i]', '[class*="carousel"]']],
    ["article", [".update-components-article", ".feed-shared-article", ".update-components-entity"]],
    ["image", [".update-components-image", ".feed-shared-image", ".update-components-linkedin-image"]],
  ];

  /**
   * Ce qui ouvre le champ de commentaire natif de LinkedIn.
   *
   * Le `:not([data-lr])` n'est pas une précaution de style, c'est un correctif.
   * Notre propre bouton porte « Proposer quatre commentaires » comme nom
   * accessible : il répondait à `[aria-label*="omment"]`, et comme il est posé
   * juste après « Commenter », il arrivait le premier dans l'ordre du document.
   * « Insérer » cliquait donc sur NOTRE bouton — ce qui relançait une
   * génération au lieu d'ouvrir le champ, puis échouait sur « champ de
   * commentaire introuvable ». Tout ce que l'extension pose dans la page porte
   * `data-lr` ; rien de ce qu'elle cherche ne doit le porter.
   */
  const COMMENT_BUTTON_SELECTORS = [
    "button.comment-button:not([data-lr])",
    '.social-actions-button[aria-label*="ommentaire" i]:not([data-lr])',
    'button[aria-label*="ommenter" i]:not([data-lr])',
    'button[aria-label*="omment" i]:not([data-lr])',
    '[data-view-name*="comment"] button:not([data-lr])',
  ];

  /**
   * Le champ de saisie lui-même.
   *
   * Quill (`.ql-editor`) dans les versions connues, mais le dernier de la liste
   * ne suppose plus rien : un `contenteditable` à l'intérieur de la carte d'une
   * publication est le champ de commentaire, quel que soit ce que LinkedIn met
   * autour. Le composeur de publication du haut du fil n'est pas concerné — la
   * recherche est toujours faite dans la carte, jamais dans le document.
   */
  const EDITOR_SELECTORS = [
    '.comments-comment-box .ql-editor[contenteditable="true"]',
    '.comments-comment-texteditor .ql-editor[contenteditable="true"]',
    '.editor-content .ql-editor[contenteditable="true"]',
    'div.ql-editor[contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]:not([data-lr])',
    '[contenteditable="true"]:not([data-lr])',
  ];

  const BARRE_SELECTORS = [
    ".feed-shared-social-action-bar",
    ".social-actions-buttons",
    ".feed-shared-social-actions",
    ".social-details-social-activity",
  ];

  function first(scope, selectors) {
    if (!scope || typeof scope.querySelector !== "function") return null;
    for (const selector of selectors) {
      try {
        const found = scope.querySelector(selector);
        if (found) return found;
      } catch {
        // Un sélecteur qu'un vieux moteur refuse ne doit pas couper la liste.
      }
    }
    return null;
  }

  function matchesAny(element, selectors) {
    if (!element || typeof element.matches !== "function") return false;
    return selectors.some((selector) => {
      try {
        return element.matches(selector);
      } catch {
        return false;
      }
    });
  }

  /**
   * Nettoyage du texte relevé.
   *
   * Trois artefacts propres à LinkedIn, qui se retrouveraient sinon dans le
   * prompt et donc dans les commentaires :
   *  - le « …voir plus » du repli, qui est un bouton et non du texte ;
   *  - le mot `hashtag` inséré avant chaque `#` pour les lecteurs d'écran ;
   *  - les espaces insécables, qui font de faux mots.
   */
  function cleanPostText(raw) {
    if (typeof raw !== "string") return "";
    return raw
      .replace(/ /g, " ")
      .replace(/\r\n?/g, "\n")
      // `hashtag#nocode` et `hashtag #nocode` viennent tous deux du balisage
      // d'accessibilité : seul le `#` est visible à l'écran.
      .replace(/\bhashtag\s*#/g, "#")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      // Le fil ouvre chaque carte par un intitulé destiné aux lecteurs
      // d'écran, et annonce le degré de relation sur sa propre ligne. Les deux
      // sont invisibles à l'écran mais bien présents dans `innerText`, donc
      // dans le prompt : « Post du fil d'actualité » y passait pour du texte.
      .replace(/^(?:post du fil d['\u2019]actualit\u00e9|publication du fil|feed post)\n*/i, "")
      .replace(/^\u2022 ?(?:1er|2e|3e\+?|1st|2nd|3rd\+?|vous|you|suivi|following)(?:\n|$)/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/(?:…|\.\.\.)\s*(?:voir plus|afficher plus|see more|more)\s*$/i, "")
      .replace(/\s*(?:voir moins|see less)\s*$/i, "")
      .replace(/…\s*$/, "")
      .trim();
  }

  function readText(element) {
    if (!element) return "";
    const raw = typeof element.innerText === "string" && element.innerText !== ""
      ? element.innerText
      : element.textContent || "";
    return cleanPostText(raw);
  }

  /**
   * Identifiant d'activité, lu sur l'attribut de données du conteneur.
   *
   * C'est le même nombre que le `activity-<n>` des URL LinkedIn. Il ne sert
   * qu'à deux choses ici : dédoublonner les boutons injectés, et reconstruire
   * un lien vers le post pour le journal.
   */
  function activityId(element) {
    if (!element || typeof element.getAttribute !== "function") return null;
    for (const attribute of ["data-urn", "data-id", "data-activity-urn"]) {
      const value = element.getAttribute(attribute);
      const match = value && /urn:li:(?:activity|ugcPost|share):(\d{6,})/.exec(value);
      if (match) return match[1];
    }
    return null;
  }

  function postUrl(id) {
    return id ? `https://www.linkedin.com/feed/update/urn:li:activity:${id}/` : null;
  }

  /**
   * Reconnaît l'entête auteur sans s'appuyer sur un nom de classe.
   *
   * Un lien de profil qui porte une image, c'est l'avatar — et l'avatar est
   * dans l'entête, jamais dans le corps. Une mention citée au fil du texte est
   * un lien de profil, elle aussi, mais sans image : le critère les sépare.
   */
  function holdsAuthorHeader(node) {
    return first(node, ['a[href*="/in/"] img', 'a[href*="/company/"] img']) !== null;
  }

  function detectMedia(post) {
    for (const [kind, selectors] of MEDIA_SELECTORS) {
      if (first(post, selectors)) return kind;
    }
    return "none";
  }

  // ── Texte, quand aucun sélecteur ne répond ────────────────────────────────
  /**
   * Descend tant qu'un enfant unique porte l'essentiel du texte.
   *
   * Le bloc le plus long d'une publication englobe souvent l'entête auteur ET
   * le corps. Resserrer sur l'enfant dominant écarte l'entête sans avoir à le
   * reconnaître — ce qui est justement l'intérêt, puisqu'on est ici parce que
   * plus aucun nom de classe ne répond.
   */
  function tighten(node) {
    let current = node;
    for (let depth = 0; depth < 12; depth += 1) {
      const total = String(current.textContent || "").length;
      if (total === 0) break;
      let dominant = null;
      for (const child of current.children || []) {
        if (String(child.textContent || "").length >= total * 0.85) {
          dominant = child;
          break;
        }
      }
      if (!dominant) break;
      current = dominant;
    }
    return current;
  }

  /**
   * Le corps de la publication, trouvé sans s'appuyer sur un seul nom de classe.
   *
   * Deux règles de structure, vraies quel que soit le balisage :
   *
   *  1. **Le texte d'une publication est AU-DESSUS du bouton « Commenter ».**
   *     Les commentaires déjà chargés sont en dessous, et ils peuvent
   *     largement dépasser le post en volume. C'est ce filtre de position qui
   *     empêche de commenter les commentaires des autres.
   *  2. **Un bloc qui contient une zone de saisie n'est pas du texte lu.**
   *
   * Parmi ce qui reste, le bloc le plus long, resserré sur son enfant dominant.
   */
  function densestTextBlock(post, anchor) {
    // Deux passes : la première écarte tout bloc qui englobe l'entête auteur,
    // la seconde ne l'écarte plus. Sans la première, le bloc le plus long
    // d'une publication brève — une vidéo, deux lignes de texte — est la carte
    // entière, et ce qui remontait était le nom de l'auteur suivi de son
    // titre. Sans la seconde, une carte dont le corps est indissociable de
    // l'entête ne rendrait plus rien du tout.
    return pickDensest(post, anchor, true) || pickDensest(post, anchor, false);
  }

  function pickDensest(post, anchor, avoidHeader) {
    let nodes;
    try {
      nodes = post.querySelectorAll("div, span, p, section, article");
    } catch {
      return null;
    }

    let best = null;
    let bestLength = 0;
    for (const node of nodes) {
      if (anchor && typeof node.contains === "function" && node.contains(anchor)) continue;
      // 4 = DOCUMENT_POSITION_FOLLOWING : l'ancre vient après ce nœud.
      if (
        anchor &&
        typeof node.compareDocumentPosition === "function" &&
        (node.compareDocumentPosition(anchor) & 4) === 0
      ) {
        continue;
      }
      if (
        typeof node.querySelector === "function" &&
        node.querySelector('[contenteditable="true"], textarea, form')
      ) {
        continue;
      }
      if (avoidHeader && holdsAuthorHeader(node)) continue;
      const length = String(node.textContent || "").trim().length;
      if (length > bestLength) {
        bestLength = length;
        best = node;
      }
    }

    if (best === null || bestLength < 40) return null;
    return tighten(best);
  }

  /**
   * Extraction complète d'une publication.
   *
   * Le partage (« repost ») est traité explicitement : le commentaire se pose
   * sur la publication extérieure, mais ce qui mérite d'être commenté est
   * souvent le contenu repartagé. Les deux sont donc transmis, étiquetés, pour
   * que le générateur sache lequel est de qui.
   */
  function extractPost(post, anchor) {
    const id = activityId(post);
    const author = readText(first(post, AUTHOR_SELECTORS));

    // Le conteneur de texte du repartage est imbriqué : on prend le premier
    // pour le commentaire de surface, et le second, s'il existe, pour l'original.
    const textNodes = [];
    for (const selector of TEXT_SELECTORS) {
      let found;
      try {
        found = post.querySelectorAll(selector);
      } catch {
        continue;
      }
      if (found && found.length > 0) {
        for (const node of found) textNodes.push(node);
        break;
      }
    }

    const parts = textNodes.map(readText).filter((text) => text !== "");
    // Une publication répète parfois son texte dans deux nœuds emboîtés :
    // on écarte ce qui est déjà contenu dans ce qu'on a gardé.
    const unique = [];
    for (const part of parts) {
      if (!unique.some((kept) => kept.includes(part))) unique.push(part);
    }

    let body = unique[0] ?? "";
    if (unique.length > 1) {
      body = `${unique[0]}\n\n[Publication repartagée]\n${unique.slice(1).join("\n\n")}`;
    }

    // Aucun sélecteur n'a répondu : on cherche le texte par la structure.
    let source = body === "" ? "aucune" : "selecteur";
    if (body.length < 12) {
      const fallback = readText(densestTextBlock(post, anchor));
      if (fallback.length > body.length) {
        body = fallback;
        source = "structure";
      }
    }

    return {
      source,
      id,
      url: postUrl(id),
      authorName: author === "" ? null : author,
      body,
      media: detectMedia(post),
    };
  }

  /** Les conteneurs de publication de la page, sans les imbriqués. */
  function findPosts(scope) {
    const document_ = scope || (typeof document !== "undefined" ? document : null);
    if (!document_ || typeof document_.querySelectorAll !== "function") return [];
    const seen = new Set();
    for (const selector of POST_SELECTORS) {
      let found;
      try {
        found = document_.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const element of found) seen.add(element);
    }
    const all = [...seen];
    // Un repartage contient une publication : seule l'extérieure porte la
    // barre d'actions, donc seule elle doit recevoir un bouton.
    return all.filter((element) => !all.some((other) => other !== element && other.contains(element)));
  }

  // ── Détection par ancre fonctionnelle ─────────────────────────────────────
  /**
   * Deuxième stratégie de détection, et la plus solide des deux.
   *
   * Les noms de classes de LinkedIn sont hachés et changent ; le bouton
   * « Commenter », lui, doit rester annoncé aux lecteurs d'écran, sous un
   * libellé que les utilisateurs lisent. C'est donc l'élément le plus stable de
   * toute la publication — et accessoirement l'endroit exact où poser le nôtre.
   *
   * On écarte « 12 commentaires », qui ouvre le fil et ne commence pas par le
   * verbe : `^commenter\b` ne peut pas correspondre à « commentaires », et
   * `^comment\b` pas davantage.
   */
  function commentAnchors(scope) {
    const document_ = scope || (typeof document !== "undefined" ? document : null);
    if (!document_ || typeof document_.querySelectorAll !== "function") return [];
    const found = [];
    for (const button of document_.querySelectorAll("button")) {
      if (button.hasAttribute?.("data-lr")) continue;
      const label = String(
        button.getAttribute?.("aria-label") || button.textContent || "",
      )
        .trim()
        .toLowerCase();
      if (label === "") continue;
      if (/^(?:commenter|comment)\b/.test(label) || /^(?:commenter|comment on)\s/.test(label)) {
        found.push(button);
      }
    }
    return found;
  }

  function hasActivityUrn(element) {
    if (!element || typeof element.getAttribute !== "function") return false;
    const value = `${element.getAttribute("data-urn") || ""} ${element.getAttribute("data-id") || ""}`;
    return /urn:li:(?:activity|ugcPost|share):\d{6,}/.test(value);
  }

  /** Noms qu'a portés la carte d'une publication, au fil des versions. */
  const CONTAINER_HINTS = [
    "article",
    "div.feed-shared-update-v2",
    "div.occludable-update",
    "[data-finite-scroll-hook-item]",
  ];

  /** Un lien de profil et de quoi remplir une publication. */
  function looksLikePost(element) {
    if (first(element, ['a[href*="/in/"]', 'a[href*="/company/"]']) === null) return false;
    return String((element && element.textContent) || "").length > 160;
  }

  /**
   * Remonte du bouton vers la publication qui le contient.
   *
   * La contrainte qui tient tout le reste : **une publication porte exactement
   * un bouton « Commenter »**. La remontée s'arrête donc dès qu'un ancêtre en
   * contient un second — un tel ancêtre est le fil, ou un bloc de plusieurs
   * cartes, jamais une carte.
   *
   * C'est ce garde-fou qui manquait, et son absence se lisait dans le relevé :
   * huit boutons « Commenter » repérés, une seule cible retenue. Le dernier
   * critère — un lien de profil et beaucoup de texte — est vrai du fil entier
   * autant que d'une publication ; il rendait donc le fil, qui contenait les
   * sept autres cartes, que le filtre d'imbrication écartait à leur tour. Une
   * cible pour huit publications, et un bouton introuvable là où on le
   * cherchait.
   *
   * La borne posée, la remontée peut être profonde sans danger — et elle doit
   * l'être : LinkedIn enfouit ce bouton une quinzaine de niveaux sous la carte,
   * parfois davantage. Quatorze n'y suffisaient plus.
   */
  function containerFor(button, anchors) {
    const others = Array.isArray(anchors) ? anchors.filter((other) => other !== button) : [];
    const chain = [];
    let node = button;
    for (let depth = 0; depth < 24 && node; depth += 1) {
      node = node.parentElement;
      if (!node) break;
      const tag = String(node.tagName || "").toUpperCase();
      if (tag === "BODY" || tag === "HTML") break;
      const swallowsAnother = others.some(
        (other) => typeof node.contains === "function" && node.contains(other),
      );
      if (swallowsAnother) break;
      chain.push(node);
      if (hasActivityUrn(node)) return node;
    }
    for (const candidate of chain) {
      if (matchesAny(candidate, CONTAINER_HINTS)) return candidate;
    }
    // Sans repère nommé, le plus GRAND ancêtre de la chaîne : il ne porte
    // qu'un « Commenter », puisque le suivant en portait deux. C'est la carte,
    // et prendre le plus grand garantit qu'elle contient tout son texte.
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      if (looksLikePost(chain[index])) return chain[index];
    }
    return null;
  }

  /**
   * La barre d'actions qui porte « Commenter », trouvée sans nom de classe.
   *
   * Elle se reconnaît à ce qu'elle fait : réunir plusieurs boutons sur une
   * ligne — J'aime, Commenter, Republier, Envoyer. Le premier ancêtre de
   * l'ancre qui en contient au moins trois est donc la barre, et c'est le plus
   * petit qui satisfait ce critère, jamais la carte entière.
   *
   * Ce repère sert à poser le bloc des propositions DANS la carte, sous la
   * barre, là où LinkedIn ouvre son propre champ. Remonter jusqu'à l'enfant
   * direct du conteneur, comme on le faisait, sortait du cadre blanc : le
   * conteneur trouvé par l'ancre est plus large que la carte visible.
   */
  function actionBarFor(anchor, post) {
    let node = anchor;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      node = node.parentElement;
      if (!node || node === post) break;
      let buttons;
      try {
        buttons = node.querySelectorAll("button:not([data-lr])");
      } catch {
        continue;
      }
      if (buttons.length >= 3) return node;
    }
    return null;
  }

  /**
   * Les publications à décorer, avec le point d'insertion quand on le connaît.
   *
   * Les deux stratégies sont jouées, pas l'une OU l'autre : celle par conteneur
   * trouve des publications dont le bouton « Commenter » n'est pas encore
   * rendu, celle par ancre en trouve quand tous les noms de classes ont changé.
   * La fusion se fait sur l'élément conteneur, donc sans doublon.
   */
  function findTargets(scope) {
    const targets = new Map();
    for (const post of findPosts(scope)) targets.set(post, null);
    // La liste entière est transmise à chaque remontée : c'est elle qui borne
    // l'ascension à la carte d'une seule publication.
    const anchors = commentAnchors(scope);
    for (const anchor of anchors) {
      const post = containerFor(anchor, anchors);
      if (!post) continue;
      // Une ancre est un meilleur point d'insertion qu'une barre devinée :
      // elle l'emporte sur une entrée déjà posée sans ancre.
      if (!targets.has(post) || targets.get(post) === null) targets.set(post, anchor);
    }
    // Comme pour `findPosts`, seule la publication extérieure d'un repartage
    // porte une barre d'actions.
    const posts = [...targets.keys()];
    const holds = (parent, child) =>
      parent !== child && typeof parent.contains === "function" && parent.contains(child);
    const out = [];
    for (const post of posts) {
      if (posts.some((other) => holds(other, post))) continue;
      let anchor = targets.get(post);
      if (!anchor) {
        // La cible imbriquée qu'on vient d'écarter portait peut-être l'ancre.
        // La remonter vaut mieux que de deviner une barre d'actions sur la
        // publication gardée.
        for (const other of posts) {
          if (holds(post, other) && targets.get(other)) {
            anchor = targets.get(other);
            break;
          }
        }
      }
      out.push({ post, anchor: anchor ?? null });
    }
    return out;
  }

  /**
   * Compte ce que chaque sélecteur trouve réellement dans la page.
   *
   * Quand rien n'apparaît, la question n'est pas « pourquoi » mais « lequel a
   * lâché ». Ce relevé y répond en un coup d'œil, sans avoir à ouvrir les
   * outils de développement ni à me décrire ce qu'on voit.
   */
  function diagnose(scope) {
    const document_ = scope || (typeof document !== "undefined" ? document : null);
    const counts = {};
    const count = (selector) => {
      try {
        return document_.querySelectorAll(selector).length;
      } catch {
        return -1;
      }
    };
    if (document_ && typeof document_.querySelectorAll === "function") {
      for (const selector of [
        ...POST_SELECTORS,
        ...BARRE_SELECTORS,
        ...TEXT_SELECTORS,
        ...AUTHOR_SELECTORS,
        ...EDITOR_SELECTORS,
      ]) {
        counts[selector] = count(selector);
      }
      counts["button (total)"] = count("button");
    }
    const anchors = commentAnchors(document_);
    return {
      counts,
      anchors: anchors.length,
      posts: findPosts(document_).length,
      targets: findTargets(document_).length,
      // La signature des cartes atteintes par l'ancre, et non par un nom de
      // classe. Quand plus aucun sélecteur ne répond — c'est arrivé —, c'est
      // la seule ligne du relevé qui dise comment LinkedIn nomme son balisage
      // aujourd'hui. Sans elle, la mise à jour des sélecteurs se fait en
      // devinant.
      conteneurs: anchors.slice(0, 3).map((anchor) => signature(containerFor(anchor, anchors))),
    };
  }

  /** Description courte d'un élément, lisible dans le relevé. */
  function signature(element) {
    if (!element || typeof element.getAttribute !== "function") return "introuvable";
    const tag = String(element.tagName || "?").toLowerCase();
    const view = element.getAttribute("data-view-name");
    const urn = element.getAttribute("data-urn") || element.getAttribute("data-id");
    const raw = element.className;
    const classes =
      typeof raw === "string"
        ? raw.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")
        : "";
    return (
      tag +
      (view ? `[data-view-name="${view}"]` : "") +
      (urn ? `[${urn}]` : "") +
      (classes ? `.${classes}` : "")
    );
  }

  root.LRExtract = {
    POST_SELECTORS,
    EDITOR_SELECTORS,
    COMMENT_BUTTON_SELECTORS,
    BARRE_SELECTORS,
    cleanPostText,
    readText,
    activityId,
    postUrl,
    detectMedia,
    extractPost,
    findPosts,
    findTargets,
    densestTextBlock,
    holdsAuthorHeader,
    looksLikePost,
    signature,
    tighten,
    actionBarFor,
    commentAnchors,
    containerFor,
    diagnose,
    first,
    matchesAny,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
