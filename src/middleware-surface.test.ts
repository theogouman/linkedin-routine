import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * La production est joignable publiquement (protection Vercel en preview
 * uniquement) : la liste des chemins publics du middleware est donc la seule
 * frontière devant l'app. Ce test la fige, pour qu'un ajout y soit un geste
 * délibéré et non un effet de bord.
 */
const source = readFileSync("middleware.ts", "utf8");

function listOf(name: string): string[] {
  const match = new RegExp(`const ${name} = \\[([^\\]]*)\\]`, "s").exec(source);
  if (!match) throw new Error(`${name} introuvable dans middleware.ts`);
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("surface publique du middleware", () => {
  it("n'expose que les chemins strictement nécessaires", () => {
    expect(listOf("PUBLIC_PATHS").sort()).toEqual(
      ["/login", "/manifest.webmanifest", "/offline", "/sw.js"],
    );
    expect(listOf("PUBLIC_PREFIXES").sort()).toEqual(
      ["/_next/", "/api/cron/", "/icons/"],
    );
  });

  it("n'ouvre aucun préfixe sans route derrière", () => {
    // /api/cron/ est le seul préfixe d'API public ; il doit correspondre à des
    // routes réelles, elles-mêmes protégées par CRON_SECRET.
    const apiPrefixes = listOf("PUBLIC_PREFIXES").filter((p) => p.startsWith("/api/"));
    expect(apiPrefixes).toEqual(["/api/cron/"]);
  });
});
