import { describe, expect, it } from "vitest";
import {
  categoriesForSlot,
  lengthBucket,
  looksLikeLeadMagnet,
  maxWordsForSlot,
  openingSignature,
  renderExamples,
  selectExamples,
  type ExampleRow,
} from "./comment-examples";
import { COMMENT_SLOTS, REPLY_SLOTS } from "./comment-variants";

const NOW = new Date("2026-09-25T12:00:00Z");

function row(id: number, texte: string, overrides: Partial<ExampleRow> = {}): ExampleRow {
  return {
    id,
    texte,
    categorie: "avis_court",
    mots: texte.trim().split(/\s+/).filter(Boolean).length,
    date: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Tirage déterministe : toujours le premier candidat du vivier pondéré. */
const first = () => 0;

describe("categoriesForSlot", () => {
  it("élargit l'avis à quatre catégories, parce que l'étiquetage est heuristique", () => {
    expect(categoriesForSlot("avis", null)).toHaveLength(4);
  });

  it("restreint l'avis aux nuancés quand le désaccord est demandé", () => {
    expect(categoriesForSlot("avis", "desaccord")).toEqual(["avis_nuance"]);
  });

  it("fait piocher fond et relance dans la même catégorie de réponses", () => {
    expect(categoriesForSlot("fond", null)).toEqual(categoriesForSlot("relance", null));
  });

  it("couvre les huit emplacements", () => {
    for (const slot of [...COMMENT_SLOTS, ...REPLY_SLOTS]) {
      expect(categoriesForSlot(slot, null).length).toBeGreaterThan(0);
    }
  });
});

describe("maxWordsForSlot", () => {
  it("borne la réaction courte à six mots, et rien d'autre", () => {
    expect(maxWordsForSlot("reaction_courte")).toBe(6);
    expect(maxWordsForSlot("avis")).toBeNull();
  });
});

describe("looksLikeLeadMagnet", () => {
  it("reconnaît un mot-clé seul", () => {
    expect(looksLikeLeadMagnet("GEO")).toBe(true);
    expect(looksLikeLeadMagnet("SCPI")).toBe(true);
  });

  it("refuse une vraie phrase courte", () => {
    expect(looksLikeLeadMagnet("Merci beaucoup !")).toBe(false);
    expect(looksLikeLeadMagnet("Très bon point, je suis d'accord")).toBe(false);
  });

  it("refuse le vide", () => {
    expect(looksLikeLeadMagnet("   ")).toBe(false);
  });
});

describe("openingSignature", () => {
  it("retient les trois premiers mots, sans casse ni ponctuation", () => {
    expect(openingSignature("Très propre, tu l'as fait comment ?")).toBe("très propre tu");
  });

  it("rapproche deux ouvertures identiques à la ponctuation près", () => {
    expect(openingSignature("100%, je le vois")).toBe(openingSignature("100% je le pense"));
  });
});

describe("lengthBucket", () => {
  it("découpe en court, moyen, long", () => {
    expect(lengthBucket(4)).toBe("court");
    expect(lengthBucket(15)).toBe("moyen");
    expect(lengthBucket(35)).toBe("long");
  });
});

describe("selectExamples", () => {
  const pools = {
    bySlot: {
      question: [row(1, "Tu fais ça avec quoi ?", { categorie: "question" })],
      reaction_courte: [row(2, "Insane l'animation", { categorie: "reaction_courte" })],
      avis: [row(3, "100%, je le vois aussi de mon côté sur les projets clients")],
      humour_ou_bravo: [row(4, "Bravo les boss", { categorie: "humour" })],
    },
    thematique: [row(5, "Curieux du résultat sur la durée")],
  };

  it("rend un exemple par emplacement plus le thématique", () => {
    const selected = selectExamples({
      mode: "commentaire",
      slots: COMMENT_SLOTS,
      pools,
      now: NOW,
      random: first,
    });
    expect(selected).toHaveLength(5);
    expect(selected.map((e) => e.role)).toEqual([
      "question",
      "reaction_courte",
      "avis",
      "humour_ou_bravo",
      "thematique",
    ]);
  });

  it("ne rend jamais deux fois le même exemple", () => {
    // fond et relance piochent dans la même catégorie : c'est le cas où la
    // collision est structurelle, pas accidentelle.
    const shared = [
      row(10, "Première réponse argumentée sur le sujet"),
      row(11, "Seconde réponse, tout autre angle"),
    ];
    const selected = selectExamples({
      mode: "reponse",
      slots: REPLY_SLOTS,
      pools: {
        bySlot: {
          accord_court: [row(12, "Exactement, Sabra!")],
          merci: [row(13, "Avec plaisir, Charly!")],
          fond: shared,
          relance: shared,
        },
        thematique: [],
      },
      now: NOW,
      random: first,
    });
    const ids = selected.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(10);
    expect(ids).toContain(11);
  });

  it("évite deux exemples ouvrant sur les mêmes trois mots", () => {
    const selected = selectExamples({
      mode: "commentaire",
      slots: COMMENT_SLOTS,
      pools: {
        bySlot: {
          question: [row(20, "Très propre, tu fais comment ?")],
          reaction_courte: [row(21, "Très propre, tu gères")],
          avis: [row(22, "Très propre, tu assures vraiment"), row(23, "Pareil de mon côté, ça marche")],
          humour_ou_bravo: [],
        },
        thematique: [],
      },
      now: NOW,
      random: first,
    });
    const openings = selected.map((e) => openingSignature(e.texte));
    // Les trois candidats ouvrent sur « très propre tu ». `reaction_courte`
    // n'avait pas d'alternative : sa collision est acceptée plutôt que de
    // laisser l'emplacement vide. `avis` en avait une, et l'a prise.
    expect(openings).toContain("pareil de mon");
    expect(openings.filter((o) => o === "très propre tu")).toHaveLength(2);
  });

  it("préfère le récent à ancienneté égale de vivier", () => {
    const selected = selectExamples({
      mode: "commentaire",
      slots: ["avis"],
      pools: {
        bySlot: {
          avis: [
            row(30, "Vieux commentaire de deux mille vingt-trois", { date: "2023-06-01T00:00:00Z" }),
            row(31, "Commentaire de cette année", { date: "2026-09-01T00:00:00Z" }),
          ],
        },
        thematique: [],
      },
      now: NOW,
      // Milieu de la masse pondérée : le récent pèse 8 fois le vieux, donc
      // c'est lui qui occupe le milieu.
      random: () => 0.5,
    });
    expect(selected[0]?.id).toBe(31);
  });

  it("varie les longueurs plutôt que de rendre cinq exemples du même calibre", () => {
    const court = (id: number) => row(id, "Propre !", { mots: 2 });
    const long = (id: number, n: number) =>
      row(id, Array.from({ length: n }, (_, i) => `mot${i}`).join(" "), { mots: n });
    const selected = selectExamples({
      mode: "commentaire",
      slots: COMMENT_SLOTS,
      pools: {
        bySlot: {
          question: [court(40)],
          reaction_courte: [court(41)],
          // Le troisième court est fortement découragé au profit du long.
          avis: [court(42), long(43, 30)],
          humour_ou_bravo: [court(44), long(45, 25)],
        },
        thematique: [],
      },
      now: NOW,
      random: () => 0.5,
    });
    const buckets = new Set(selected.map((e) => lengthBucket(e.mots)));
    expect(buckets.size).toBeGreaterThan(1);
  });

  it("rend moins de cinq exemples plutôt que d'en inventer quand un vivier est vide", () => {
    const selected = selectExamples({
      mode: "commentaire",
      slots: COMMENT_SLOTS,
      pools: { bySlot: { question: [row(50, "Une question ?")] }, thematique: [] },
      now: NOW,
      random: first,
    });
    expect(selected).toHaveLength(1);
  });

  it("marche sans aucun embedding : le thématique manque, les quatre autres restent", () => {
    const selected = selectExamples({
      mode: "commentaire",
      slots: COMMENT_SLOTS,
      pools: { ...pools, thematique: [] },
      now: NOW,
      random: first,
    });
    expect(selected).toHaveLength(4);
    expect(selected.map((e) => e.role)).not.toContain("thematique");
  });
});

describe("renderExamples", () => {
  it("n'émet que le texte, sans métadonnée", () => {
    const rendered = renderExamples([
      { ...row(1, "Insane l'animation", { categorie: "reaction_courte" }), role: "reaction_courte" },
    ]);
    expect(rendered).toBe("<exemples_reels>\n<exemple>Insane l'animation</exemple>\n</exemples_reels>");
    expect(rendered).not.toContain("reaction_courte");
    expect(rendered).not.toContain("2026");
  });
});
