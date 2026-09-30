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

  /** Ce qui ouvre le champ de commentaire natif de LinkedIn. */
  const COMMENT_BUTTON_SELECTORS = [
    "button.comment-button",
    '.social-actions-button[aria-label*="ommentaire" i]',
    'button[aria-label*="ommenter" i]',
    'button[aria-label*="omment" i]',
    '[data-view-name*="comment"] button',
  ];

  /** Le champ de saisie lui-même — Quill, dans toutes les versions connues. */
  const EDITOR_SELECTORS = [
    '.comments-comment-box .ql-editor[contenteditable="true"]',
    '.comments-comment-texteditor .ql-editor[contenteditable="true"]',
    '.editor-content .ql-editor[contenteditable="true"]',
    'div.ql-editor[contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]',
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

  /**
   * Remonte du bouton vers la publication qui le contient.
   *
   * Trois critères, dans cet ordre de confiance : un identifiant d'activité,
   * un conteneur explicitement reconnu, puis — à défaut — le premier ancêtre
   * qui porte à la fois un lien de profil et assez de texte pour être un post.
   * Le dernier critère ne suppose aucun nom de classe, ce qui est précisément
   * son intérêt le jour où LinkedIn les renomme tous.
   */
  function containerFor(button) {
    const chain = [];
    let node = button;
    for (let depth = 0; depth < 14 && node; depth += 1) {
      node = node.parentElement;
      if (!node) break;
      chain.push(node);
      if (hasActivityUrn(node)) return node;
    }
    for (const candidate of chain) {
      if (matchesAny(candidate, ["article", "div.feed-shared-update-v2", "div.occludable-update"])) {
        return candidate;
      }
    }
    for (const candidate of chain) {
      const hasProfileLink =
        typeof candidate.querySelector === "function" &&
        candidate.querySelector('a[href*="/in/"]') !== null;
      if (hasProfileLink && String(candidate.textContent || "").length > 160) return candidate;
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
    for (const anchor of commentAnchors(scope)) {
      const post = containerFor(anchor);
      if (!post) continue;
      // Une ancre est un meilleur point d'insertion qu'une barre devinée :
      // elle l'emporte sur une entrée déjà posée sans ancre.
      if (!targets.has(post) || targets.get(post) === null) targets.set(post, anchor);
    }
    // Comme pour `findPosts`, seule la publication extérieure d'un repartage
    // porte une barre d'actions.
    const posts = [...targets.keys()];
    const out = [];
    for (const post of posts) {
      const nested = posts.some(
        (other) => other !== post && typeof other.contains === "function" && other.contains(post),
      );
      if (!nested) out.push({ post, anchor: targets.get(post) });
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
      for (const selector of [...POST_SELECTORS, ...BARRE_SELECTORS, ...EDITOR_SELECTORS]) {
        counts[selector] = count(selector);
      }
      counts["button (total)"] = count("button");
    }
    return {
      counts,
      anchors: commentAnchors(document_).length,
      posts: findPosts(document_).length,
      targets: findTargets(document_).length,
    };
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
    tighten,
    commentAnchors,
    containerFor,
    diagnose,
    first,
    matchesAny,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
