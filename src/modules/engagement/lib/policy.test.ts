import { describe, expect, it } from "vitest";
import { localDateKey, zonedParts } from "@/shared/lib/timezone";
import {
  computeNextSlot,
  countToday,
  decideDispatch,
  DEFAULT_POLICY,
  effectiveCaps,
  isWithinSendWindow,
  nextWindowOpening,
  POST_BREAKER_START_FACTOR,
  rampFactor,
  type QueuePolicy,
  type RampState,
  type ScheduledAction,
} from "./policy";

const TZ = DEFAULT_POLICY.timezone;
const MATURE: RampState = { startedOn: "2025-01-01", overrideFactor: null };
/** rng figé au milieu de la plage → délai de 7,5 min, tests déterministes. */
const midRandom = () => 0.5;

function at(iso: string, kind: ScheduledAction["kind"] = "comment"): ScheduledAction {
  return { at: new Date(iso), kind };
}

describe("rampFactor", () => {
  const now = new Date("2026-03-16T10:00:00Z"); // lundi

  it("reste à 50 % pendant les deux premières semaines", () => {
    expect(rampFactor(DEFAULT_POLICY, { startedOn: "2026-03-16", overrideFactor: null }, now)).toBe(0.5);
    expect(rampFactor(DEFAULT_POLICY, { startedOn: "2026-03-03", overrideFactor: null }, now)).toBe(0.5);
  });

  it("monte de 15 % par semaine entamée après le plateau", () => {
    // 14 jours → première semaine post-plateau.
    const f1 = rampFactor(DEFAULT_POLICY, { startedOn: "2026-03-02", overrideFactor: null }, now);
    expect(f1).toBeCloseTo(0.5 * 1.15, 5);
    // 21 jours → deuxième semaine.
    const f2 = rampFactor(DEFAULT_POLICY, { startedOn: "2026-02-23", overrideFactor: null }, now);
    expect(f2).toBeCloseTo(0.5 * 1.15 ** 2, 5);
  });

  it("plafonne à 1 et n'excède jamais le régime de croisière", () => {
    expect(rampFactor(DEFAULT_POLICY, { startedOn: "2024-01-01", overrideFactor: null }, now)).toBe(1);
  });

  it("repart de 30 % après un coupe-circuit", () => {
    const state: RampState = { startedOn: "2026-03-16", overrideFactor: POST_BREAKER_START_FACTOR };
    expect(rampFactor(DEFAULT_POLICY, state, now)).toBeCloseTo(0.3, 5);
  });
});

describe("effectiveCaps", () => {
  it("applique le facteur aux trois plafonds", () => {
    const caps = effectiveCaps(DEFAULT_POLICY, { startedOn: "2026-03-16", overrideFactor: null }, new Date("2026-03-16T10:00:00Z"));
    expect(caps).toMatchObject({ comments: 12, likes: 30, total: 45, factor: 0.5 });
  });

  it("rend le régime de croisière une fois mûr", () => {
    const caps = effectiveCaps(DEFAULT_POLICY, MATURE, new Date("2026-03-16T10:00:00Z"));
    expect(caps).toMatchObject({ comments: 25, likes: 60, total: 90 });
  });

  it("ne descend jamais sous 1 action, même à facteur minuscule", () => {
    const tiny: QueuePolicy = { ...DEFAULT_POLICY, caps: { comments: 1, likes: 1, total: 1 } };
    const caps = effectiveCaps(tiny, { startedOn: "2026-03-16", overrideFactor: 0.1 }, new Date("2026-03-16T10:00:00Z"));
    expect(caps).toMatchObject({ comments: 1, likes: 1, total: 1 });
  });
});

describe("isWithinSendWindow", () => {
  it("accepte un mardi 10 h locale", () => {
    expect(isWithinSendWindow(DEFAULT_POLICY, new Date("2026-03-17T09:00:00Z"))).toBe(true);
  });

  it("refuse la nuit", () => {
    expect(isWithinSendWindow(DEFAULT_POLICY, new Date("2026-03-17T02:00:00Z"))).toBe(false);
  });

  it("refuse le creux méridien", () => {
    // 13 h locale (UTC+1 en mars avant le changement d'heure).
    expect(isWithinSendWindow(DEFAULT_POLICY, new Date("2026-03-17T12:00:00Z"))).toBe(false);
  });

  it("refuse le samedi et le dimanche", () => {
    expect(isWithinSendWindow(DEFAULT_POLICY, new Date("2026-03-21T10:00:00Z"))).toBe(false);
    expect(isWithinSendWindow(DEFAULT_POLICY, new Date("2026-03-22T10:00:00Z"))).toBe(false);
  });
});

