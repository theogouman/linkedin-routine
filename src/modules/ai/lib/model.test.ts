import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, normalizeGenerationSettings, supportsEffort } from "./model";

describe("modèle de génération", () => {
  it("cible Haiku par défaut", () => {
    expect(DEFAULT_MODEL).toBe("claude-haiku-4-5-20251001");
  });

  it("ne transmet pas l'effort au modèle par défaut", () => {
    // `output_config` n'existe pas sur Haiku 4.5 : l'envoyer ferait rejeter
    // CHAQUE génération. Le test est là pour que le jour où l'on rebascule le
    // défaut sur un autre modèle, on se pose la question dans le bon sens.
    expect(supportsEffort(DEFAULT_MODEL)).toBe(false);
  });

  it("transmet l'effort à la famille Claude 5", () => {
    expect(supportsEffort("claude-opus-5")).toBe(true);
    expect(supportsEffort("claude-sonnet-5")).toBe(true);
    expect(supportsEffort("claude-fable-5-1")).toBe(true);
  });

  it("ne le transmet à aucun modèle antérieur", () => {
    expect(supportsEffort("claude-haiku-4-5-20251001")).toBe(false);
    expect(supportsEffort("claude-3-5-sonnet-latest")).toBe(false);
    expect(supportsEffort("claude-sonnet-4-5")).toBe(false);
  });
});

describe("réglage de génération stocké", () => {
  it("retombe sur le défaut quand rien n'est stocké", () => {
    expect(normalizeGenerationSettings(null)).toEqual({
      model: DEFAULT_MODEL,
      effort: "low",
    });
  });

  it("refuse un effort inconnu plutôt que de le transmettre", () => {
    // Un effort inventé serait rejeté par l'API au moment de la génération,
    // c'est-à-dire devant l'utilisateur et sans indication de la cause.
    expect(normalizeGenerationSettings({ model: "claude-sonnet-5", effort: "turbo" })).toEqual({
      model: "claude-sonnet-5",
      effort: "low",
    });
  });

  it("accepte un modèle hors de la liste proposée", () => {
    // La liste des réglages est fermée, mais `ANTHROPIC_MODEL` doit pouvoir
    // pointer un modèle plus récent sans attendre un déploiement.
    expect(normalizeGenerationSettings({ model: "claude-fable-5-1", effort: "high" })).toEqual({
      model: "claude-fable-5-1",
      effort: "high",
    });
  });

  it("ignore une valeur vide", () => {
    expect(normalizeGenerationSettings({ model: "   " }).model).toBe(DEFAULT_MODEL);
  });
});
