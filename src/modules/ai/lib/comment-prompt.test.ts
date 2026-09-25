import { describe, expect, it } from "vitest";
import { buildCommentPrompt, buildReplyPrompt, detectLanguage } from "./comment-prompt";
import type { SelectedExample } from "./comment-examples";

const examples: SelectedExample[] = [
  {
    id: 1,
    texte: "Insane l'animation",
    categorie: "reaction_courte",
    mots: 2,
    date: "2026-01-01T00:00:00Z",
    role: "reaction_courte",
  },
];

describe("detectLanguage", () => {
  it("reconnaît un post français", () => {
    expect(detectLanguage("Le meilleur moment pour poster n'existe pas, ce qui existe c'est la régularité")).toBe("fr");
  });

  it("reconnaît un post anglais", () => {
    expect(detectLanguage("The best time to post does not exist, what exists is consistency and the work")).toBe("en");
  });

  it("retombe sur le français quand rien ne tranche", () => {
    // Un post trop court pour décider est un post où Théo écrira en français.
    expect(detectLanguage("🚀🚀🚀")).toBe("fr");
  });
});

describe("buildCommentPrompt", () => {
  const base = {
    examples,
    authorName: "Alice Martin",
    postBody: "On a doublé nos RDV en passant à des alertes Notion.",
    visuel: null,
    intention: null,
  };

  it("place les données avant la consigne", () => {
    const prompt = buildCommentPrompt(base);
    expect(prompt.indexOf("<post>")).toBeLessThan(prompt.indexOf("Génère les 4 variantes."));
    expect(prompt.trimEnd().endsWith("Génère les 4 variantes.")).toBe(true);
  });

  it("n'émet que le texte des exemples", () => {
    const prompt = buildCommentPrompt(base);
    expect(prompt).toContain("<exemple>Insane l'animation</exemple>");
    expect(prompt).not.toContain("reaction_courte");
  });

  it("omet la balise d'intention quand elle est vide", () => {
    expect(buildCommentPrompt(base)).not.toContain("<intention>");
    expect(buildCommentPrompt({ ...base, intention: "desaccord" })).toContain(
      "<intention>desaccord</intention>",
    );
  });

  it("transmet l'auteur, et rien de plus", () => {
    // La relation (inconnu / connaissance / proche) a été retirée : elle n'est
    // pas encodable — on peut être proche de X sur un sujet et distant sur un
    // autre — et le cerveau ne s'en servait que pour autoriser des vannes plus
    // cash, ce qui n'a jamais été le registre de Théo.
    expect(buildCommentPrompt(base)).toContain("<auteur>Alice Martin</auteur>");
    expect(buildCommentPrompt(base)).not.toContain("relation");
  });

  it("décrit le visuel quand l'app ne peut pas le montrer", () => {
    expect(buildCommentPrompt({ ...base, visuel: "une image accompagne le post" })).toContain(
      "[visuel : une image accompagne le post]",
    );
  });

  it("dit explicitement qu'un post est sans texte plutôt que d'envoyer du vide", () => {
    expect(buildCommentPrompt({ ...base, postBody: "   " })).toContain("(publication sans texte)");
  });

  it("tronque un post démesuré en le signalant", () => {
    const prompt = buildCommentPrompt({ ...base, postBody: "mot ".repeat(3000) });
    expect(prompt).toContain("[..post tronqué..]");
    expect(prompt.length).toBeLessThan(5000);
  });
});

describe("buildReplyPrompt", () => {
  const base = {
    examples,
    ownPostBody: "Ma publication de la semaine.",
    commenterName: "Bruno Leroy",
    commentBody: "Très juste, je le vois pareil.",
  };

  it("annonce le mode réponse en premier", () => {
    expect(buildReplyPrompt(base).startsWith("<mode>reponse</mode>")).toBe(true);
  });

  it("porte le commentaire reçu et son auteur", () => {
    const prompt = buildReplyPrompt(base);
    expect(prompt).toContain('<commentaire_recu auteur="Bruno Leroy">Très juste, je le vois pareil.</commentaire_recu>');
  });

  it("échappe un guillemet dans le nom plutôt que de casser la balise", () => {
    const prompt = buildReplyPrompt({ ...base, commenterName: 'Jean "JP" Dupont' });
    expect(prompt).toContain('auteur="Jean &quot;JP&quot; Dupont"');
  });

  it("ne garde que le début du post de Théo : il n'est là que pour le contexte", () => {
    const prompt = buildReplyPrompt({ ...base, ownPostBody: "x".repeat(2000) });
    expect(prompt).toContain("[..]");
    expect(prompt.length).toBeLessThan(1400);
  });
});