describe("nextWindowOpening", () => {
  it("avance à 8 h locale quand on est avant l'ouverture", () => {
    const opened = nextWindowOpening(DEFAULT_POLICY, new Date("2026-03-17T04:00:00Z"));
    expect(zonedParts(opened, TZ)).toMatchObject({ day: 17, hour: 8, minute: 0 });
  });

  it("saute le creux méridien jusqu'à sa reprise", () => {
    const opened = nextWindowOpening(DEFAULT_POLICY, new Date("2026-03-17T12:00:00Z"));
    expect(zonedParts(opened, TZ)).toMatchObject({ hour: 14, minute: 0 });
  });

  it("franchit le week-end depuis un vendredi soir", () => {
    const opened = nextWindowOpening(DEFAULT_POLICY, new Date("2026-03-20T20:00:00Z"));
    const parts = zonedParts(opened, TZ);
    expect(parts.weekday).toBe(1); // lundi
    expect([parts.day, parts.hour]).toEqual([23, 8]);
  });

  it("est idempotent sur un instant déjà ouvert", () => {
    const inside = new Date("2026-03-17T09:00:00Z");
    expect(nextWindowOpening(DEFAULT_POLICY, inside).getTime()).toBe(inside.getTime());
  });
});

describe("computeNextSlot", () => {
  it("programme immédiatement quand la file est vide et la fenêtre ouverte", () => {
    const now = new Date("2026-03-17T09:00:00Z");
    const result = computeNextSlot({
      policy: DEFAULT_POLICY, ramp: MATURE, now, kind: "comment",
      existing: [], random: midRandom,
    });
    expect(result.scheduledFor.getTime()).toBe(now.getTime());
    expect(result.deferred).toBe(false);
  });

  it("respecte le délai aléatoire après la dernière action", () => {
    const now = new Date("2026-03-17T09:00:00Z");
    const result = computeNextSlot({
      policy: DEFAULT_POLICY, ramp: MATURE, now, kind: "like",
      existing: [at("2026-03-17T09:00:00Z", "like")], random: midRandom,
    });
    // 0.5 → 3 + 0.5 * 9 = 7,5 min.
    expect(result.scheduledFor.getTime() - now.getTime()).toBe(7.5 * 60_000);
  });

  it("tient le délai minimum au bord bas de la plage aléatoire", () => {
    const now = new Date("2026-03-17T09:00:00Z");
    const result = computeNextSlot({
      policy: DEFAULT_POLICY, ramp: MATURE, now, kind: "like",
      existing: [at("2026-03-17T09:00:00Z", "like")], random: () => 0,
    });
    expect(result.scheduledFor.getTime() - now.getTime()).toBe(3 * 60_000);
  });

  it("reporte à l'ouverture suivante hors fenêtre", () => {
    const now = new Date("2026-03-17T22:00:00Z"); // 23 h locale
    const result = computeNextSlot({
      policy: DEFAULT_POLICY, ramp: MATURE, now, kind: "comment",
      existing: [], random: midRandom,
    });
    expect(zonedParts(result.scheduledFor, TZ)).toMatchObject({ day: 18, hour: 8 });
    expect(result.deferred).toBe(true);
  });

  it("n'envoie jamais plus de commentaires que le plafond horaire glissant", () => {
    const now = new Date("2026-03-17T09:00:00Z");
    const existing = [
      at("2026-03-17T08:40:00Z"),
      at("2026-03-17T08:50:00Z"),
      at("2026-03-17T08:55:00Z"),
    ];
    const result = computeNextSlot({
      policy: { ...DEFAULT_POLICY, maxCommentsPerHour: 3 }, ramp: MATURE, now, kind: "comment",
      existing, random: midRandom,
    });
    // Le plus ancien sort de la fenêtre à 9 h 40 ; + délai minimum.
    expect(result.scheduledFor.toISOString()).toBe("2026-03-17T09:43:00.000Z");
  });

  it("laisse passer un like malgré trois commentaires dans l'heure", () => {
    const now = new Date("2026-03-17T09:00:00Z");
    const existing = [
      at("2026-03-17T08:40:00Z"),
      at("2026-03-17T08:50:00Z"),
      at("2026-03-17T08:55:00Z"),
    ];
    const result = computeNextSlot({
      policy: DEFAULT_POLICY, ramp: MATURE, now, kind: "like",
      existing, random: midRandom,
    });
    expect(result.scheduledFor.toISOString()).toBe("2026-03-17T09:02:30.000Z");
  });

  it("reporte au jour suivant quand le plafond de commentaires est atteint", () => {
    const now = new Date("2026-03-17T09:00:00Z");
    // Plafond mûr = 25 commentaires. On en pose 25 tôt le matin, espacés.
    const existing = Array.from({ length: 25 }, (_, i) =>
      at(new Date(Date.UTC(2026, 2, 17, 7, 0) + i * 60_000).toISOString()),
    );
    const result = computeNextSlot({
      policy: DEFAULT_POLICY, ramp: MATURE, now, kind: "comment",
      existing, random: midRandom,
    });
    expect(result.deferred).toBe(true);
    expect(result.deferredReason).toBe("daily_cap");
    expect(zonedParts(result.scheduledFor, TZ)).toMatchObject({ day: 18, hour: 8 });
  });

  it("reporte aussi sur le plafond global toutes actions confondues", () => {
    const now = new Date("2026-03-17T09:00:00Z");
    const existing = Array.from({ length: 90 }, (_, i) =>
      at(new Date(Date.UTC(2026, 2, 17, 7, 0) + i * 30_000).toISOString(), "like"),
    );
    const result = computeNextSlot({
      policy: DEFAULT_POLICY, ramp: MATURE, now, kind: "like",
      existing, random: midRandom,
    });
    expect(result.deferredReason).toBe("daily_cap");
    expect(localDateKey(result.scheduledFor, TZ)).toBe("2026-03-18");
  });

  it("saute le week-end quand le plafond du vendredi est atteint", () => {
    const now = new Date("2026-03-20T09:00:00Z"); // vendredi
    const existing = Array.from({ length: 25 }, (_, i) =>
      at(new Date(Date.UTC(2026, 2, 20, 7, 0) + i * 60_000).toISOString()),
    );
    const result = computeNextSlot({
      policy: DEFAULT_POLICY, ramp: MATURE, now, kind: "comment",
      existing, random: midRandom,
    });
    expect(zonedParts(result.scheduledFor, TZ).weekday).toBe(1);
  });

  it("produit une suite d'envois strictement croissante et dans la fenêtre", () => {
    const policy = DEFAULT_POLICY;
    let existing: ScheduledAction[] = [];
    let now = new Date("2026-03-17T08:00:00Z");
    let random = 0.13;
    for (let i = 0; i < 40; i += 1) {
      random = (random * 9301 + 49297) % 233280 / 233280; // LCG déterministe
      const seed = random;
      const slot = computeNextSlot({
        policy, ramp: MATURE, now, kind: i % 3 === 0 ? "like" : "comment",
        existing, random: () => seed,
      });
      const previous = existing[existing.length - 1];
      if (previous) {
        expect(slot.scheduledFor.getTime()).toBeGreaterThan(previous.at.getTime());
      }
      expect(isWithinSendWindow(policy, slot.scheduledFor)).toBe(true);
      existing = [...existing, { at: slot.scheduledFor, kind: i % 3 === 0 ? "like" : "comment" }];
      now = slot.scheduledFor;
    }
    // Aucun jour ne dépasse les plafonds.
    const byDay = new Map<string, ScheduledAction[]>();
    for (const action of existing) {
      const key = localDateKey(action.at, TZ);
      byDay.set(key, [...(byDay.get(key) ?? []), action]);
    }
    for (const actions of byDay.values()) {
      expect(actions.length).toBeLessThanOrEqual(policy.caps.total);
      expect(actions.filter((a) => a.kind !== "like").length).toBeLessThanOrEqual(policy.caps.comments);
      expect(actions.filter((a) => a.kind === "like").length).toBeLessThanOrEqual(policy.caps.likes);
    }
  });
});

