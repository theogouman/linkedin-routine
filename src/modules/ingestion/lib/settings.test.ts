import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYNC_SETTINGS,
  NUMERIC_SYNC_SETTINGS,
  SYNC_SETTINGS_BOUNDS,
  mergeSyncSettings,
  validateSyncSettings,
} from "./settings";

describe("mergeSyncSettings", () => {
  it("renvoie la base quand rien n'est stocké", () => {
    expect(mergeSyncSettings(DEFAULT_SYNC_SETTINGS, null)).toEqual(
      DEFAULT_SYNC_SETTINGS,
    );
  });

  it("ne copie pas la base par référence", () => {
    const merged = mergeSyncSettings(DEFAULT_SYNC_SETTINGS, null);
    merged.maxPostsPerAccount = 1;
    expect(DEFAULT_SYNC_SETTINGS.maxPostsPerAccount).toBe(20);
  });

  it("applique une surcharge partielle sans toucher au reste", () => {
    const merged = mergeSyncSettings(DEFAULT_SYNC_SETTINGS, {
      maxPostsPerAccount: 5,
    });
    expect(merged.maxPostsPerAccount).toBe(5);
    expect(merged.maxCommentsPerPost).toBe(
      DEFAULT_SYNC_SETTINGS.maxCommentsPerPost,
    );
  });

  it.each([
    ["une chaîne", "12"],
    ["un décimal", 7.5],
    ["zéro", 0],
    ["un négatif", -3],
    ["null", null],
  ])("écarte %s et retombe sur la base", (_label, value) => {
    const merged = mergeSyncSettings(DEFAULT_SYNC_SETTINGS, {
      maxPostsPerAccount: value,
    });
    expect(merged.maxPostsPerAccount).toBe(
      DEFAULT_SYNC_SETTINGS.maxPostsPerAccount,
    );
  });

  it("écarte une valeur au-dessus de la borne haute", () => {
    const merged = mergeSyncSettings(DEFAULT_SYNC_SETTINGS, {
      maxPostsPerAccount: SYNC_SETTINGS_BOUNDS.maxPostsPerAccount.max + 1,
    });
    expect(merged.maxPostsPerAccount).toBe(
      DEFAULT_SYNC_SETTINGS.maxPostsPerAccount,
    );
  });

  it.each(NUMERIC_SYNC_SETTINGS)("accepte exactement les bornes de %s", (key) => {
    const bound = SYNC_SETTINGS_BOUNDS[key];
    // Le rattrapage est monté au maximum dans les deux cas : sans lui,
    // l'alignement historique/rattrapage masquerait ce qu'on vérifie ici.
    const ceiling = { maxLookbackDays: SYNC_SETTINGS_BOUNDS.maxLookbackDays.max };
    expect(
      mergeSyncSettings(DEFAULT_SYNC_SETTINGS, { ...ceiling, [key]: bound.min })[key],
    ).toBe(bound.min);
    expect(
      mergeSyncSettings(DEFAULT_SYNC_SETTINGS, { ...ceiling, [key]: bound.max })[key],
    ).toBe(bound.max);
  });

  it("ignore un réglage qui n'est pas un objet", () => {
    expect(mergeSyncSettings(DEFAULT_SYNC_SETTINGS, "cassé")).toEqual(
      DEFAULT_SYNC_SETTINGS,
    );
  });

  it("aligne un historique plus profond que le rattrapage maximal", () => {
    const merged = mergeSyncSettings(DEFAULT_SYNC_SETTINGS, {
      initialBackfillDays: 120,
      maxLookbackDays: 30,
    });
    expect(merged.initialBackfillDays).toBe(30);
    expect(merged.maxLookbackDays).toBe(30);
  });
});

describe("validateSyncSettings", () => {
  it("accepte un réglage complet et valide", () => {
    expect(validateSyncSettings(DEFAULT_SYNC_SETTINGS)).toBeNull();
  });

  it("accepte une surcharge partielle", () => {
    expect(validateSyncSettings({ maxCommentsPerPost: 10 })).toBeNull();
  });

  it("nomme la borne dépassée", () => {
    const message = validateSyncSettings({ maxPostsPerAccount: 10_000 });
    expect(message).toContain(SYNC_SETTINGS_BOUNDS.maxPostsPerAccount.label);
    expect(message).toContain("200");
  });

  it("refuse un décimal", () => {
    expect(validateSyncSettings({ initialBackfillDays: 3.5 })).not.toBeNull();
  });

  it("refuse zéro, qui désactiverait la récupération en silence", () => {
    expect(validateSyncSettings({ maxPostsPerAccount: 0 })).not.toBeNull();
  });

  it("refuse un historique plus profond que le rattrapage", () => {
    expect(
      validateSyncSettings({ initialBackfillDays: 60, maxLookbackDays: 30 }),
    ).toContain("rattrapage");
  });

  it("refuse une entrée qui n'est pas un objet", () => {
    expect(validateSyncSettings(null)).not.toBeNull();
    expect(validateSyncSettings(42)).not.toBeNull();
  });
});
