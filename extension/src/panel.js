/**
 * Le panneau des quatre propositions.
 *
 * Rendu dans un `shadow root` fermé sur lui-même : LinkedIn charge plusieurs
 * milliers de règles CSS, dont beaucoup visent des sélecteurs très généraux.
 * Sans isolation, l'apparence du panneau dépendrait de la page — et changerait
 * à chaque déploiement de LinkedIn.
 *
 * Fixé en bas à droite plutôt qu'ancré sous la publication, et ce n'est pas un
 * choix esthétique : le fil de LinkedIn est virtualisé, les publications sont
 * détachées et rattachées au défilement. Un panneau ancré sauterait ou
 * disparaîtrait. Fixe, il survit à tout, et garde une référence directe vers
 * la publication pour l'insertion.
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

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .wrap {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      width: 420px; max-width: calc(100vw - 32px);
      max-height: min(78vh, 760px); display: flex; flex-direction: column;
      background: #fff; color: #1a1a1a;
      border: 1px solid rgba(0,0,0,.1); border-radius: 14px;
      box-shadow: 0 18px 48px rgba(0,0,0,.22);
      font-size: 14px; line-height: 1.45; overflow: hidden;
    }
    @media (prefers-color-scheme: dark) {
      .wrap { background: #1b1f23; color: #e9e9e9; border-color: rgba(255,255,255,.12); }
      .head, .foot { border-color: rgba(255,255,255,.1) !important; }
      .card { background: #23282d; border-color: rgba(255,255,255,.1); }
      textarea { background: transparent; color: #e9e9e9; }
      .chip { background: #23282d; border-color: rgba(255,255,255,.14); color: #e9e9e9; }
      .chip[aria-pressed="true"] { background: #e0625a; border-color: #e0625a; color: #fff; }
      .ghost { color: #e9e9e9; border-color: rgba(255,255,255,.18); }
    }
    .head {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px; border-bottom: 1px solid rgba(0,0,0,.08); flex: none;
    }
    .head h1 { margin: 0; font-size: 13px; font-weight: 650; letter-spacing: .01em; }
    .head p { margin: 2px 0 0; font-size: 12px; opacity: .62;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .head .grow { flex: 1; min-width: 0; }
    .x { border: 0; background: transparent; cursor: pointer; font-size: 18px;
      line-height: 1; padding: 2px 6px; border-radius: 6px; color: inherit; opacity: .5; }
    .x:hover { opacity: 1; background: rgba(0,0,0,.06); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px 4px; flex: none; }
    .chip {
      border: 1px solid rgba(0,0,0,.14); background: #fff; color: #1a1a1a;
      border-radius: 999px; padding: 4px 11px; font-size: 12px; cursor: pointer;
    }
    .chip[aria-pressed="true"] { background: #e0625a; border-color: #e0625a; color: #fff; }
    .body { overflow-y: auto; padding: 10px 14px 4px; display: flex; flex-direction: column; gap: 10px; }
    .card { border: 1px solid rgba(0,0,0,.1); border-radius: 11px; padding: 10px 11px; background: #fbfbfb; }
    .card.flag { opacity: .82; }
    .card-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
    .slot { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .05em; opacity: .58; }
    .badge { font-size: 10.5px; padding: 1px 7px; border-radius: 999px;
      background: rgba(224,98,90,.13); color: #b8443c; font-weight: 600; }
    @media (prefers-color-scheme: dark) { .badge { color: #ff9f98; } }
    textarea {
      width: 100%; border: 0; padding: 0; resize: none; outline: none;
      font-size: 14px; line-height: 1.5; background: transparent; color: inherit;
      font-family: inherit; overflow: hidden;
    }
    .acts { display: flex; gap: 6px; margin-top: 8px; }
    button.act {
      border-radius: 8px; padding: 5px 12px; font-size: 12.5px; font-weight: 600;
      cursor: pointer; border: 1px solid transparent;
    }
    .primary { background: #e0625a; color: #fff; }
    .primary:hover { background: #cf554d; }
    .ghost { background: transparent; border-color: rgba(0,0,0,.16); color: #1a1a1a; }
    .ghost:hover { border-color: rgba(0,0,0,.34); }
    .foot { display: flex; align-items: center; gap: 10px; padding: 10px 14px;
      border-top: 1px solid rgba(0,0,0,.08); flex: none; }
    .status { flex: 1; font-size: 12px; opacity: .62; min-width: 0; }
    .status.err { color: #c0392b; opacity: 1; }
    .skel { height: 62px; border-radius: 11px; border: 1px solid rgba(0,0,0,.08);
      background: linear-gradient(90deg, rgba(0,0,0,.04), rgba(0,0,0,.08), rgba(0,0,0,.04));
      background-size: 200% 100%; animation: sweep 1.3s ease-in-out infinite; }
    @keyframes sweep { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .skel { animation: none; } }
  `;

  let host = null;
  let shadow = null;
  let refs = null;
  let handlers = {};
  let intention = "";
  let seen = new Map();

  function labelFor(value) {
    const found = INTENTIONS.find(([key]) => key === value);
    return found ? found[1] : "Libre";
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    for (const child of children || []) node.appendChild(child);
    return node;
  }

  function build() {
    host = document.createElement("div");
    host.id = "lr-panel-host";
    // `all: initial` sur l'hôte : LinkedIn applique des règles à `div` nu.
    host.style.cssText = "all: initial;";
    shadow = host.attachShadow({ mode: "open" });
    shadow.appendChild(el("style", { textContent: STYLES }));

    const title = el("h1", { textContent: "Quatre propositions" });
    const subtitle = el("p", { className: "sub" });
    const close = el("button", { className: "x", textContent: "×", title: "Fermer" });
    close.addEventListener("click", () => hide());

    const head = el("div", { className: "head" }, [
      el("div", { className: "grow" }, [title, subtitle]),
      close,
    ]);

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
    again.addEventListener("click", () => handlers.onRegenerate?.(intention === "" ? null : intention));
    const foot = el("div", { className: "foot" }, [status, again]);

    const wrap = el("div", { className: "wrap" }, [head, chips, body, foot]);
    shadow.appendChild(wrap);
    document.body.appendChild(host);

    refs = { subtitle, body, status, again, chips };
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
    // La hauteur ne peut être calculée qu'une fois le nœud dans le document.
    queueMicrotask(() => autosize(area));
    return node;
  }

  function render() {
    refs.body.replaceChildren();
    const ordered = [...seen.values()].sort(
      (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
    );
    for (const variante of ordered) refs.body.appendChild(card(variante));
  }

  function show(options) {
    handlers = options || {};
    if (host === null) build();
    host.style.display = "";
    refs.subtitle.textContent = options.subtitle || "";
    // Le panneau est construit une fois et réutilisé : ses pastilles doivent
    // refléter l'intention courante, pas celle de la publication précédente.
    for (const chip of refs.chips.children) {
      chip.setAttribute("aria-pressed", String(chip.textContent === labelFor(intention)));
    }
    return api;
  }

  function hide() {
    if (host) host.style.display = "none";
    handlers.onClose?.();
  }

  function loading(message) {
    seen = new Map();
    refs.body.replaceChildren(
      el("div", { className: "skel" }),
      el("div", { className: "skel" }),
      el("div", { className: "skel" }),
      el("div", { className: "skel" }),
    );
    status(message || "Rédaction des quatre propositions…", false);
    refs.again.disabled = true;
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
    refs.body.replaceChildren();
    return api;
  }

  function status(text, isError) {
    refs.status.textContent = text || "";
    refs.status.className = isError ? "status err" : "status";
    return api;
  }

  function done() {
    refs.again.disabled = false;
    return api;
  }

  function isOpen() {
    return host !== null && host.style.display !== "none";
  }

  const api = { show, hide, loading, addVariant, setVariants, reset, status, done, isOpen };
  root.LRPanel = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
