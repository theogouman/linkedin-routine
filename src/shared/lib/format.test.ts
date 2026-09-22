import { describe, expect, it } from "vitest";
import {
  formatMinuteOfDay,
  parseMinuteOfDay,
  relativeTime,
  scheduledLabel,
} from "./format";

const NOW = new Date("2026-03-17T12:00:00Z");

describe("relativeTime", () => {
  it.each([
    ["2026-03-17T11:59:30Z", "à l'instant"],
    ["2026-03-17T11:40:00Z", "il y a 20 min"],
    ["2026-03-17T09:00:00Z", "il y a 3 h"],
    ["2026-03-16T10:00:00Z", "hier"],
    ["2026-03-14T10:00:00Z", "il y a 3 j"],
  ])("rend %p en %p", (iso, expected) => {
    expect(relativeTime(iso, NOW)).toBe(expected);
  });

  it("bascule sur une date au-delà d'une semaine", () => {
    expect(relativeTime("2026-02-10T10:00:00Z", NOW)).toMatch(/févr/);
  });

  it("ajoute l'année pour une publication d'une autre année", () => {
    expect(relativeTime("2025-02-10T10:00:00Z", NOW)).toMatch(/2025/);
  });

  it("ne panique pas sur une date invalide ou future", () => {
    expect(relativeTime("pas une date", NOW)).toBe("");
    expect(relativeTime("2026-03-18T10:00:00Z", NOW)).toBe("à l'instant");
  });
});

describe("scheduledLabel", () => {
  it("distingue aujourd'hui, demain et plus tard", () => {
    expect(scheduledLabel("2026-03-17T15:30:00Z", NOW, "UTC")).toBe("aujourd'hui à 15:30");
    expect(scheduledLabel("2026-03-18T08:00:00Z", NOW, "UTC")).toBe("demain à 08:00");
    expect(scheduledLabel("2026-03-23T08:00:00Z", NOW, "UTC")).toMatch(/lun/);
  });

  it("rend une chaîne vide sur une date invalide", () => {
    expect(scheduledLabel("n'importe quoi", NOW, "UTC")).toBe("");
  });
});

describe("formatMinuteOfDay / parseMinuteOfDay", () => {
  it("fait l'aller-retour", () => {
    expect(formatMinuteOfDay(8 * 60)).toBe("08:00");
    expect(formatMinuteOfDay(12 * 60 + 30)).toBe("12:30");
    expect(parseMinuteOfDay("08:00")).toBe(480);
    expect(parseMinuteOfDay("19:00")).toBe(1140);
  });

  it("refuse une saisie invalide", () => {
    expect(parseMinuteOfDay("25:00")).toBeNull();
    expect(parseMinuteOfDay("8h")).toBeNull();
    expect(parseMinuteOfDay("")).toBeNull();
  });
});
