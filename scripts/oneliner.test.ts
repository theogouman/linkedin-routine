import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { verifyPassword } from "@/modules/auth/lib/password";

/**
 * Épingle la commande autonome documentée dans `docs/VARIABLES-ENV.md`.
 *
 * Cette commande sert à générer `APP_PASSWORD_HASH` sans avoir cloné le dépôt.
 * Elle duplique donc, volontairement, le format de condensat de
 * `modules/auth/lib/password.ts`. Ce test est le lien entre les deux : si le
 * format change d'un côté, la doc cesse d'être exacte, et c'est ici qu'on
 * l'apprend — plutôt que devant un écran de connexion qui refuse le bon mot
 * de passe.
 *
 * Toute modification ici doit être reportée à l'identique dans la doc.
 */
const DOCUMENTED_ONELINER = `
const {webcrypto}=require("node:crypto"); const c=globalThis.crypto||webcrypto;
const I=310000, s=c.getRandomValues(new Uint8Array(16));
c.subtle.importKey("raw",new TextEncoder().encode(process.argv[1]),"PBKDF2",false,["deriveBits"])
 .then(k=>c.subtle.deriveBits({name:"PBKDF2",salt:s,iterations:I,hash:"SHA-256"},k,256))
 .then(b=>console.log(\`APP_PASSWORD_HASH=pbkdf2$\${I}$\${Buffer.from(s).toString("base64")}$\${Buffer.from(b).toString("base64")}\`));
`;

function runOneliner(password: string): string {
  const out = execFileSync("node", ["-e", DOCUMENTED_ONELINER, password], {
    encoding: "utf8",
  });
  const hash = /^APP_PASSWORD_HASH=(.+)$/m.exec(out)?.[1];
  if (!hash) throw new Error(`sortie inattendue : ${out}`);
  return hash;
}

describe("commande autonome de génération du condensat (hors dépôt)", () => {
  it("produit un condensat que l'app accepte réellement", async () => {
    const hash = runOneliner("mon mot de passe de test");
    expect(await verifyPassword("mon mot de passe de test", hash)).toBe(true);
    expect(await verifyPassword("autre", hash)).toBe(false);
  }, 30_000);

  it("gère accents, espaces et caractères spéciaux", async () => {
    const password = "Été 2026 — mot #de$passe!";
    expect(await verifyPassword(password, runOneliner(password))).toBe(true);
  }, 30_000);

  it("produit un sel neuf à chaque appel", () => {
    expect(runOneliner("identique")).not.toBe(runOneliner("identique"));
  }, 30_000);
});
