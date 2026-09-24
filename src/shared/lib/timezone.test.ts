import { describe, expect, it } from "vitest";
import {
  daysBetweenLocal,
  fromZonedTime,
  localDateKey,
  minutesOfDay,
  startOfLocalDay,
  startOfNextLocalDay,
  zonedParts,
} from "./timezone";

const TZ = "Europe/Paris";

describe("zonedParts", () => {
  it("décompose un instant en heure murale de Paris (heure d'hiver, UTC+1)", () => {
    const parts = zonedParts(new Date("2026-01-15T08:30:00Z"), TZ);
    expect(parts).toMatchObject({
      year: 2026,
      month: 1,
      day: 15,
      hour: 9,
      minute: 30,
      weekday: 4, // jeudi
    });
  });

  it("décompose un instant en heure murale de Paris (heure d'été, UTC+2)", () => {
    const parts = zonedParts(new Date("2026-07-15T08:30:00Z"), TZ);
    expect(parts.hour).toBe(10);
  });
});

describe("fromZonedTime", () => {
  it("reconstruit l'instant UTC d'une heure murale d'hiver", () => {
    const date = fromZonedTime({ year: 2026, month: 1, day: 15, hour: 8 }, TZ);
    expect(date.toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });

  it("reconstruit l'instant UTC d'une heure murale d'été", () => {
    const date = fromZonedTime({ year: 2026, month: 7, day: 15, hour: 8 }, TZ);
    expect(date.toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });

  it("reste cohérent des deux côtés du passage à l'heure d'été", () => {
    // Le 29 mars 2026 à 2 h, Paris passe à 3 h. 8 h locale existe des deux
    // côtés ; c'est la veille et le lendemain qui doivent différer d'un offset.
    const before = fromZonedTime({ year: 2026, month: 3, day: 28, hour: 8 }, TZ);
    const after = fromZonedTime({ year: 2026, month: 3, day: 30, hour: 8 }, TZ);
    expect(before.toISOString()).toBe("2026-03-28T07:00:00.000Z");
    expect(after.toISOString()).toBe("2026-03-30T06:00:00.000Z");
  });

  it("fait un aller-retour stable sur une année entière", () => {
    for (let month = 1; month <= 12; month += 1) {
      const instant = fromZonedTime({ year: 2026, month, day: 15, hour: 14, minute: 37 }, TZ);
      const parts = zonedParts(instant, TZ);
      expect([parts.month, parts.day, parts.hour, parts.minute]).toEqual([
        month, 15, 14, 37,
      ]);
    }
  });
});

describe("minutesOfDay", () => {
  it("compte les minutes depuis minuit local, pas depuis minuit UTC", () => {
    expect(minutesOfDay(new Date("2026-07-15T06:00:00Z"), TZ)).toBe(8 * 60);
  });
});

describe("localDateKey", () => {
  it("rattache 23 h UTC au jour local suivant en été", () => {
    expect(localDateKey(new Date("2026-07-15T23:30:00Z"), TZ)).toBe("2026-07-16");
  });
});

describe("startOfNextLocalDay", () => {
  it("renvoie minuit local du lendemain", () => {
    const next = startOfNextLocalDay(new Date("2026-07-15T20:00:00Z"), TZ);
    expect(next.toISOString()).toBe("2026-07-15T22:00:00.000Z");
    expect(zonedParts(next, TZ)).toMatchObject({ day: 16, hour: 0, minute: 0 });
  });

  it("franchit correctement une fin de mois", () => {
    const next = startOfNextLocalDay(new Date("2026-01-31T10:00:00Z"), TZ);
    expect(zonedParts(next, TZ)).toMatchObject({ month: 2, day: 1, hour: 0 });
  });
});

describe("daysBetweenLocal", () => {
  it("compte les jours calendaires, pas les tranches de 24 h", () => {
    const a = new Date("2026-07-15T21:00:00Z"); // 23 h locale le 15
    const b = new Date("2026-07-16T06:00:00Z"); // 8 h locale le 16
    expect(daysBetweenLocal(a, b, TZ)).toBe(1);
  });
});

describe("startOfLocalDay", () => {
  it("rend minuit de Paris, pas minuit UTC", () => {
    // 24 septembre 17 h 20 UTC = 19 h 20 à Paris (été) ; le jour commence donc
    // à 22 h UTC la veille.
    const start = startOfLocalDay(new Date("2026-09-24T17:20:00Z"), "Europe/Paris");
    expect(start.toISOString()).toBe("2026-09-23T22:00:00.000Z");
  });

  it("ne change pas de jour juste après minuit local", () => {
    const start = startOfLocalDay(new Date("2026-09-23T22:30:00Z"), "Europe/Paris");
    expect(start.toISOString()).toBe("2026-09-23T22:00:00.000Z");
  });

  it("suit le changement d'heure : en hiver le jour commence à 23 h UTC", () => {
    const start = startOfLocalDay(new Date("2026-01-15T12:00:00Z"), "Europe/Paris");
    expect(start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("est idempotent : le début du jour d'un début de jour est lui-même", () => {
    const once = startOfLocalDay(new Date("2026-09-24T17:20:00Z"), "Europe/Paris");
    expect(startOfLocalDay(once, "Europe/Paris").toISOString()).toBe(once.toISOString());
  });
});
