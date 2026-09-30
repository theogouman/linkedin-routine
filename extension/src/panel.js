/**
 * Les quatre propositions, rendues DANS la carte de la publication.
 *
 * Un panneau flottant sur le côté obligeait à faire l'aller-retour des yeux
 * entre le post et les propositions, et à se souvenir duquel on parlait. Ici le
 * bloc s'ouvre sous la barre d'actions, à l'endroit exact où LinkedIn ouvrirait
 * son propre champ de commentaire : le contexte est sous les yeux, et rien ne
 * recouvre le fil.
 *
 * La carte change de taille trois fois pendant une génération — squelettes,
 * puis chaque variante qui arrive, puis la liste triée. C'est le cas d'usage
 * exact de `card resize` (transitions.dev, `01-card-resize.md`) : la hauteur est
 * tweenée, jamais sautée. Le snippet veut une hauteur en pixels ; un
 * `ResizeObserver` sur le contenu la tient à jour à chaque changement.
 *
 * Le contenu vit dans un `shadow root` : LinkedIn charge des milliers de règles
 * CSS, dont beaucoup visent des sélecteurs très généraux. Sans isolation,
 * l'apparence du bloc dépendrait de leur prochain déploiement.
 */

(function attachPanel(root) {
  "use strict";

  const SLOT_LABELS = {
    question: "Question",
    reaction_courte: "Réaction",
    avis: "Avis",
    humour_ou_bravo: "Humour / Bravo",
    accord_court: "Accord",
    merci: "Merci",
    fond: "Fond",
    relance: "Relance",
  };

  const SLOT_ORDER = ["question", "reaction_courte", "avis", "humour_ou_bravo"];

  const INTENTIONS = [
    ["", "Libre"],
    ["question", "Question"],
    ["soutien", "Soutien"],
    ["avis", "Avis"],
    ["humour", "Humour"],
    ["desaccord", "Désaccord"],
  ];

  /** Doit rester aligné sur `--lr-resize-dur` dans la feuille du script de contenu. */
  const RESIZE_MS = 300;

  const STYLES = `
    :host { all: initial; display: block; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .inner {
      padding: 12px 16px 14px;
      border-top: 1px solid rgba(0,0,0,.09);
      background: rgba(224,98,90,.035);
      color: #1a1a1a; font-size: 14px; line-height: 1.45;
    }
    @media (prefers-color-scheme: dark) {
      .inner { color: #e9e9e9; border-color: rgba(255,255,255,.12); background: rgba(224,98,90,.06); }
      .card { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.1); }
      textarea { color: #e9e9e9; }
      .chip { border-color: rgba(255,255,255,.18); color: #e9e9e9; }
      .ghost { color: #e9e9e9; border-color: rgba(255,255,255,.2); }
    }
    .head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .head h2 { margin: 0; font-size: 11.5px; font-weight: 650;
      text-transform: uppercase; letter-spacing: .06em; opacity: .55; flex: 1; }
    .x { border: 0; background: transparent; cursor: pointer; font-size: 17px; line-height: 1;
      padding: 2px 6px; border-radius: 6px; color: inherit; opacity: .45; }
    .x:hover { opacity: 1; background: rgba(0,0,0,.06); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .chip { border: 1px solid rgba(0,0,0,.14); background: transparent; color: #1a1a1a;
      border-radius: 999px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .chip[aria-pressed="true"] { background: #e0625a; border-color: #e0625a; color: #fff; }
    .body { display: flex; flex-direction: column; gap: 8px; }
    .card { border: 1px solid rgba(0,0,0,.1); border-radius: 10px; padding: 9px 11px; background: #fff; }
    .card.flag { opacity: .84; }
    .card-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 5px; }
    .slot { font-size: 10.5px; font-weight: 650; text-transform: uppercase;
      letter-spacing: .05em; opacity: .55; }
    .badge { font-size: 10px; padding: 1px 6px; border-radius: 999px;
      background: rgba(224,98,90,.14); color: #b8443c; font-weight: 600; }
    @media (prefers-color-scheme: dark) { .badge { color: #ff9f98; } }
    textarea { width: 100%; border: 0; padding: 0; resize: none; outline: none;
      font-size: 14px; line-height: 1.5; background: transparent; color: inherit;
      font-family: inherit; overflow: hidden; }
    .acts { display: flex; gap: 6px; margin-top: 7px; }
    button.act { border-radius: 8px; padding: 4px 11px; font-size: 12.5px; font-weight: 600;
      cursor: pointer; border: 1px solid transparent; }
    .primary { background: #e0625a; color: #fff; }
    .primary:hover { background: #cf554d; }
    .ghost { background: transparent; border-color: rgba(0,0,0,.16); color: #1a1a1a; }
    .ghost:hover { border-color: rgba(0,0,0,.34); }
    .foot { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
    .status { flex: 1; font-size: 12px; opacity: .62; min-width: 0; }
    .status.err { color: #c0392b; opacity: 1; }
    .skel { height: 54px; border-radius: 10px; border: 1px solid rgba(0,0,0,.08);
      background: linear-gradient(90deg, rgba(0,0,0,.04), rgba(0,0,0,.08), rgba(0,0,0,.04));
      background-size: 200% 100%; animation: sweep 1.3s linear infinite; }
    @keyframes sweep { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .skel { animation: none; } }
  `;

  let host = null;
  let shadow = null;
  let inner = null;
  let refs = null;
  let observer = null;
  let closing = 0;
  let handlers = {};
  let intention = "";
  let seen = new Map();

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    for (const child of children || []) node.appendChild(child);
    return node;
  }

  function labelFor(value) {
    const found = INTENTIONS.find(([key]) => key === value);
    return found ? found[1] : "Libre";
  }

  /**
   * Où poser le bloc dans la publication.
   *
   * Juste après l'élément de premier niveau qui contient « Commenter », donc
   * sous la barre d'actions et au-dessus des commentaires — la place que
   * LinkedIn réserve lui-même à la rédaction. Sans ancre connue, à la fin.
   */
  function mount(post, anchor) {
    host = document.createElement("div");
    host.className = "lr-slot t-resize";
    host.style.height = "0px";
    shadow = host.attachShadow({ mode: "open" });
    shadow.appendChild(el("style", { textContent: STYLES }));

    const title = el("h2", { textContent: "Quatre propositions" });
    const close = el("button", { className: "x", textContent: "×", title: "Fermer" });
    close.addEventListener("click", () => hide());
    const head = el("div", { className: "head" }, [title, close]);

    const chips = el("div", { className: "chips" });
    for (const [value, label] of INTENTIONS) {
      const chip = el("button", { className: "chip", textContent: label });
      chip.setAttribute("aria-pressed", String(value === intention));
      chip.addEventListener("click", () => {
        intention = value;
        for (const other of chips.children) other.setAttribute("aria-pressed", "false");
        chip.setAttribute("aria-pressed", "true");
        handlers.onRegenerate?.(value === "" ? null : value);
      });
      chips.appendChild(chip);
    }

    const body = el("div", { className: "body" });
    const status = el("div", { className: "status" });
    const again = el("button", { className: "act ghost", textContent: "Régénérer" });
    again.addEventListener("click", () =>
      handlers.onRegenerate?.(intention === "" ? null : intention),
    );
    const foot = el("div", { className: "foot" }, [status, again]);

    inner = el("div", { className: "inner" }, [head, chips, body, foot]);
    shadow.appendChild(inner);
    refs = { body, status, again, chips };

    let placed = false;
    if (anchor) {
      let node = anchor;
      while (node.parentElement && node.parentElement !== post) node = node.parentElement;
      if (node.parentElement === post) {
        post.insertBefore(host, node.nextSibling);
        placed = true;
      }
    }
    if (!placed) post.appendChild(host);

    // La hauteur ne peut être tweenée que depuis une valeur en pixels : on part
    // de 0, on force un recalcul, puis on pose la hauteur réelle.
    void host.offsetHeight;
    sync();

    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => sync());
      observer.observe(inner);
    }
  }

  /** Reporte la hauteur du contenu sur l'hôte, que la transition anime. */
  function sync() {
    if (!host || !inner || !host.isConnected) return;
    host.style.height = `${Math.ceil(inner.getBoundingClientRect().height)}px`;
  }

  function teardown() {
    observer?.disconnect();
    observer = null;
    host?.remove();
    host = null;
    shadow = null;
    inner = null;
    refs = null;
  }

  function autosize(area) {
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 260)}px`;
  }

  function card(variante) {
    const head = el("div", { className: "card-head" }, [
      el("span", { className: "slot", textContent: SLOT_LABELS[variante.slot] || variante.slot }),
    ]);
    for (const badge of variante.badges || []) {
      const chip = el("span", { className: "badge", textContent: badge.label });
      if (badge.detail) chip.title = badge.detail;
      head.appendChild(chip);
    }

    const area = el("textarea", { value: variante.texte, rows: 2, spellcheck: true });
    area.addEventListener("input", () => autosize(area));

    const insert = el("button", { className: "act primary", textContent: "Insérer" });
    insert.addEventListener("click", () =>
      handlers.onInsert?.({ slot: variante.slot, text: area.value }),
    );
    const copy = el("button", { className: "act ghost", textContent: "Copier" });
    copy.addEventListener("click", () =>
      handlers.onCopy?.({ slot: variante.slot, text: area.value }),
    );

    const node = el("div", { className: (variante.badges || []).length > 0 ? "card flag" : "card" }, [
      head,
      area,
      el("div", { className: "acts" }, [insert, copy]),
    ]);
    // La hauteur ne se calcule qu'une fois le nœud dans le document.
    queueMicrotask(() => {
      autosize(area);
      sync();
    });
    return node;
  }

  function render() {
    if (!refs) return;
    refs.body.replaceChildren();
    const ordered = [...seen.values()].sort(
      (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
    );
    for (const variante of ordered) refs.body.appendChild(card(variante));
    sync();
  }

  function show(options) {
    handlers = options || {};
    clearTimeout(closing);
    // Un seul bloc ouvert à la fois : deux jeux de propositions dans le fil
    // rendraient la publication commentée ambiguë.
    teardown();
    seen = new Map();
    mount(options.post, options.anchor ?? null);
    for (const chip of refs.chips.children) {
      chip.setAttribute("aria-pressed", String(chip.textContent === labelFor(intention)));
    }
    return api;
  }

  function hide() {
    if (!host) return;
    observer?.disconnect();
    observer = null;
    host.style.height = "0px";
    const leaving = host;
    closing = setTimeout(() => {
      if (leaving === host) teardown();
      else leaving.remove();
    }, RESIZE_MS + 40);
    handlers.onClose?.();
  }

  function loading(message) {
    if (!refs) return api;
    seen = new Map();
    refs.body.replaceChildren(
      el("div", { className: "skel" }),
      el("div", { className: "skel" }),
      el("div", { className: "skel" }),
      el("div", { className: "skel" }),
    );
    status(message || "Rédaction des quatre propositions…", false);
    refs.again.disabled = true;
    sync();
    return api;
  }

  function addVariant(variante) {
    // Le flux peut renvoyer un emplacement déjà vu quand le premier essai est
    // rejeté : le dernier reçu fait foi. `render` repart du corps vide, ce qui
    // efface au passage les squelettes de chargement.
    seen.set(variante.slot, variante);
    render();
    return api;
  }

  function setVariants(list) {
    seen = new Map((list || []).map((variante) => [variante.slot, variante]));
    render();
    return api;
  }

  function reset() {
    seen = new Map();
    if (refs) refs.body.replaceChildren();
    sync();
    return api;
  }

  function status(text, isError) {
    if (!refs) return api;
    refs.status.textContent = text || "";
    refs.status.className = isError ? "status err" : "status";
    sync();
    return api;
  }

  function done() {
    if (refs) refs.again.disabled = false;
    sync();
    return api;
  }

  function isOpen() {
    return host !== null && host.isConnected;
  }

  const api = { show, hide, loading, addVariant, setVariants, reset, status, done, isOpen, sync };
  root.LRPanel = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
