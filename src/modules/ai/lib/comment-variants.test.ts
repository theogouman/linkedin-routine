import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMENT_SLOTS,
  REPLY_SLOTS,
  SLOT_TO_CATEGORY,
  asIntention,
  countTypos,
  describeIncompleteness,
  generationSchema,
  slotsFor,
  type GenerationPayload,
} from "./comment-variants";

function payload(overrides: Partial<GenerationPayload> = {}): GenerationPayload {
  return {
    post_exploitable: true,
    variantes: COMMENT_SLOTS.map((slot) => ({
      slot,
      texte: `texte ${slot}`,
      extrait_post: "extrait",
      fait_utilise: null,
      position_utilisee: null,
      coquille: false,
    })),
    ...overrides,
  };
}

describe("slotsFor", () => {
  it("donne quatre emplacements distincts par mode", () => {
    expect(slotsFor("commentaire")).toEqual(COMMENT_SLOTS);
    expect(slotsFor("reponse")).toEqual(REPLY_SLOTS);
    expect(new Set([...COMMENT_SLOTS, ...REPLY_SLOTS]).size).toBe(8);
  });
});

describe("asIntention", () => {
  it("accepte les cinq intentions et rien d'autre", () => {
    expect(asIntention("desaccord")).toBe("desaccord");
    expect(asIntention("sarcasme")).toBeNull();
    expect(asIntention(null)).toBeNull();
    expect(asIntention(42)).toBeNull();
  });
});

describe("SLOT_TO_CATEGORY", () => {
  it("renvoie chaque emplacement vers une catégorie qui existe déjà au corpus", () => {
    // La réinjection ne doit pas créer de vocabulaire nouveau : la contrainte
    // CHECK de la migration refuserait la ligne, en silence côté app.
    const known = new Set([
      "question", "reaction_courte", "avis_court", "experience_perso",
      "avis_nuance", "accord_plus_ajout", "felicitation_appreciation",
      "humour", "expertise_structuree",
      "reponse_accord_court", "reponse_remerciement", "reponse_argumentee",
      "reponse_lead_magnet",
    ]);
    for (const slot of [...COMMENT_SLOTS, ...REPLY_SLOTS]) {
      expect(known.has(SLOT_TO_CATEGORY[slot])).toBe(true);
    }
  });
});

describe("generationSchema", () => {
  it("accepte la forme attendue", () => {
    expect(generationSchema.safeParse(payload()).success).toBe(true);
  });

  it("refuse un emplacement inconnu", () => {
    const bad = { ...payload(), variantes: [{ ...payload().variantes[0]!, slot: "poème" }] };
    expect(generationSchema.safeParse(bad).success).toBe(false);
  });

  it("exige que coquille soit présent : c'est lui qui pilote le suivi §7.8", () => {
    const first = payload().variantes[0]!;
    const withoutTypo: Record<string, unknown> = { ...first };
    delete withoutTypo.coquille;
    expect(generationSchema.safeParse({ post_exploitable: true, variantes: [withoutTypo] }).success).toBe(false);
  });
});

describe("describeIncompleteness", () => {
  it("valide quatre variantes bien formées", () => {
    expect(describeIncompleteness(payload(), "commentaire")).toBeNull();
  });

  it("signale un emplacement manquant", () => {
    const partial = { ...payload(), variantes: payload().variantes.slice(0, 3) };
    expect(describeIncompleteness(partial, "commentaire")).toContain("humour_ou_bravo");
  });

  it("signale un emplacement du mauvais mode", () => {
    // Le piège : le modèle rend les slots de réponse alors qu'on commente.
    expect(describeIncompleteness(payload(), "reponse")).not.toBeNull();
  });

  it("n'attend que deux variantes quand le post est inexploitable", () => {
    const poor: GenerationPayload = {
      post_exploitable: false,
      variantes: payload().variantes.filter(
        (v) => v.slot === "reaction_courte" || v.slot === "humour_ou_bravo",
      ),
    };
    expect(describeIncompleteness(poor, "commentaire")).toBeNull();
  });

  it("refuse une variante au texte vide", () => {
    const empty = payload();
    empty.variantes[1]!.texte = "   ";
    expect(describeIncompleteness(empty, "commentaire")).toContain("vides");
  });
});

describe("countTypos", () => {
  it("compte les variantes portant une coquille", () => {
    const typos = payload();
    typos.variantes[0]!.coquille = true;
    typos.variantes[2]!.coquille = true;
    expect(countTypos(typos)).toBe(2);
  });
});

// ── L'asset du cerveau ─────────────────────────────────────────────────────
/**
 * Le cerveau part en system à chaque appel, MIS EN CACHE. Deux choses doivent
 * rester vraies : il est complet, et il ne change pas par accident.
 *
 * L'empreinte est épinglée ici volontairement. Une modification du cerveau est
 * une décision de Théo : le test échoue, on lit la nouvelle empreinte, on la
 * reporte — et on sait que le cache va s'invalider une fois, ce qui est normal.
 */
describe("cerveau v2", () => {
  const text = readFileSync("src/modules/ai/assets/cerveau-commentaires-theo-v2.md", "utf8");

  it("contient les sections dont dépendent les contrôles", () => {
    for (const section of [
      "<faits_verifies>",
      "<positions>",
      "<voix>",
      "<les_quatre_variantes>",
      "<ancrage>",
      "<imperfections>",
      "<mode_reponse>",
      "<format_de_sortie>",
    ]) {
      expect(text).toContain(section);
    }
  });

  it("déclare bien F1 à F22 et P1 à P23, les bornes que le code valide", () => {
    expect(text).toContain("\nF22 ");
    expect(text).not.toContain("\nF23 ");
    expect(text).toContain("\nP23 ");
    expect(text).not.toContain("\nP24 ");
  });

  it("garde l'empreinte attendue", () => {
    const version = createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
    expect(version).toBe("2d8db8748359");
  });
});
