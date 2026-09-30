import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

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
      ["/_next/", "/api/cron/", "/api/extension/", "/icons/"],
    );
  });

  it("n'ouvre aucun préfixe sans route derrière", () => {
    // Les deux préfixes d'API publics correspondent à des routes réelles, qui
    // portent chacune leur propre secret : CRON_SECRET d'un côté,
    // EXTENSION_TOKEN de l'autre. Aucune n'est ouverte.
    const apiPrefixes = listOf("PUBLIC_PREFIXES").filter((p) => p.startsWith("/api/"));
    expect(apiPrefixes.sort()).toEqual(["/api/cron/", "/api/extension/"]);
    expect(existsSync("src/app/api/cron/_auth.ts")).toBe(true);
    expect(existsSync("src/app/api/extension/_auth.ts")).toBe(true);
  });
});
