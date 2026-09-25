import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkVariante,
  detectTell,
  firstPersonWithoutSource,
  isAnchored,
  normalizeTypography,
  orderForDisplay,
  tooLong,
  type CheckedVariante,
} from "./comment-checks";
import { COMMENT_SLOTS, type Variante } from "./comment-variants";

function variante(overrides: Partial<Variante> = {}): Variante {
  return {
    slot: "avis",
    texte: "Propre, ça change des templates habituels",
    extrait_post: "templates",
    fait_utilise: null,
    position_utilisee: null,
    coquille: false,
    ...overrides,
  };
}

describe("normalizeTypography", () => {
  it("remplace les apostrophes et guillemets typographiques", () => {
    expect(normalizeTypography("j’ai dit “bonjour”")).toBe(`j'ai dit "bonjour"`);
  });

  it("transforme le tiret long en double tiret sans doubler les espaces", () => {
    expect(normalizeTypography("oui — non")).toBe("oui -- non");
    expect(normalizeTypography("oui—non")).toBe("oui -- non");
  });

  it("ramène les points de suspension à deux points", () => {
    expect(normalizeTypography("bref…")).toBe("bref..");
  });
});

describe("isAnchored", () => {
  const post = "On a doublé nos RDV en passant à des alertes Notion\net un rappel sous 5 min.";

  it("accepte un extrait exact", () => {
    expect(isAnchored("des alertes Notion", post)).toBe(true);
  });

  it("tolère casse, espaces multiples et apostrophes typographiques", () => {
    expect(isAnchored("DES   ALERTES   notion", post)).toBe(true);
    expect(isAnchored("l’alerte", "une l'alerte")).toBe(true);
  });

  it("traverse un retour à la ligne du post", () => {
    expect(isAnchored("Notion et un rappel", post)).toBe(true);
  });

  it("refuse un extrait absent, même proche", () => {
    expect(isAnchored("des alertes Slack", post)).toBe(false);
  });

  it("refuse un extrait vide : un ancrage vide n'est pas un ancrage", () => {
    expect(isAnchored("   ", post)).toBe(false);
  });
});

describe("firstPersonWithoutSource", () => {
  it("laisse passer une affirmation adossée à un fait", () => {
    expect(firstPersonWithoutSource("j'ai remboursé un client", "F5")).toBeNull();
  });

  it("badge une affirmation personnelle sans fait", () => {
    expect(firstPersonWithoutSource("j'ai remboursé un client", null)).toBe("j'");
  });

  it("laisse passer les tournures d'opinion", () => {
    expect(firstPersonWithoutSource("je pense que c'est plus simple", null)).toBeNull();
    expect(firstPersonWithoutSource("j'ai l'impression que ça change", null)).toBeNull();
    expect(firstPersonWithoutSource("je suis curieux du résultat", null)).toBeNull();
  });

  it("badge quand une opinion COHABITE avec une affirmation", () => {
    // Le piège du contrôle : tester « contient une exception » laisserait
    // passer la moitié affirmative de la phrase.
    expect(
      firstPersonWithoutSource("je pense que oui, et j'ai remboursé un client", null),
    ).toBe("j'");
  });

  it("badge les marqueurs de possession sans première personne verbale", () => {
    expect(firstPersonWithoutSource("ça marche bien chez mes clients", null)).toBe("mes clients");
    expect(firstPersonWithoutSource("on le voit dans mon programme", null)).toBe("mon programme");
  });
});

describe("detectTell", () => {
  it("attrape les ouvertures du brief", () => {
    expect(detectTell("Tu as raison sur le levier, mais bon")).toBe("tu as raison sur");
    expect(detectTell("Ok pour l'IA en alliée, et après ?")).toBe("ok pour");
  });

  it("attrape l'antithèse finale", () => {
    expect(detectTell("Tu nourris l'algorithme, pas le pipeline.")).toBe("antithèse finale");
  });

  it("attrape les deux-points collés mais pas une heure ni une URL", () => {
    expect(detectTell("l'essentiel: chez les consultants")).toBe("deux-points collés");
    expect(detectTell("rendez-vous à 14: 30 demain")).toBeNull();
    expect(detectTell("c'est là https://ex.com/a: b")).toBeNull();
  });

  it("attrape le verbe d'observation en ouverture", () => {
    expect(detectTell("Tu pointes juste, le sujet est réel")).toBe("tu + verbe d'observation");
  });

  it("laisse passer les vraies tournures de Théo", () => {
    expect(detectTell("Insane l'animation")).toBeNull();
    expect(detectTell("Très propre, tu l'as réalisé avec quels outils ?")).toBeNull();
    expect(detectTell("100%, je le vois aussi de mon côté")).toBeNull();
    expect(detectTell("Hâte de voir ça")).toBeNull();
    expect(detectTell("Curieux de savoir comment tu fais")).toBeNull();
  });
});

