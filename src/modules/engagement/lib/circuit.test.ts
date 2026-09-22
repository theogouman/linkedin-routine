import { describe, expect, it } from "vitest";
import {
  canResume,
  canSend,
  detectRestriction,
  MIN_SUSPENSION_HOURS,
  type CircuitState,
} from "./circuit";

describe("detectRestriction", () => {
  it("reconnaît un 429", () => {
    expect(detectRestriction({ status: 429 })?.signal).toBe("rate_limited");
  });

  it("reconnaît une erreur 5xx du fournisseur", () => {
    expect(detectRestriction({ status: 503 })?.signal).toBe("provider_error");
  });

  it.each([
    ["checkpoint challenge required", "checkpoint"],
    ["Please complete the CAPTCHA", "checkpoint"],
    ["Two-factor authentication required", "checkpoint"],
    ["An OTP was sent to your phone", "checkpoint"],
  ])("reconnaît un checkpoint dans %p", (message, expected) => {
    expect(detectRestriction({ message })?.signal).toBe(expected);
  });

  it("reconnaît une expiration de session", () => {
    expect(detectRestriction({ message: "session expired, please reconnect" })?.signal)
      .toBe("session_expired");
  });

  it("reconnaît une demande de vérification d'identité", () => {
    expect(detectRestriction({ message: "identity verification needed" })?.signal)
      .toBe("identity_verification");
  });

  it("traite 401 et 403 comme une session perdue", () => {
    expect(detectRestriction({ status: 401 })?.signal).toBe("session_expired");
    expect(detectRestriction({ status: 403 })?.signal).toBe("session_expired");
  });

  it("inspecte aussi le corps de la réponse", () => {
    const detection = detectRestriction({
      status: 400,
      body: { error: "ACCOUNT_RESTRICTED", detail: "verify your identity" },
    });
    expect(detection?.signal).toBe("identity_verification");
  });

  it("ne déclenche pas sur une erreur banale", () => {
    expect(detectRestriction({ status: 404, message: "post not found" })).toBeNull();
    expect(detectRestriction({ status: 400, message: "comment text is empty" })).toBeNull();
  });
});

describe("canResume", () => {
  const suspendedAt = new Date("2026-03-16T10:00:00Z");
  const suspended: CircuitState = {
    status: "suspended",
    suspendedAt,
    suspendedReason: "429",
    suspendedSignal: "rate_limited",
  };

  it("refuse avant 72 h et indique la date d'éligibilité", () => {
    const decision = canResume(suspended, new Date("2026-03-18T10:00:00Z"));
    expect(decision.allowed).toBe(false);
    if (!decision.allowed && decision.reason === "too_soon") {
      expect(decision.availableAt.toISOString()).toBe("2026-03-19T10:00:00.000Z");
      expect(decision.remainingMs).toBe(24 * 3_600_000);
    } else {
      throw new Error("attendu : refus pour délai");
    }
  });

  it("refuse à la seconde près juste avant l'échéance", () => {
    const justBefore = new Date(
      suspendedAt.getTime() + MIN_SUSPENSION_HOURS * 3_600_000 - 1000,
    );
    expect(canResume(suspended, justBefore).allowed).toBe(false);
  });

  it("autorise exactement à l'échéance", () => {
    const exactly = new Date(suspendedAt.getTime() + MIN_SUSPENSION_HOURS * 3_600_000);
    expect(canResume(suspended, exactly).allowed).toBe(true);
  });

  it("refuse une reprise sur une file déjà active", () => {
    const active: CircuitState = {
      status: "active", suspendedAt: null, suspendedReason: null, suspendedSignal: null,
    };
    const decision = canResume(active, new Date());
    expect(decision).toEqual({ allowed: false, reason: "not_suspended" });
  });
});

describe("canSend", () => {
  it("bloque tout envoi tant que la file est suspendue", () => {
    expect(canSend({ status: "suspended", suspendedAt: new Date(), suspendedReason: null, suspendedSignal: null })).toBe(false);
    expect(canSend({ status: "active", suspendedAt: null, suspendedReason: null, suspendedSignal: null })).toBe(true);
  });
});
