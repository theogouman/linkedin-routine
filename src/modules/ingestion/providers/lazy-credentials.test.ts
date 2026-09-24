import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApifyIngestionProvider } from "./apify";

/**
 * Régression : construire un fournisseur n'est pas l'utiliser.
 *
 * L'ordonnanceur instancie la couche de récupération à chaque passage, même
 * quand il n'y a aucun compte à interroger. Quand les identifiants étaient
 * exigés dans le constructeur, ces passages à vide échouaient toutes les cinq
 * minutes tant que le compte n'était pas provisionné — constaté en production
 * avant que la moindre donnée n'existe.
 */
describe("ApifyIngestionProvider — identifiants paresseux", () => {
  const saved = process.env.APIFY_TOKEN;

  beforeEach(() => {
    delete process.env.APIFY_TOKEN;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = saved;
  });

  it("se construit sans jeton configuré", () => {
    expect(() => new ApifyIngestionProvider()).not.toThrow();
  });

  it("ne réclame le jeton qu'au moment d'un appel réel", async () => {
    const provider = new ApifyIngestionProvider();
    const outcome = await provider.fetchPostsForProfile({
      profileUrl: "https://www.linkedin.com/in/alice",
      since: new Date("2026-03-16T10:00:00Z"),
      now: new Date("2026-03-17T10:00:00Z"),
      maxPosts: 10,
    });
    // L'absence de jeton remonte comme un échec transitoire, pas comme un
    // plantage : le curseur ne bougera pas et le compte ne sera pas condamné.
    expect(outcome.state).toBe("failed");
    if (outcome.state === "failed") {
      expect(outcome.reason).toContain("APIFY_TOKEN");
    }
  });

  it("ne consomme aucun crédit quand il n'y a rien à récupérer", async () => {
    const provider = new ApifyIngestionProvider();
    // Aucune publication à traiter : aucun appel, donc aucune exigence de jeton.
    await expect(
      provider.fetchCommentsForPosts({
        postUrls: [],
        since: new Date("2026-03-16T10:00:00Z"),
        now: new Date("2026-03-17T10:00:00Z"),
        maxCommentsPerPost: 50,
      }),
    ).resolves.toEqual({ state: "ok", comments: [] });
  });
});
