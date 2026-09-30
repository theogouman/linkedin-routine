/**
 * Le script de contenu : un bouton par publication, un panneau, une insertion.
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

  const { extractPost, findPosts, first, EDITOR_SELECTORS, COMMENT_BUTTON_SELECTORS, BARRE_SELECTORS } =
    globalThis.LRExtract;
  const panel = globalThis.LRPanel;

  const MARK = "data-lr-ready";
  /** Publication en cours dans le panneau, pour savoir où insérer. */
  let current = null;
  let generationId = null;
  let port = null;

  // ── Bouton ────────────────────────────────────────────────────────────────
  const BUTTON_CSS = `
    .lr-trigger.lr-trigger {
      display: inline-flex; align-items: center; gap: 6px;
      margin: 0 4px; padding: 6px 10px;
      border: 0; border-radius: 8px; cursor: pointer;
      background: transparent; color: #e0625a;
      font: 600 14px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .lr-trigger.lr-trigger:hover { background: rgba(224,98,90,.12); }
    .lr-trigger.lr-trigger[disabled] { opacity: .5; cursor: default; }
    .lr-trigger.lr-trigger svg { width: 16px; height: 16px; }
  `;

  function injectStyles() {
    if (document.getElementById("lr-trigger-style")) return;
    const style = document.createElement("style");
    style.id = "lr-trigger-style";
    style.textContent = BUTTON_CSS;
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

  function makeButton(post) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lr-trigger";
    button.appendChild(sparkle());
    button.appendChild(document.createTextNode("Proposer"));
    button.setAttribute("aria-label", "Proposer quatre commentaires");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      start(post);
    });
    return button;
  }

  function decorate(post) {
    if (post.getAttribute(MARK) === "1") return;
    post.setAttribute(MARK, "1");
    const bar = first(post, BARRE_SELECTORS);
    const button = makeButton(post);
    if (bar) {
      bar.appendChild(button);
    } else {
      // Sans barre d'actions reconnue, on ajoute une ligne à la fin plutôt que
      // de renoncer : le bouton doit exister même si LinkedIn a tout renommé.
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:flex-end;padding:4px 12px 8px;";
      row.appendChild(button);
      post.appendChild(row);
    }
  }

  function sweep() {
    injectStyles();
    for (const post of findPosts(document)) {
      try {
        decorate(post);
      } catch {
        // Une publication au balisage inattendu ne doit pas arrêter les autres.
      }
    }
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

  // ── Génération ────────────────────────────────────────────────────────────
  function summarize(data) {
    const who = data.authorName ? `${data.authorName} — ` : "";
    const line = data.body.split("\n").find((part) => part.trim() !== "") || "publication sans texte";
    return `${who}${line}`;
  }

  function start(post) {
    const data = extractPost(post);
    if (data.body.trim().length < 12) {
      openPanelFor(post, data);
      panel.reset().status(
        "Pas assez de texte dans cette publication — déplie-la (« voir plus ») puis réessaie.",
        true,
      );
      panel.done();
      return;
    }
    openPanelFor(post, data);
    generate(null);
  }

  function openPanelFor(post, data) {
    current = { post, data };
    panel.show({
      subtitle: summarize(data),
      onRegenerate: (intention) => generate(intention),
      onInsert: ({ slot, text }) => insert(slot, text),
      onCopy: ({ slot, text }) => copy(slot, text),
      onClose: () => {
        try {
          port?.disconnect();
        } catch {
          // Déjà fermé.
        }
        port = null;
      },
    });
  }

  function generate(intention) {
    if (!current) return;
    generationId = null;
    panel.loading();

    try {
      port?.disconnect();
    } catch {
      // Déjà fermé.
    }

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
        postBody: current.data.body,
        authorName: current.data.authorName,
        media: current.data.media,
        intention: intention ?? null,
      },
    });
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
      const open = first(post, COMMENT_BUTTON_SELECTORS);
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
          postUrl: current.data.url,
        },
      })
      .catch(() => {});
  }
})();
