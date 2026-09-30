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

  /**
   * Extraction complète d'une publication.
   *
   * Le partage (« repost ») est traité explicitement : le commentaire se pose
   * sur la publication extérieure, mais ce qui mérite d'être commenté est
   * souvent le contenu repartagé. Les deux sont donc transmis, étiquetés, pour
   * que le générateur sache lequel est de qui.
   */
  function extractPost(post) {
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

    return {
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
    first,
    matchesAny,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