describe("countToday", () => {
  it("ne compte que le jour local courant", () => {
    const now = new Date("2026-03-17T09:00:00Z");
    const counts = countToday(DEFAULT_POLICY, [
      at("2026-03-17T08:00:00Z", "comment"),
      at("2026-03-17T08:10:00Z", "like"),
      at("2026-03-16T08:00:00Z", "comment"),
    ], now);
    expect(counts).toEqual({ comments: 1, likes: 1, total: 2 });
  });
});

describe("decideDispatch", () => {
  // Vendredi 25 septembre 2026, 23 h 30 à Paris : hors fenêtre d'émission.
  const lateFriday = new Date("2026-09-25T21:30:00Z");

  it("publie tout de suite quand rien n'est parti de la journée, même hors fenêtre", () => {
    const decision = decideDispatch({
      policy: DEFAULT_POLICY, ramp: MATURE, now: lateFriday, kind: "comment",
      existing: [], random: midRandom,
    });
    expect(decision).toEqual({ mode: "now", waitMs: 0 });
  });

  it("publie tout de suite un samedi", () => {
    const saturday = new Date("2026-09-26T10:00:00Z");
    const decision = decideDispatch({
      policy: DEFAULT_POLICY, ramp: MATURE, now: saturday, kind: "comment",
      existing: [], random: midRandom,
    });
    expect(decision.mode).toBe("now");
  });

  it("n'attend que l'écart anti-rafale après un envoi très récent", () => {
    const decision = decideDispatch({
      policy: DEFAULT_POLICY, ramp: MATURE, now: lateFriday, kind: "comment",
      existing: [{ at: new Date(lateFriday.getTime() - 5_000), kind: "comment" }],
      random: midRandom,
    });
    expect(decision).toEqual({ mode: "now", waitMs: 15_000 });
  });

  it("ignore les actions programmées pour plus tard dans l'écart anti-rafale", () => {
    const decision = decideDispatch({
      policy: DEFAULT_POLICY, ramp: MATURE, now: lateFriday, kind: "comment",
      existing: [{ at: new Date("2026-09-28T06:00:00Z"), kind: "comment" }],
      random: midRandom,
    });
    expect(decision).toEqual({ mode: "now", waitMs: 0 });
  });

  it("bascule en file au-delà du plafond horaire, sans attendre le lundi matin", () => {
    const policy = { ...DEFAULT_POLICY, maxCommentsPerHour: 3 };
    const existing = [10, 20, 30].map((minutes) => ({
      at: new Date(lateFriday.getTime() - minutes * 60_000),
      kind: "comment" as const,
    }));
    const decision = decideDispatch({
      policy, ramp: MATURE, now: lateFriday, kind: "comment", existing, random: midRandom,
    });
    expect(decision.mode).toBe("queue");
    if (decision.mode !== "queue") return;
    expect(decision.deferredReason).toBe("hourly_cap");
    // Le plus ancien sort de l'heure à 23 h 00 + 1 h → minuit + délai minimum,
    // et non lundi 8 h : la fenêtre ne s'applique pas à la suite de la session.
    expect(decision.scheduledFor.getTime()).toBeLessThan(
      lateFriday.getTime() + 2 * 3_600_000,
    );
  });

  it("reporte au prochain créneau ouvré quand le plafond journalier est atteint", () => {
    const tuesday = new Date("2026-09-29T08:00:00Z"); // 10 h à Paris
    const caps = effectiveCaps(DEFAULT_POLICY, MATURE, tuesday);
    const existing = Array.from({ length: caps.comments }, (_, index) => ({
      at: new Date(tuesday.getTime() - (index + 1) * 20 * 60_000 - 4 * 3_600_000),
      kind: "comment" as const,
    })).filter((action) => localDateKey(action.at, TZ) === "2026-09-29");
    // Complète si la nuit a fait basculer certaines actions la veille.
    while (existing.length < caps.comments) {
      existing.push({ at: new Date("2026-09-29T05:00:00Z"), kind: "comment" });
    }
    const decision = decideDispatch({
      policy: DEFAULT_POLICY, ramp: MATURE, now: tuesday, kind: "comment",
      existing, random: midRandom,
    });
    expect(decision.mode).toBe("queue");
    if (decision.mode !== "queue") return;
    expect(decision.deferredReason).toBe("daily_cap");
    expect(localDateKey(decision.scheduledFor, TZ)).toBe("2026-09-30");
  });

  it("laisse partir un like quand seul le plafond de commentaires est atteint", () => {
    const tuesday = new Date("2026-09-29T08:00:00Z");
    const caps = effectiveCaps(DEFAULT_POLICY, MATURE, tuesday);
    const existing = Array.from({ length: caps.comments }, () => ({
      at: new Date("2026-09-29T05:00:00Z"),
      kind: "comment" as const,
    }));
    const decision = decideDispatch({
      policy: DEFAULT_POLICY, ramp: MATURE, now: tuesday, kind: "like",
      existing, random: midRandom,
    });
    expect(decision.mode).toBe("now");
  });
});
