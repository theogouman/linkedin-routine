/**
 * Le script de contenu : un bouton par publication, un bloc dans la carte,
 * une insertion.
 *
 * Trois règles portées ici et nulle part ailleurs.
 *
 *  1. **Rien n'est généré sans un clic.** Le fil défile vite ; générer pour
 *     tout ce qui passe à l'écran ferait payer des dizaines d'appels pour des
 *     publications qu'on ne commentera jamais. Un bouton par publication, une
 *     génération quand on le presse.
 *
 *  2. **Rien n'est publié.** L'extension remplit le champ de commentaire de
 *     LinkedIn ; c'est Théo qui appuie sur « Publier ». Aucune écriture
 *     automatique, jamais — c'est la contrainte du projet depuis le début, et
 *     c'est aussi ce qui rend l'outil acceptable vis-à-vis de LinkedIn.
 *
 *  3. **Aucun secret ici.** La clé Anthropic reste sur le serveur. L'extension
 *     ne porte qu'un jeton d'accès à l'app, et ce jeton ne sort pas du monde
 *     isolé du script de contenu — les scripts de la page ne peuvent pas le lire.
 */

(function main() {
  "use strict";

  const {
    extractPost,
    findTargets,
    diagnose,
    first,
    EDITOR_SELECTORS,
    COMMENT_BUTTON_SELECTORS,
    BARRE_SELECTORS,
  } = globalThis.LRExtract;
  const panel = globalThis.LRPanel;

  /** Publication ouverte dans le bloc, pour savoir où insérer. */
  let current = null;
  let generationId = null;
  let port = null;

  // ── Styles posés dans la page ─────────────────────────────────────────────
  /*
   * Le bloc `card resize` de transitions.dev (`01-card-resize.md`), à une
   * différence près : ses deux variables sont posées sur `.lr-slot` au lieu de
   * `:root`. On écrit dans le document de LinkedIn — y déclarer des variables
   * globales, c'est risquer d'en écraser une des leurs.
   */
  const STYLES = `
    .lr-trigger.lr-trigger {
      display: inline-flex; align-items: center; justify-content: center;
      margin: 0 2px; padding: 6px; width: 32px; height: 32px;
      border: 0; border-radius: 8px; cursor: pointer;
      background: transparent; color: #e0625a;
    }
    .lr-trigger.lr-trigger:hover { background: rgba(224,98,90,.12); }
    .lr-trigger.lr-trigger[disabled] { opacity: .5; cursor: default; }
    .lr-trigger.lr-trigger svg { width: 18px; height: 18px; }

    .lr-slot.lr-slot {
      --lr-resize-dur: 300ms;
      --lr-resize-ease: cubic-bezier(0.22, 1, 0.36, 1);
      display: block; overflow: hidden;
    }
    .lr-slot.t-resize {
      transition:
        width  var(--lr-resize-dur) var(--lr-resize-ease),
        height var(--lr-resize-dur) var(--lr-resize-ease);
      will-change: width, height;
    }
    @media (prefers-reduced-motion: reduce) {
      .lr-slot.t-resize { transition: none !important; }
    }

    .lr-fab.lr-fab {
      position: fixed; left: 18px; bottom: 18px; z-index: 2147482000;
      width: 44px; height: 44px; border: 0; border-radius: 50%; cursor: pointer;
      background: #e0625a; color: #fff; padding: 0;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 6px 20px rgba(0,0,0,.26);
    }
    .lr-fab.lr-fab:hover { background: #cf554d; }
    .lr-fab.lr-fab svg { width: 22px; height: 22px; }
    .lr-fab-count.lr-fab-count {
      position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px;
      border-radius: 9px; background: #1a1a1a; color: #fff;
      font: 600 11px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center; padding: 0 4px;
    }
    .lr-toast.lr-toast {
      position: fixed; left: 18px; bottom: 74px; z-index: 2147482000;
      max-width: 340px; padding: 10px 13px; border-radius: 10px;
      background: #1a1a1a; color: #fff;
      font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,.3);
    }
  `;

  function injectStyles() {
    if (document.getElementById("lr-styles")) return;
    const style = document.createElement("style");
    style.id = "lr-styles";
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
  }

  function sparkle() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zm6.5 10l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z",
    );
    svg.appendChild(path);
    return svg;
  }

  // ── Bouton par publication ────────────────────────────────────────────────
  function makeButton(post, anchor) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lr-trigger";
    button.appendChild(sparkle());
    // Icône seule : le libellé vit dans l'infobulle et le nom accessible, pas
    // à l'écran — la barre d'actions de LinkedIn est déjà chargée.
    button.title = "Proposer quatre commentaires";
    button.setAttribute("aria-label", "Proposer quatre commentaires");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      start(post, anchor);
    });
    return button;
  }

  /**
   * Pose le bouton, si la publication n'en a pas déjà un.
   *
   * La présence du bouton est vérifiée dans le DOM et non mémorisée dans un
   * attribut : LinkedIn reconstruit ses barres d'actions à chaque réaction, ce
   * qui emporte notre bouton. Un marqueur survivrait à cette reconstruction et
   * empêcherait de le remettre — la publication resterait muette jusqu'au
   * rechargement.
   */
  function decorate(post, anchor) {
    if (post.querySelector(".lr-trigger")) return;
    const button = makeButton(post, anchor);

    // Juste après « Commenter » quand on l'a : c'est le point d'insertion le
    // plus sûr, puisque c'est l'élément qui a servi à trouver la publication.
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(button, anchor.nextSibling);
      return;
    }

    const bar = first(post, BARRE_SELECTORS);
    if (bar) {
      bar.appendChild(button);
      return;
    }

    // Sans rien de reconnu, on ajoute une ligne à la fin plutôt que de
    // renoncer : le bouton doit exister même si LinkedIn a tout renommé.
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:flex-end;padding:4px 12px 8px;";
    row.appendChild(button);
    post.appendChild(row);
  }

  /** Publications repérées au dernier passage, avec leur point d'insertion. */
  let targets = [];

  function sweep() {
    injectStyles();
    mountFab();
    try {
      targets = findTargets(document);
    } catch {
      targets = [];
    }
    for (const { post, anchor } of targets) {
      try {
        decorate(post, anchor);
      } catch {
        // Une publication au balisage inattendu ne doit pas arrêter les autres.
      }
    }
    updateFab(targets.length);
    report(targets.length);
  }

  // Le fil est virtualisé : les publications apparaissent au défilement. Un
  // observateur groupé, et non un intervalle, pour ne rien faire quand rien ne
  // bouge — c'est la majorité du temps.
  let pending = 0;
  function schedule() {
    if (pending) return;
    pending = setTimeout(() => {
      pending = 0;
      sweep();
    }, 350);
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  sweep();

  // ── Bouton flottant ───────────────────────────────────────────────────────
  /**
   * Le point d'entrée qui ne peut pas disparaître.
   *
   * Les boutons par publication dépendent du balisage de LinkedIn ; celui-ci ne
   * dépend de rien. Sa présence répond à la première question quand rien ne
   * marche — le script tourne-t-il ? — et son compteur à la seconde — voit-il
   * des publications ?
   */
  let fab = null;
  let fabCount = null;

  function mountFab() {
    if (fab && fab.isConnected) return;
    fab = document.createElement("button");
    fab.type = "button";
    fab.className = "lr-fab";
    fab.title = "Routine LinkedIn — proposer des commentaires";
    fab.setAttribute("aria-label", "Routine LinkedIn");
    fab.appendChild(sparkle());
    fabCount = document.createElement("span");
    fabCount.className = "lr-fab-count";
    fabCount.textContent = "0";
    fab.appendChild(fabCount);
    fab.addEventListener("click", onFabClick);
    document.body.appendChild(fab);
  }

  function updateFab(count) {
    if (fabCount) fabCount.textContent = String(count);
  }

  /** La publication la plus proche du centre de l'écran. */
  function mostVisible() {
    const middle = window.innerHeight / 2;
    let best = null;
    let bestDistance = Infinity;
    for (const target of targets) {
      let box;
      try {
        box = target.post.getBoundingClientRect();
      } catch {
        continue;
      }
      if (box.height === 0) continue;
      const distance = Math.abs(box.top + box.height / 2 - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = target;
      }
    }
    return best;
  }

  function onFabClick() {
    sweep();
    const target = mostVisible();
    if (target) {
      start(target.post, target.anchor);
      return;
    }
    const releve = diagnose(document);
    toast(
      `Aucune publication reconnue ici (${releve.anchors} bouton « Commenter », ` +
        `${releve.posts} conteneur). Place-toi sur le fil, recharge la page, ` +
        "puis regarde le diagnostic dans les réglages.",
    );
  }

  // ── Message bref, quand il n'y a pas de carte où écrire ───────────────────
  let toastTimer = 0;
  function toast(message) {
    let node = document.querySelector(".lr-toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "lr-toast";
      document.body.appendChild(node);
    }
    node.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 9000);
  }

  // ── Diagnostic ────────────────────────────────────────────────────────────
  /**
   * Relevé déposé dans le stockage local, relu par la page de réglages.
   *
   * Passer par le stockage plutôt que par `chrome.tabs.sendMessage` évite de
   * demander la permission `tabs` : l'extension n'a besoin de voir aucun autre
   * onglet, et une permission qu'on ne demande pas est une permission qu'on ne
   * peut pas mal utiliser.
   */
  let lastReport = 0;
  function report(count) {
    const now = Date.now();
    if (now - lastReport < 5000) return;
    lastReport = now;
    try {
      chrome.storage.local.set({
        diagnostic: {
          at: new Date().toISOString(),
          url: location.href.split("?")[0],
          detected: count,
          // Un échantillon de ce qui a RÉELLEMENT été lu sur la première
          // publication. Sans lui, « pas assez de texte » ne se corrige qu'à
          // l'aveugle : c'est précisément le relevé qui manquait.
          echantillon: sample(),
          ...diagnose(document),
        },
      });
    } catch {
      // Le contexte de l'extension peut avoir été invalidé par un rechargement.
    }
  }

  function sample() {
    const target = targets[0];
    if (!target) return null;
    try {
      const data = extractPost(target.post, target.anchor);
      return {
        source: data.source,
        auteur: data.authorName,
        media: data.media,
        longueur: data.body.length,
        debut: data.body.slice(0, 220),
      };
    } catch (error) {
      return { erreur: String(error && error.message) };
    }
  }

  // ── Génération ────────────────────────────────────────────────────────────
  function start(post, anchor) {
    current = { post, anchor };
    panel.show({
      post,
      anchor,
      onRegenerate: (choix) => generate(choix),
      onInsert: ({ slot, text }) => insert(slot, text),
      onCopy: ({ slot, text }) => copy(slot, text),
      onClose: () => {
        disconnect();
        current = null;
      },
    });
    generate(null);
  }

  function disconnect() {
    try {
      port?.disconnect();
    } catch {
      // Déjà fermé.
    }
    port = null;
  }

  /**
   * Le texte est relu À CHAQUE génération, jamais mémorisé.
   *
   * Un « voir plus » déplié entre deux essais change le texte disponible ;
   * repartir du relevé initial renverrait le même extrait tronqué, ou pire, un
   * corps vide que l'app refuse en 400. Relire coûte une lecture du DOM.
   */
  function generate(choix) {
    if (!current) return;
    const data = extractPost(current.post, current.anchor);
    current.data = data;

    if (data.body.trim().length < 12) {
      panel.reset().status(explainEmpty(data), true);
      panel.done();
      return;
    }

    generationId = null;
    panel.loading();
    disconnect();

    // Le service worker porte l'appel : il a la permission d'hôte sur l'app et
    // n'est donc pas soumis à CORS, contrairement à ce script qui s'exécute
    // avec l'origine de linkedin.com. C'est aussi ce qui évite d'ouvrir la
    // route de génération à l'origine de LinkedIn.
    port = chrome.runtime.connect({ name: "lr-variants" });
    port.onMessage.addListener(onEvent);
    port.onDisconnect.addListener(() => {
      port = null;
      panel.done();
    });
    port.postMessage({
      type: "generate",
      payload: {
        postBody: data.body,
        authorName: data.authorName,
        media: data.media,
        intention: choix ?? null,
      },
    });
  }

  /**
   * Dit ce qui a été lu, et pas seulement que c'était trop court.
   *
   * « Pas assez de texte » sur une publication visiblement pleine de texte est
   * une impasse : sans savoir CE QUI a été relevé, il n'y a rien à corriger.
   */
  function explainEmpty(data) {
    const seen = data.body.trim();
    if (seen === "") {
      return "Aucun texte trouvé dans cette publication. Si elle en contient, envoie-moi le diagnostic (réglages de l'extension).";
    }
    return `Seulement « ${seen.slice(0, 60)} » a été relevé — trop court pour rédiger. Déplie « voir plus », puis régénère.`;
  }

  function onEvent(event) {
    if (!event || typeof event.type !== "string") return;
    switch (event.type) {
      case "variante":
        panel.addVariant(event.variante);
        break;
      case "retry":
        // Le premier essai est rejeté : ce qui a été montré n'est plus valable.
        panel.reset().status("Première rédaction écartée, nouvelle tentative…", false);
        break;
      case "done": {
        const result = event.result || {};
        generationId = result.generationId ?? null;
        if (Array.isArray(result.variantes)) panel.setVariants(result.variantes);
        panel.status(
          result.postExploitable === false
            ? "Publication peu exploitable — deux registres seulement."
            : "",
          false,
        );
        panel.done();
        break;
      }
      case "error":
        panel.reset().status(event.message || "Génération impossible.", true);
        panel.done();
        break;
      case "needs-setup":
        panel.reset().status("Extension non configurée — ouvre les réglages.", true);
        chrome.runtime.sendMessage({ type: "open-options" }).catch(() => {});
        panel.done();
        break;
      default:
        break;
    }
  }

  // ── Insertion dans le champ de LinkedIn ───────────────────────────────────
  function waitFor(read, timeout) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeout;
      const tick = () => {
        const value = read();
        if (value) return resolve(value);
        if (Date.now() > deadline) return resolve(null);
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  /**
   * Remplissage d'un éditeur Quill.
   *
   * `execCommand("insertText")` et non `innerText = …` : Quill n'écoute pas les
   * mutations du DOM, il écoute les évènements de saisie natifs. Un texte posé
   * directement s'affiche mais laisse le bouton « Publier » grisé, parce que
   * l'éditeur n'a jamais su qu'on avait écrit. La commande, elle, déclenche un
   * vrai `beforeinput`/`input` et LinkedIn suit.
   */
  function fill(editor, text) {
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);

    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }

    if (!ok) {
      // Repli : on écrit les paragraphes à la main et on annonce la saisie.
      editor.replaceChildren();
      for (const line of text.split("\n")) {
        const paragraph = document.createElement("p");
        if (line === "") paragraph.appendChild(document.createElement("br"));
        else paragraph.textContent = line;
        editor.appendChild(paragraph);
      }
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }),
      );
    }

    editor.classList.remove("ql-blank");
    editor.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function insert(slot, text) {
    if (!current) return;
    const { post } = current;
    let editor = first(post, EDITOR_SELECTORS);

    if (!editor) {
      const open = first(post, COMMENT_BUTTON_SELECTORS) || current.anchor;
      if (open) open.click();
      editor = await waitFor(() => first(post, EDITOR_SELECTORS), 4000);
    }

    if (!editor) {
      await copy(slot, text);
      panel.status("Champ de commentaire introuvable — texte copié, colle-le à la main.", true);
      return;
    }

    fill(editor, text);
    panel.status("Inséré. Relis, puis publie depuis LinkedIn.", false);
    note(slot, text);
  }

  async function copy(slot, text) {
    try {
      await navigator.clipboard.writeText(text);
      panel.status("Copié.", false);
    } catch {
      panel.status("Copie refusée par le navigateur — sélectionne le texte à la main.", true);
      return;
    }
    note(slot, text);
  }

  /**
   * Journal de feedback (§9) : ce qui a été retenu, et retouché ou non.
   *
   * Envoyé sans attendre la réponse, et son échec est silencieux : perdre une
   * mesure est regrettable, bloquer une insertion le serait davantage.
   */
  function note(slot, text) {
    if (!generationId || !current) return;
    chrome.runtime
      .sendMessage({
        type: "choice",
        payload: {
          generationId,
          slot,
          publishedText: text,
          postUrl: current.data?.url ?? null,
        },
      })
      .catch(() => {});
  }
})();