describe("tooLong", () => {
  const short = "un deux trois quatre cinq six sept huit neuf dix onze douze treize";

  it("plafonne la réaction courte à douze mots", () => {
    expect(tooLong("reaction_courte", short, null)).toBe(13);
    expect(tooLong("reaction_courte", "un deux trois", null)).toBeNull();
  });

  it("plafonne les autres à quarante mots", () => {
    const long = Array.from({ length: 41 }, (_, i) => `m${i}`).join(" ");
    expect(tooLong("question", long, null)).toBe(41);
  });

  it("laisse un avis argumenté dépasser quarante mots", () => {
    const long = Array.from({ length: 60 }, (_, i) => `m${i}`).join(" ");
    expect(tooLong("avis", long, "P14")).toBeNull();
    expect(tooLong("avis", long, null)).toBe(60);
  });
});

describe("checkVariante", () => {
  const context = { source: "On a doublé nos RDV grâce à des alertes Notion" };

  it("ne lève aucun badge sur une variante saine", () => {
    const checked = checkVariante(
      variante({ texte: "Propre, tu les déclenches sur quel évènement ?", extrait_post: "alertes Notion" }),
      context,
    );
    expect(checked.badges).toEqual([]);
  });

  it("normalise le texte affiché", () => {
    const checked = checkVariante(
      variante({ texte: "j’adore…", extrait_post: "alertes Notion" }),
      context,
    );
    expect(checked.texte).toBe("j'adore..");
  });

  it("badge un identifiant hors plage", () => {
    const checked = checkVariante(
      variante({ fait_utilise: "F99", extrait_post: "alertes Notion" }),
      context,
    );
    expect(checked.badges.map((b) => b.kind)).toContain("identifiant_invalide");
  });

  it("traite un fait inventé comme une absence de source", () => {
    // Sans cette règle, il suffirait d'écrire « F99 » pour faire taire le
    // contrôle d'affirmation non sourcée.
    const checked = checkVariante(
      variante({ texte: "j'ai accompagné 300 boîtes", fait_utilise: "F99", extrait_post: "alertes Notion" }),
      context,
    );
    expect(checked.badges.map((b) => b.kind)).toContain("affirmation_non_sourcee");
  });

  it("cumule les badges d'une variante franchement mauvaise", () => {
    const checked = checkVariante(
      variante({ texte: "Tu as raison sur le fond, pas sur la forme.", extrait_post: "absent du post" }),
      context,
    );
    expect(checked.badges.map((b) => b.kind).sort()).toEqual(["non_ancre", "tournure_ia"]);
  });
});

describe("orderForDisplay", () => {
  it("relègue les badgées en bas sans les retirer", () => {
    const make = (slot: CheckedVariante["slot"], badged: boolean): CheckedVariante => ({
      ...variante({ slot }),
      badges: badged ? [{ kind: "trop_long", label: "trop long" }] : [],
    });
    const ordered = orderForDisplay(
      [make("question", true), make("reaction_courte", false), make("avis", false)],
      COMMENT_SLOTS,
    );
    expect(ordered.map((v) => v.slot)).toEqual(["reaction_courte", "avis", "question"]);
  });
});

// ── Calibration sur les données réelles ────────────────────────────────────
/**
 * Le test qui compte vraiment.
 *
 * Le filtre anti-tells est une liste de motifs ; une liste se dégrade en
 * silence dès qu'on y ajoute une idée sans mesurer. Ces deux seuils sont la
 * seule chose qui empêche le filtre de devenir soit décoratif, soit un
 * générateur de badges sur les vrais commentaires de Théo.
 *
 * Mesures au moment de l'écriture : 69,8 % des anti-exemples attrapés,
 * 2,24 % de faux positifs. Les seuils laissent de la marge pour que le test ne
 * casse pas sur un commentaire de plus dans le corpus.
 */
function loadJsonl(file: string): Array<{ texte: string }> {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as { texte: string });
}

describe("filtre anti-tells — calibration", () => {
  const anti = loadJsonl("data/anti-exemples-ia.jsonl");
  const reels = loadJsonl("data/corpus-commentaires-reels.jsonl");
  const flags = (rows: Array<{ texte: string }>) =>
    rows.filter((row) => detectTell(normalizeTypography(row.texte)) !== null).length;

  it("attrape la majorité des commentaires générés par l'outil de 2025", () => {
    const rate = flags(anti) / anti.length;
    expect(anti.length).toBe(139);
    expect(rate).toBeGreaterThanOrEqual(0.65);
  });

  it("reste sous 3 % de faux positifs sur les vrais commentaires", () => {
    const rate = flags(reels) / reels.length;
    expect(reels.length).toBe(2940);
    expect(rate).toBeLessThanOrEqual(0.03);
  });
});
