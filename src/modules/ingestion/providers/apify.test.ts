import { describe, expect, it } from "vitest";
import { ApifyIngestionProvider } from "./apify";

const NOW = new Date("2026-03-17T10:00:00Z");

function stubFetch(
  responses: Array<{ status?: number; body: unknown }>,
): { impl: typeof fetch; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  let index = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const status = next?.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(next?.body ?? []),
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const POST_ITEM = {
  id: "urn:li:activity:1",
  linkedinUrl: "https://www.linkedin.com/feed/update/urn:li:activity:1/",
  content: "Un post original",
  postedAt: { timestamp: Date.parse("2026-03-17T09:00:00Z") },
  author: { name: "Alice", linkedinUrl: "https://www.linkedin.com/in/alice", publicIdentifier: "alice" },
};

function provider(responses: Array<{ status?: number; body: unknown }>) {
  const { impl, calls } = stubFetch(responses);
  return {
    provider: new ApifyIngestionProvider({ token: "tok", fetchImpl: impl }),
    calls,
  };
}

describe("ApifyIngestionProvider.fetchPostsForProfile", () => {
  it("exclut les partages à l'entrée pour ne pas les payer", async () => {
    const { provider: p, calls } = provider([{ body: [POST_ITEM] }]);
    await p.fetchPostsForProfile({
      profileUrl: "https://www.linkedin.com/in/alice",
      since: new Date("2026-03-16T10:00:00Z"),
      now: NOW,
      maxPosts: 20,
    });
    expect(calls[0]?.body).toMatchObject({
      targetUrls: ["https://www.linkedin.com/in/alice"],
      maxPosts: 20,
      includeReposts: false,
      includeQuotePosts: false,
      scrapeReactions: false,
      scrapeComments: false,
      postedLimit: "24h",
    });
  });

  it("traduit la borne du curseur en pré-filtre de l'actor", async () => {
    const { provider: p, calls } = provider([{ body: [] }]);
    await p.fetchPostsForProfile({
      profileUrl: "https://www.linkedin.com/in/alice",
      since: new Date("2026-03-10T10:00:00Z"),
      now: NOW,
      maxPosts: 20,
    });
    expect(calls[0]?.body).toMatchObject({ postedLimit: "week" });
  });

  it("normalise et filtre les posts renvoyés", async () => {
    const { provider: p } = provider([
      {
        body: [
          POST_ITEM,
          { ...POST_ITEM, id: "urn:li:activity:2", type: "repost" },
          { ...POST_ITEM, id: "urn:li:activity:3", postedAt: { timestamp: Date.parse("2026-01-01T00:00:00Z") } },
        ],
      },
    ]);
    const outcome = await p.fetchPostsForProfile({
      profileUrl: "https://www.linkedin.com/in/alice",
      since: new Date("2026-03-16T10:00:00Z"),
      now: NOW,
      maxPosts: 20,
    });
    expect(outcome.state).toBe("ok");
    if (outcome.state === "ok") {
      expect(outcome.posts.map((post) => post.providerPostId)).toEqual([
        "urn:li:activity:1",
      ]);
    }
  });

  it("rend 'restricted' sur un marqueur de profil fermé", async () => {
    const { provider: p } = provider([
      { body: [{ error: "Profile not found" }] },
    ]);
    const outcome = await p.fetchPostsForProfile({
      profileUrl: "https://www.linkedin.com/in/ghost",
      since: new Date("2026-03-16T10:00:00Z"),
      now: NOW,
      maxPosts: 20,
    });
    expect(outcome.state).toBe("restricted");
  });

  it("rend 'failed' sur une panne du fournisseur, sans faire avancer le curseur", async () => {
    const { provider: p } = provider([{ status: 503, body: { error: "service unavailable" } }]);
    const outcome = await p.fetchPostsForProfile({
      profileUrl: "https://www.linkedin.com/in/alice",
      since: new Date("2026-03-16T10:00:00Z"),
      now: NOW,
      maxPosts: 20,
    });
    expect(outcome.state).toBe("failed");
    if (outcome.state === "failed") expect(outcome.reason).toContain("503");
  });

  it("ne confond pas un 503 « service unavailable » avec un profil restreint", async () => {
    // Régression : le mot « unavailable » dans le corps d'une panne HTTP
    // marquait durablement un compte sain comme non récupérable.
    const { provider: p } = provider([
      { status: 503, body: { error: "service temporarily unavailable" } },
    ]);
    const outcome = await p.fetchPostsForProfile({
      profileUrl: "https://www.linkedin.com/in/alice",
      since: new Date("2026-03-16T10:00:00Z"),
      now: NOW,
      maxPosts: 20,
    });
    expect(outcome.state).toBe("failed");
  });

  it("ne marque pas restreint sur un item d'erreur générique du fournisseur", async () => {
    const { provider: p } = provider([{ body: [{ error: "actor run timed out" }] }]);
    const outcome = await p.fetchPostsForProfile({
      profileUrl: "https://www.linkedin.com/in/alice",
      since: new Date("2026-03-16T10:00:00Z"),
      now: NOW,
      maxPosts: 20,
    });
    expect(outcome.state).toBe("ok");
  });

  it("distingue un quota épuisé (échec) d'un profil restreint", async () => {
    const { provider: p } = provider([{ status: 402, body: { error: "monthly usage exceeded" } }]);
    const outcome = await p.fetchPostsForProfile({
      profileUrl: "https://www.linkedin.com/in/alice",
      since: new Date("2026-03-16T10:00:00Z"),
      now: NOW,
      maxPosts: 20,
    });
    expect(outcome.state).toBe("failed");
  });
});

describe("ApifyIngestionProvider.fetchCommentsForPosts", () => {
  it("ne consomme aucun crédit quand il n'y a aucune publication à traiter", async () => {
    const { provider: p, calls } = provider([{ body: [] }]);
    const outcome = await p.fetchCommentsForPosts({
      postUrls: [], since: new Date("2026-03-16T10:00:00Z"), now: NOW, maxCommentsPerPost: 50,
    });
    expect(outcome).toEqual({ state: "ok", comments: [] });
    expect(calls).toHaveLength(0);
  });

  it("demande les réponses imbriquées et plafonne le nombre d'items", async () => {
    const { provider: p, calls } = provider([{ body: [] }]);
    await p.fetchCommentsForPosts({
      postUrls: ["https://www.linkedin.com/feed/update/a", "https://www.linkedin.com/feed/update/b"],
      since: new Date("2026-03-16T10:00:00Z"),
      now: NOW,
      maxCommentsPerPost: 50,
    });
    expect(calls[0]?.body).toMatchObject({
      scrapeReplies: true, maxItems: 100, postedLimit: "24h",
    });
  });

  it("aplatit l'arbre des réponses", async () => {
    const { provider: p } = provider([
      {
        body: [
          {
            id: "c1", postId: "p1", commentary: "top",
            createdAtTimestamp: Date.parse("2026-03-17T09:00:00Z"), actor: { name: "Bob" },
            replies: [{ id: "c2", postId: "p1", commentary: "merci", createdAtTimestamp: Date.parse("2026-03-17T09:30:00Z"), actor: { name: "Théo" } }],
          },
        ],
      },
    ]);
    const outcome = await p.fetchCommentsForPosts({
      postUrls: ["https://www.linkedin.com/feed/update/p1"],
      since: new Date("2026-03-16T10:00:00Z"),
      now: NOW,
      maxCommentsPerPost: 50,
    });
    expect(outcome.state).toBe("ok");
    if (outcome.state === "ok") {
      expect(outcome.comments.map((c) => c.providerCommentId)).toEqual(["c1", "c2"]);
    }
  });
});

describe("ApifyIngestionProvider.fetchProfile", () => {
  it("renvoie null sans actor de profil configuré, sans appel réseau", async () => {
    const { provider: p, calls } = provider([{ body: [] }]);
    expect(await p.fetchProfile("https://www.linkedin.com/in/alice")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("recompose un nom depuis prénom + nom", async () => {
    const { impl } = stubFetch([
      { body: [{ firstName: "Alice", lastName: "Martin", headline: "CEO", publicIdentifier: "alice" }] },
    ]);
    const p = new ApifyIngestionProvider({
      token: "tok", fetchImpl: impl, profileActor: "harvestapi~linkedin-profile-scraper",
    });
    expect(await p.fetchProfile("https://www.linkedin.com/in/alice")).toMatchObject({
      name: "Alice Martin", headline: "CEO", publicIdentifier: "alice",
    });
  });

  it("avale l'échec d'enrichissement : l'ajout du compte ne doit pas casser", async () => {
    const { impl } = stubFetch([{ status: 500, body: {} }]);
    const p = new ApifyIngestionProvider({
      token: "tok", fetchImpl: impl, profileActor: "x~y",
    });
    expect(await p.fetchProfile("https://www.linkedin.com/in/alice")).toBeNull();
  });
});
