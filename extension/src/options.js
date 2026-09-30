/**
 * Réglages de l'extension : adresse de l'app et jeton d'accès.
 *
 * La permission d'hôte est demandée ICI, au moment de l'enregistrement, et non
 * déclarée d'avance dans le manifeste. L'adresse de l'app varie d'une
 * installation à l'autre ; la seule façon de la déclarer statiquement serait
 * de demander l'accès à tous les sites, ce qu'aucune extension ne devrait
 * faire pour joindre un seul domaine.
 */

const $ = (id) => document.getElementById(id);
const status = $("status");

function say(message, kind) {
  status.textContent = message;
  status.className = kind || "";
}

function normalize(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    // Le jeton part dans un en-tête : en clair sur `http`, il serait lisible
    // par tout ce qui se trouve sur le chemin.
    if (url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

async function load() {
  const stored = await chrome.storage.sync.get(["apiBase", "token"]);
  $("apiBase").value = stored.apiBase || "";
  $("token").value = stored.token || "";
}

$("save").addEventListener("click", async () => {
  const apiBase = normalize($("apiBase").value);
  const token = $("token").value.trim();

  if (apiBase === null) {
    say("Adresse invalide — il faut une URL en https, par exemple https://mon-app.vercel.app.", "err");
    return;
  }
  if (token.length < 24) {
    say("Jeton trop court : au moins 24 caractères (openssl rand -base64 32).", "err");
    return;
  }

  // La demande doit partir d'un geste de l'utilisateur : Chrome refuse
  // silencieusement une demande de permission faite hors d'un clic.
  let granted = true;
  try {
    granted = await chrome.permissions.request({ origins: [`${apiBase}/*`] });
  } catch (error) {
    say(`Permission refusée : ${error.message}`, "err");
    return;
  }
  if (!granted) {
    say("Sans l'autorisation d'accès à cette adresse, l'extension ne peut rien appeler.", "err");
    return;
  }

  await chrome.storage.sync.set({ apiBase, token });
  $("apiBase").value = apiBase;
  say("Enregistré. Teste la connexion pour vérifier le jeton.", "ok");
});

$("test").addEventListener("click", async () => {
  $("test").disabled = true;
  say("Test en cours…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "ping" });
    say(result.message, result.ok ? "ok" : "err");
  } catch (error) {
    say(`Le service worker n'a pas répondu (${error.message}).`, "err");
  } finally {
    $("test").disabled = false;
  }
});

load();

// ── Diagnostic ──────────────────────────────────────────────────────────────
/**
 * Relit ce que le script de contenu a déposé depuis l'onglet LinkedIn.
 *
 * Le relevé passe par le stockage plutôt que par un message direct à l'onglet :
 * interroger un onglet demanderait la permission `tabs`, dont l'extension n'a
 * aucun autre besoin.
 */
function renderDiagnostic(report) {
  if (!report) {
    return [
      "Aucun relevé.",
      "",
      "Le script de contenu ne s'est pas exécuté. Deux causes, dans l'ordre :",
      "  1. l'onglet LinkedIn était déjà ouvert à l'installation — recharge-le ;",
      "  2. l'extension est désactivée ou en erreur — vois chrome://extensions.",
    ].join("\n");
  }

  const age = Math.round((Date.now() - Date.parse(report.at)) / 1000);

  // Un démarrage qui lève laisse la page muette : c'est la seule chose qui
  // compte, elle passe donc avant tout le reste.
  if (report.erreur) {
    return [
      `Le script a échoué au démarrage il y a ${age} s — ${report.url}`,
      "",
      report.erreur,
      "",
      "Envoie-moi ce texte : il nomme la ligne fautive.",
    ].join("\n");
  }

  const lines = [
    `Relevé il y a ${age} s — ${report.url}`,
    `Publications décorées : ${report.detected}`,
    `Boutons « Commenter » repérés : ${report.anchors}`,
    `Conteneurs reconnus : ${report.posts}`,
    `Cibles retenues : ${report.targets}`,
  ];

  const sample = report.echantillon;
  if (sample) {
    lines.push(
      "",
      "Texte lu sur la première publication :",
      `  source : ${sample.source} · auteur : ${sample.auteur || "—"} · média : ${sample.media || "—"}`,
      `  ${sample.longueur} caractères`,
      sample.debut ? `  « ${sample.debut} »` : "  (rien)",
    );
  }

  // Le balisage réellement rencontré, nommé. C'est ce qui manquait le jour où
  // tous les sélecteurs sont tombés à zéro d'un coup : il fallait alors deviner
  // les nouveaux noms au lieu de les lire.
  const conteneurs = report.conteneurs || [];
  if (conteneurs.length > 0) {
    lines.push("", "Cartes atteintes par le bouton « Commenter » :");
    for (const signature of conteneurs) lines.push(`  ${signature}`);
  }

  lines.push("", "Détail par sélecteur :");
  for (const [selector, count] of Object.entries(report.counts || {})) {
    lines.push(`  ${count === 0 ? "·" : "✓"} ${String(count).padStart(4)}  ${selector}`);
  }
  lines.push(
    "",
    "Les sélecteurs de champ de saisie (`ql-editor`, `role=textbox`) comptent 0",
    "tant qu'aucune boîte de commentaire n'est ouverte : c'est normal, LinkedIn",
    "ne rend le champ qu'au clic sur « Commenter ».",
  );
  if (report.anchors === 0 && report.posts === 0) {
    lines.push(
      "",
      "Aucun repère trouvé : soit la page n'est pas un fil d'actualité, soit",
      "LinkedIn a renommé son balisage. Envoie-moi ce relevé.",
    );
  } else if (report.anchors >= 3 && report.targets <= 1) {
    lines.push(
      "",
      `${report.anchors} boutons « Commenter » mais ${report.targets} cible : la remontée`,
      "vers la carte s'arrête trop haut et une seule publication absorbe les",
      "autres. Envoie-moi ce relevé avec les signatures ci-dessus.",
    );
  }
  return lines.join("\n");
}

$("diag").addEventListener("click", async () => {
  const stored = await chrome.storage.local.get("diagnostic");
  $("diagOut").textContent = renderDiagnostic(stored.diagnostic);
});
