import { describe, expect, it } from "vitest";
import { constantTimeEqual, readBearer, verifyBearer } from "./bearer";

const SECRET = "un-jeton-d-extension-assez-long-pour-etre-accepte";

describe("readBearer", () => {
  it("lit le jeton quelle que soit la casse du schéma", () => {
    expect(readBearer("Bearer abc")).toBe("abc");
    expect(readBearer("bearer abc")).toBe("abc");
    expect(readBearer("BEARER   abc  ")).toBe("abc");
  });

  it("refuse ce qui n'est pas un porteur", () => {
    expect(readBearer(null)).toBeNull();
    expect(readBearer(undefined)).toBeNull();
    expect(readBearer("")).toBeNull();
    expect(readBearer("Basic abc")).toBeNull();
    expect(readBearer("Bearer")).toBeNull();
    expect(readBearer("Bearer   ")).toBeNull();
  });
});

describe("constantTimeEqual", () => {
  it("compare des chaînes de longueurs différentes sans lever", () => {
    expect(constantTimeEqual("court", "beaucoup plus long")).toBe(false);
    expect(constantTimeEqual("", "x")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("gère les caractères hors ASCII", () => {
    expect(constantTimeEqual("clé-é", "clé-é")).toBe(true);
    expect(constantTimeEqual("clé-é", "clé-e")).toBe(false);
  });
});

describe("verifyBearer", () => {
  it("accepte le bon jeton", () => {
    expect(verifyBearer(`Bearer ${SECRET}`, SECRET)).toBe("ok");
  });

  it("refuse un jeton faux ou absent", () => {
    expect(verifyBearer(`Bearer ${SECRET}x`, SECRET)).toBe("refuse");
    expect(verifyBearer(null, SECRET)).toBe("refuse");
    expect(verifyBearer("Bearer ", SECRET)).toBe("refuse");
  });

  it("distingue l'absence de configuration du refus", () => {
    expect(verifyBearer(`Bearer ${SECRET}`, undefined)).toBe("non_configure");
    expect(verifyBearer("Bearer x", "")).toBe("non_configure");
  });

  it("traite un secret trop court comme non configuré", () => {
    // Une valeur de test oubliée au déploiement ne doit pas ouvrir la route :
    // elle serait devinable, et le refus est plus sûr que l'acceptation.
    expect(verifyBearer("Bearer changeme", "changeme")).toBe("non_configure");
  });
});
