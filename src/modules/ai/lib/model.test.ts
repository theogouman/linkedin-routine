import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, supportsEffort } from "./model";

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
