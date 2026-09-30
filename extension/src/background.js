/**
 * Le service worker : le seul endroit qui parle à l'app.
 *
 * Deux raisons de faire passer l'appel par ici plutôt que depuis le script de
 * contenu.
 *
 *  1. **CORS.** Un `fetch` lancé depuis un script de contenu part avec
 *     l'origine de la page — linkedin.com. Pour qu'il aboutisse, il faudrait
 *     que l'app réponde `Access-Control-Allow-Origin: linkedin.com`, ce qui
 *     rendrait la route de génération joignable par n'importe quel script de
 *     LinkedIn. Le service worker, lui, a la permission d'hôte : il n'est pas
 *     soumis à CORS, et l'app n'a aucun en-tête à ouvrir.
 *
 *  2. **Le jeton.** Il ne transite jamais par la page, même dans un monde
 *     isolé. Il est lu ici et n'en sort pas.
 */

const NEEDS_SETUP = { type: "needs-setup" };

async function config() {
  const stored = await chrome.storage.sync.get(["apiBase", "token"]);
  const apiBase = String(stored.apiBase || "").trim().replace(/\/+$/, "");
  const token = String(stored.token || "").trim();
  return { apiBase, token, ready: apiBase !== "" && token !== "" };
}

/**
 * Traduction des échecs en phrases actionnables.
 *
 * Un « Génération impossible » générique renvoie à une console que personne
 * n'ouvrira : chaque cas nomme ce qu'il faut corriger et où.
 */
function explain(status) {
  if (status === 401) return "Jeton refusé — vérifie EXTENSION_TOKEN dans les réglages de l'extension.";
  if (status === 503) return "EXTENSION_TOKEN n'est pas configuré côté app (Vercel).";
  if (status === 400) return "Publication illisible — le texte extrait a été refusé par l'app.";
  if (status === 404) return "Adresse de l'app incorrecte : la route n'existe pas.";
  if (status === 504 || status === 408) return "L'app n'a pas répondu à temps. Réessaie.";
  if (status >= 500) return `Erreur de l'app (${status}).`;
  return `Réponse inattendue de l'app (${status}).`;
}

function networkMessage(error) {
  const detail = error && error.message ? ` (${error.message})` : "";
  return `App injoignable${detail}. Vérifie l'adresse et ta connexion.`;
}

async function call(path, init) {
  const { apiBase, token, ready } = await config();
  if (!ready) return { setup: true };
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init && init.headers),
    },
  });
  return { response };
}

// ── Génération en flux ──────────────────────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "lr-variants") return;

  let alive = true;
  port.onDisconnect.addListener(() => {
    alive = false;
  });

  const send = (event) => {
    if (!alive) return;
    try {
      port.postMessage(event);
    } catch {
      alive = false;
    }
  };

  port.onMessage.addListener(async (message) => {
    if (!message || message.type !== "generate") return;
    try {
      await stream(send, message.payload, () => alive);
    } catch (error) {
      send({ type: "error", message: networkMessage(error) });
    } finally {
      if (alive) {
        try {
          port.disconnect();
        } catch {
          // Déjà fermé côté page.
        }
      }
    }
  });
});

async function stream(send, payload, alive) {
  const { setup, response } = await call("/api/extension/variants", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (setup) {
    send(NEEDS_SETUP);
    return;
  }
  if (!response.ok || !response.body) {
    send({ type: "error", message: explain(response.status) });
    return;
  }

  // NDJSON : une ligne JSON par évènement. Le découpage se fait sur les sauts
  // de ligne et non sur les morceaux du flux, qui peuvent couper une ligne
  // en deux.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line !== "") {
        try {
          send(JSON.parse(line));
        } catch {
          // Une ligne illisible n'annule pas les suivantes.
        }
      }
      newline = buffer.indexOf("\n");
    }
    if (done || !alive()) break;
  }
}

// ── Messages ponctuels ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "open-options") {
    chrome.runtime.openOptionsPage();
    reply({ ok: true });
    return false;
  }

  if (message.type === "choice") {
    call("/api/extension/choice", { method: "POST", body: JSON.stringify(message.payload) })
      .then((outcome) => reply({ ok: outcome.response ? outcome.response.ok : false }))
      .catch(() => reply({ ok: false }));
    return true;
  }

  if (message.type === "ping") {
    call("/api/extension/ping", { method: "GET" })
      .then(async ({ setup, response }) => {
        if (setup) return reply({ ok: false, message: "Adresse ou jeton manquant." });
        if (!response.ok) return reply({ ok: false, message: explain(response.status) });
        const body = await response.json().catch(() => ({}));
        reply({ ok: true, message: `Connecté. Modèle : ${body.model || "inconnu"}.` });
      })
      .catch((error) => reply({ ok: false, message: networkMessage(error) }));
    return true;
  }

  return false;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onInstalled.addListener(async () => {
  const { ready } = await config();
  if (!ready) chrome.runtime.openOptionsPage();
});
