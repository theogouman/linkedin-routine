import { describe, expect, it } from "vitest";
import { asReactionType, DEFAULT_REACTION, REACTIONS, reaction } from "./reactions";

/**
 * Le vocabulaire des réactions est aussi une contrainte `check` en base
 * (migration 007) et une valeur transmise à l'API d'écriture. Les trois
 * doivent rester d'accord : une réaction connue de l'interface mais absente de
 * la contrainte ferait échouer la mise en file, et une réaction acceptée en
 * file mais inconnue d'Unipile échouerait à l'envoi — c'est-à-dire après la
 * validation manuelle, quand plus rien ne peut être corrigé.
 */
const IN_MIGRATION_007 = ["like", "celebrate", "support", "love", "insightful", "funny"];

describe("vocabulaire des réactions", () => {
  it("correspond exactement à la contrainte de la migration 007", () => {
    expect(REACTIONS.map((entry) => entry.type)).toEqual(IN_MIGRATION_007);
  });

  it("retombe sur `like` pour une valeur inconnue plutôt que de lever", () => {
    // Une réaction inconnue en base ne doit pas faire échouer l'affichage du
    // feed entier : elle doit se dégrader en pouce bleu.
    expect(asReactionType("wow")).toBe(DEFAULT_REACTION);
    expect(asReactionType(null)).toBe(DEFAULT_REACTION);
    expect(asReactionType(42)).toBe(DEFAULT_REACTION);
  });

  it("conserve une valeur connue", () => {
    expect(asReactionType("insightful")).toBe("insightful");
  });

  it("donne un libellé et une couleur à chaque réaction", () => {
    for (const entry of REACTIONS) {
      expect(reaction(entry.type).label).not.toBe("");
      expect(reaction(entry.type).color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
