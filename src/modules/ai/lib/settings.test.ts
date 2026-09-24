import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_SETTINGS,
  EFFORT_LEVELS,
  SUGGESTED_MODELS,
  isEffort,
  isModelId,
  mergeAiSettings,
  validateAiSettings,
} from "./settings";

describe("isModelId", () => {
  it.each([...SUGGESTED_MODELS, "claude-opus-5-5", "claude-fable-5-1"])(
    "accepte %s",
    (id) => {
      expect(isModelId(id)).toBe(true);
    },
  );

  it.each([
    ["une chaîne vide", ""],
    ["un espace en plein milieu", "claude opus 5"],
    ["un autre fournisseur", "gpt-5"],
    ["un préfixe seul", "claude-"],
    ["des majuscules", "Claude-Opus-5"],
    ["un nombre", 5],
    ["null", null],
  ])("refuse %s", (_label, value) => {
    expect(isModelId(value)).toBe(false);
  });
});

describe("isEffort", () => {
  it.each(EFFORT_LEVELS)("accepte %s", (level) => {
    expect(isEffort(level)).toBe(true);
  });

  it.each([["une valeur hors énumération", "extreme"], ["un nombre", 3], ["null", null]])(
    "refuse %s",
    (_label, value) => {
      expect(isEffort(value)).toBe(false);
    },
  );
});

describe("mergeAiSettings", () => {
  it("renvoie la base quand rien n'est stocké", () => {
    expect(mergeAiSettings(DEFAULT_AI_SETTINGS, null)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("applique une surcharge partielle", () => {
    const merged = mergeAiSettings(DEFAULT_AI_SETTINGS, { effort: "medium" });
    expect(merged.effort).toBe("medium");
    expect(merged.model).toBe(DEFAULT_AI_SETTINGS.model);
  });

  it("écarte un modèle invalide et garde la base", () => {
    const merged = mergeAiSettings(DEFAULT_AI_SETTINGS, { model: "gpt-5" });
    expect(merged.model).toBe(DEFAULT_AI_SETTINGS.model);
  });

  it("écarte un effort invalide et garde la base", () => {
    const merged = mergeAiSettings(DEFAULT_AI_SETTINGS, { effort: "turbo" });
    expect(merged.effort).toBe(DEFAULT_AI_SETTINGS.effort);
  });

  it("accepte un modèle inconnu mais bien formé", () => {
    // La liste des modèles n'est pas fermée : un identifiant publié après ce
    // code doit passer sans redéploiement, c'est tout l'objet du réglage.
    const merged = mergeAiSettings(DEFAULT_AI_SETTINGS, { model: "claude-futur-9" });
    expect(merged.model).toBe("claude-futur-9");
  });

  it("ignore un réglage qui n'est pas un objet", () => {
    expect(mergeAiSettings(DEFAULT_AI_SETTINGS, "cassé")).toEqual(DEFAULT_AI_SETTINGS);
  });
});

describe("validateAiSettings", () => {
  it("accepte un réglage complet", () => {
    expect(validateAiSettings(DEFAULT_AI_SETTINGS)).toBeNull();
  });

  it("accepte une surcharge partielle", () => {
    expect(validateAiSettings({ effort: "max" })).toBeNull();
  });

  it("refuse un modèle d'un autre fournisseur", () => {
    expect(validateAiSettings({ model: "gpt-5" })).toContain("claude-");
  });

  it("énumère les efforts valides dans le message", () => {
    const message = validateAiSettings({ effort: "turbo" });
    for (const level of EFFORT_LEVELS) expect(message).toContain(level);
  });

  it("refuse une entrée qui n'est pas un objet", () => {
    expect(validateAiSettings(null)).not.toBeNull();
  });
});
