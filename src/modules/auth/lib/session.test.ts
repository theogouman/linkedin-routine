import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";
import { hashPassword, verifyPassword } from "./password";

const SECRET = "un-secret-de-test-suffisamment-long-pour-hs256";

describe("session", () => {
  it("valide un jeton qu'elle vient d'émettre", async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });

  it("refuse un jeton signé avec un autre secret", async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, "un-autre-secret-tout-aussi-long!!")).toBe(false);
  });

  it("refuse un jeton absent ou malformé", async () => {
    expect(await verifySessionToken(undefined, SECRET)).toBe(false);
    expect(await verifySessionToken("", SECRET)).toBe(false);
    expect(await verifySessionToken("pas.un.jwt", SECRET)).toBe(false);
  });

  it("refuse un jeton dont la charge utile a été retouchée", async () => {
    const token = await createSessionToken(SECRET);
    const [header, , signature] = token.split(".");
    const forged = `${header}.${btoa(JSON.stringify({ sub: "owner", iss: "linkedin-routine", exp: 9999999999 })).replace(/=/g, "")}.${signature}`;
    expect(await verifySessionToken(forged, SECRET)).toBe(false);
  });
});

describe("password", () => {
  // PBKDF2 à 310 000 itérations coûte ~200 ms par dérivation : on baisse le
  // compte dans les tests, la propriété vérifiée ne dépend pas de sa valeur.
  const ITERATIONS = 1000;

  it("accepte le bon mot de passe", async () => {
    const stored = await hashPassword("correct horse battery staple", ITERATIONS);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("refuse un mauvais mot de passe", async () => {
    const stored = await hashPassword("correct horse battery staple", ITERATIONS);
    expect(await verifyPassword("Correct horse battery staple", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("produit un condensat différent à chaque appel (sel aléatoire)", async () => {
    const a = await hashPassword("même mot de passe", ITERATIONS);
    const b = await hashPassword("même mot de passe", ITERATIONS);
    expect(a).not.toBe(b);
    expect(await verifyPassword("même mot de passe", a)).toBe(true);
    expect(await verifyPassword("même mot de passe", b)).toBe(true);
  });

  it("refuse un condensat au format invalide plutôt que de lever", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$12$abc")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$10$sel$clé")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$1000$!!!$!!!")).toBe(false);
  });
});
