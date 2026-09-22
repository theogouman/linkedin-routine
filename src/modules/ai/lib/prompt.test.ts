import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
  cleanGeneratedComment,
  SYSTEM_PREAMBLE,
} from "./prompt";
import { isPlaceholder, stripEditorialHeader } from "./process-files";

const PROCESS = `# Process — Commentaire

> **Placeholder.** Remplace ce bloc.
> Deuxième ligne de citation.

## Ton

Direct et factuel.
`;

describe("stripEditorialHeader", () => {
  it("retire le titre et le bloc de citation d'en-tête", () => {
    expect(stripEditorialHeader(PROCESS)).toBe("## Ton\n\nDirect et factuel.");
  });

  it("laisse intact un process qui commence directement par du contenu", () => {
    expect(stripEditorialHeader("Écris court.\n\n- Pas d'emoji.")).toBe(
      "Écris court.\n\n- Pas d'emoji.",
    );
  });

  it("ne mange pas une citation située plus bas dans le document", () => {
    const md = "## Ton\n\nDirect.\n\n> Exemple cité.";
    expect(stripEditorialHeader(md)).toContain("> Exemple cité.");
  });

  it("gère un fichier vide", () => {
    expect(stripEditorialHeader("")).toBe("");
    expect(stripEditorialHeader("# Titre seul\n")).toBe("");
  });
});

describe("isPlaceholder", () => {
  it("détecte le marqueur livré au build, même sur un fichier étoffé", () => {
    expect(isPlaceholder(PROCESS)).toBe(true);
  });

  it("ne se déclenche plus une fois le marqueur retiré", () => {
    const written = PROCESS.replace(/> \*\*Placeholder.*\n> .*\n/, "");
    expect(isPlaceholder(written)).toBe(false);
  });

  it("considère comme non rédigé un fichier vidé de son corps", () => {
    expect(isPlaceholder("# Titre seul\n")).toBe(true);
    expect(isPlaceholder("")).toBe(true);
  });

  it("accepte un process court mais réel", () => {
    expect(isPlaceholder("Écris court, sans emoji, à la première personne.")).toBe(false);
  });
});

describe("buildSystemPrompt", () => {
  it("encadre le process et lui donne la priorité", () => {
    const prompt = buildSystemPrompt(PROCESS);
    expect(prompt).toContain(SYSTEM_PREAMBLE);
    expect(prompt).toContain("le process gagne");
    expect(prompt).toContain("## Ton");
    // Les méta-instructions destinées à l'éditeur du fichier ne fuient pas.
    expect(prompt).not.toContain("Remplace ce bloc");
  });

  it("reste utilisable quand le process n'est pas encore rédigé", () => {
    const prompt = buildSystemPrompt("# Titre\n\n> À remplir.\n");
    expect(prompt).toContain("Process non encore rédigé");
  });
});

describe("buildUserPrompt", () => {
  it("compose le contexte d'un commentaire sur un post d'autrui", () => {
    const prompt = buildUserPrompt({
      kind: "comment_on_post",
      authorName: "Alice",
      postBody: "Trois leviers pour structurer son offre.",
      mediaNote: "carrousel document non affichable",
    });
    expect(prompt).toContain("Auteur de la publication : Alice");
    expect(prompt).toContain("Média : carrousel document non affichable");
    expect(prompt).toContain("Trois leviers");
  });

  it("signale une publication sans texte plutôt que d'envoyer du vide", () => {
    const prompt = buildUserPrompt({
      kind: "comment_on_post", authorName: null, postBody: "   ", mediaNote: null,
    });
    expect(prompt).toContain("(publication sans texte)");
    expect(prompt).toContain("inconnu");
  });

  it("compose le contexte d'une réponse avec le fil déjà échangé", () => {
    const prompt = buildUserPrompt({
      kind: "reply_to_comment",
      ownPostBody: "Mon post",
      commenterName: "Bob",
      commentBody: "Pas d'accord sur le point 2",
      thread: [{ author: "Théo", body: "Tu parles du délai ?" }],
    });
    expect(prompt).toContain("Commentaire de Bob");
    expect(prompt).toContain("Théo : Tu parles du délai ?");
  });

  it("tronque un post démesuré au lieu de le laisser gonfler le prompt", () => {
    const prompt = buildUserPrompt({
      kind: "comment_on_post", authorName: "Alice", postBody: "x".repeat(10_000), mediaNote: null,
    });
    expect(prompt).toContain("contenu tronqué");
    expect(prompt.length).toBeLessThan(7000);
  });
});

describe("cleanGeneratedComment", () => {
  it.each([
    ['"Un commentaire."', "Un commentaire."],
    ["« Un commentaire. »", "Un commentaire."],
    ["Voici le commentaire : Un commentaire.", "Un commentaire."],
    ["```\nUn commentaire.\n```", "Un commentaire."],
    ["  Un commentaire.  ", "Un commentaire."],
  ])("nettoie %p", (input, expected) => {
    expect(cleanGeneratedComment(input)).toBe(expected);
  });

  it("ne mange pas un guillemet intérieur légitime", () => {
    expect(cleanGeneratedComment('Il a dit "non" et il avait raison.')).toBe(
      'Il a dit "non" et il avait raison.',
    );
  });
});
