import { describe, expect, it } from "vitest";
import {
  computeFetchWindow,
  computeReceivedCommentsWindow,
  toCommentPostedLimit,
  toPostedLimit,
} from "./cursor";

const NOW = new Date("2026-03-17T10:00:00Z");
const BASE = { now: NOW, initialBackfillDays: 7, maxLookbackDays: 90 };
const DAY = 86_400_000;

describe("computeFetchWindow", () => {
  it("amorce un compte neuf sur la profondeur de backfill", () => {
    const window = computeFetchWindow({ lastSyncedAt: null }, BASE);
    expect(window.isInitial).toBe(true);
    expect(window.since.toISOString()).toBe("2026-03-10T10:00:00.000Z");
  });

  it("repart du curseur avec un léger chevauchement", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: new Date("2026-03-17T09:00:00Z") },
      BASE,
    );
    expect(window.isInitial).toBe(false);
    expect(window.since.toISOString()).toBe("2026-03-17T08:50:00.000Z");
  });

  it("ne redemande jamais une fenêtre fixe : deux passages rapprochés donnent deux fenêtres différentes", () => {
    const first = computeFetchWindow({ lastSyncedAt: null }, BASE);
    const second = computeFetchWindow({ lastSyncedAt: NOW }, BASE);
    expect(second.since.getTime()).toBeGreaterThan(first.since.getTime());
  });

  it("plafonne après une très longue absence et le signale", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: new Date("2025-01-01T00:00:00Z") },
      BASE,
    );
    expect(window.truncated).toBe(true);
    expect(window.since.toISOString()).toBe(
      new Date(NOW.getTime() - 90 * DAY).toISOString(),
    );
  });

  it("plafonne aussi un backfill initial plus profond que la limite", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: null },
      { ...BASE, initialBackfillDays: 365 },
    );
    expect(window.since.toISOString()).toBe(
      new Date(NOW.getTime() - 90 * DAY).toISOString(),
    );
  });

  it("ramène à maintenant un curseur situé dans le futur", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: new Date("2026-04-01T00:00:00Z") },
      { ...BASE, overlapMinutes: 0 },
    );
    expect(window.since.toISOString()).toBe(NOW.toISOString());
  });

  it("respecte un chevauchement personnalisé", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: new Date("2026-03-17T09:00:00Z") },
      { ...BASE, overlapMinutes: 60 },
    );
    expect(window.since.toISOString()).toBe("2026-03-17T08:00:00.000Z");
  });
});

describe("computeReceivedCommentsWindow", () => {
  const options = { ...BASE, windowDays: 30 };

  it("n'excède jamais la fenêtre glissante de 30 jours", () => {
    const window = computeReceivedCommentsWindow(
      { lastSyncedAt: new Date("2025-06-01T00:00:00Z") },
      options,
    );
    expect(window.since.toISOString()).toBe(
      new Date(NOW.getTime() - 30 * DAY).toISOString(),
    );
  });

  it("prend le curseur quand il est plus récent que la fenêtre", () => {
    const window = computeReceivedCommentsWindow(
      { lastSyncedAt: new Date("2026-03-17T09:00:00Z") },
      options,
    );
    expect(window.since.toISOString()).toBe("2026-03-17T08:50:00.000Z");
  });

  it("borne l'amorçage à la fenêtre glissante", () => {
    const window = computeReceivedCommentsWindow({ lastSyncedAt: null }, options);
    expect(window.since.toISOString()).toBe("2026-03-10T10:00:00.000Z");
  });
});

describe("toPostedLimit", () => {
  it.each([
    [30 * 60_000, "1h"],
    [5 * 3_600_000, "24h"],
    [3 * DAY, "week"],
    [20 * DAY, "month"],
    [60 * DAY, "3months"],
    [150 * DAY, "6months"],
    [300 * DAY, "year"],
    [800 * DAY, "any"],
  ])("traduit un recul de %dms en %s", (ageMs, expected) => {
    expect(toPostedLimit(new Date(NOW.getTime() - ageMs), NOW)).toBe(expected);
  });
});

describe("toCommentPostedLimit", () => {
  it("retombe sur 'any' au-delà des valeurs acceptées par l'actor", () => {
    expect(toCommentPostedLimit(new Date(NOW.getTime() - 60 * DAY), NOW)).toBe("any");
    expect(toCommentPostedLimit(new Date(NOW.getTime() - 3 * DAY), NOW)).toBe("week");
  });
});

describe("computeFetchWindow — date de départ", () => {
  const START = new Date("2026-03-17T00:00:00Z");

  it("borne l'amorçage d'un compte neuf à la date de départ", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: null },
      { ...BASE, startDate: START },
    );
    expect(window.isInitial).toBe(true);
    expect(window.since.toISOString()).toBe(START.toISOString());
  });

  it("ne marque pas la fenêtre comme tronquée : c'est un choix, pas une perte", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: null },
      { ...BASE, startDate: START },
    );
    expect(window.truncated).toBe(false);
  });

  it("laisse un curseur plus récent que la date de départ intact", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: new Date("2026-03-17T09:00:00Z") },
      { ...BASE, startDate: START },
    );
    expect(window.since.toISOString()).toBe("2026-03-17T08:50:00.000Z");
  });

  it("remonte un curseur antérieur à la date de départ jusqu'à elle", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: new Date("2026-03-10T09:00:00Z") },
      { ...BASE, startDate: START },
    );
    expect(window.since.toISOString()).toBe(START.toISOString());
  });

  it("l'emporte aussi sur le plafond de rattrapage après une longue absence", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: new Date("2025-01-01T00:00:00Z") },
      { ...BASE, startDate: START },
    );
    expect(window.since.toISOString()).toBe(START.toISOString());
    // Tronquée reste vrai : `maxLookbackDays` a bien coupé, indépendamment.
    expect(window.truncated).toBe(true);
  });

  it("sans date de départ, rien ne change", () => {
    const withNull = computeFetchWindow({ lastSyncedAt: null }, { ...BASE, startDate: null });
    const without = computeFetchWindow({ lastSyncedAt: null }, BASE);
    expect(withNull.since.toISOString()).toBe(without.since.toISOString());
  });

  it("ramène la fenêtre des commentaires reçus à la date de départ", () => {
    const window = computeReceivedCommentsWindow(
      { lastSyncedAt: null },
      { ...BASE, windowDays: 30, startDate: START },
    );
    expect(window.since.toISOString()).toBe(START.toISOString());
  });

  it("une date de départ à 24 h se traduit par le filtre le moins cher", () => {
    const window = computeFetchWindow(
      { lastSyncedAt: null },
      { ...BASE, startDate: new Date(NOW.getTime() - DAY) },
    );
    expect(toPostedLimit(window.since, NOW)).toBe("24h");
  });
});
