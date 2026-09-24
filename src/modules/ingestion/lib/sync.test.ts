import { describe, expect, it } from "vitest";
import { FakeIngestionProvider } from "../providers/fake";
import type { FetchedComment, FetchedPost } from "../providers/types";
import type { CursorState } from "./cursor";
import {
  postsCursorKey,
  RECEIVED_COMMENTS_CURSOR_KEY,
  runSync,
  type SyncAccount,
  type SyncPorts,
} from "./sync";

const NOW = new Date("2026-03-17T10:00:00Z");

const OPTIONS = {
  now: NOW,
  initialBackfillDays: 7,
  maxLookbackDays: 90,
  receivedCommentsWindowDays: 30,
  maxPostsPerAccount: 20,
  maxCommentsPerPost: 50,
};

function post(id: string, iso = "2026-03-17T09:00:00Z"): FetchedPost {
  return {
    providerPostId: id,
    postUrl: `https://www.linkedin.com/feed/update/${id}`,
    body: `contenu ${id}`,
    media: [],
    mediaKind: "none",
    isRepost: false,
    publishedAt: new Date(iso),
    reactionCount: null,
    commentCount: null,
    author: {
      name: "Alice", profileUrl: "https://www.linkedin.com/in/alice",
      publicIdentifier: "alice", avatarUrl: "https://a.jpg",
    },
  };
}

function comment(id: string, postId: string): FetchedComment {
  return {
    providerCommentId: id,
    providerPostId: postId,
    parentProviderCommentId: null,
    depth: 0,
    body: "bravo",
    commentUrl: null,
    publishedAt: new Date("2026-03-17T09:30:00Z"),
    author: { name: "Bob", profileUrl: null, avatarUrl: null },
  };
}

interface Recorder {
  ports: SyncPorts;
  cursors: Map<string, CursorState>;
  successes: string[];
  failures: Array<{ key: string; reason: string }>;
  states: Array<{ id: string; state: string; error: string | null }>;
  savedPosts: FetchedPost[];
  savedComments: FetchedComment[];
  enriched: string[];
}

function recorder(
  accounts: SyncAccount[],
  overrides: Partial<SyncPorts> = {},
  seedCursors: Record<string, CursorState> = {},
): Recorder {
  const cursors = new Map(Object.entries(seedCursors));
  const successes: string[] = [];
  const failures: Array<{ key: string; reason: string }> = [];
  const states: Array<{ id: string; state: string; error: string | null }> = [];
  const savedPosts: FetchedPost[] = [];
  const savedComments: FetchedComment[] = [];
  const enriched: string[] = [];

  const ports: SyncPorts = {
    listAccounts: async () => accounts,
    readCursor: async (key) => cursors.get(key) ?? { lastSyncedAt: null },
    recordCursorSuccess: async (key, at) => {
      successes.push(key);
      cursors.set(key, { lastSyncedAt: at });
    },
    recordCursorFailure: async (key, reason) => {
      failures.push({ key, reason });
    },
    savePosts: async (_account, posts) => {
      savedPosts.push(...posts);
      return posts.length;
    },
    setAccountState: async (id, state, error) => {
      states.push({ id, state, error });
    },
    enrichAccount: async (id) => {
      enriched.push(id);
    },
    listOwnPosts: async () => [],
    saveComments: async (comments) => {
      savedComments.push(...comments);
      return comments.length;
    },
    ...overrides,
  };

  return { ports, cursors, successes, failures, states, savedPosts, savedComments, enriched };
}

const ALICE: SyncAccount = {
  id: "acc-alice",
  profileUrl: "https://www.linkedin.com/in/alice",
  isSelf: false,
  hasProfileMetadata: true,
};

describe("runSync — publications", () => {
  it("enregistre les nouveaux posts et fait avancer le curseur", async () => {
    const provider = new FakeIngestionProvider({
      postsByProfile: { [ALICE.profileUrl]: [post("p1"), post("p2")] },
    });
    const rec = recorder([ALICE]);

    const report = await runSync(provider, rec.ports, { ...OPTIONS, scope: "posts" });

    expect(report.postsInserted).toBe(2);
    expect(report.accountsSynced).toBe(1);
    expect(rec.successes).toContain(postsCursorKey(ALICE.id));
    expect(rec.cursors.get(postsCursorKey(ALICE.id))?.lastSyncedAt).toEqual(NOW);
  });

  it("NE FAIT PAS avancer le curseur quand le fournisseur est en panne", async () => {
    const provider = new FakeIngestionProvider({ failingProfiles: [ALICE.profileUrl] });
    const rec = recorder([ALICE], {}, {
      [postsCursorKey(ALICE.id)]: { lastSyncedAt: new Date("2026-03-16T10:00:00Z") },
    });

    const report = await runSync(provider, rec.ports, { ...OPTIONS, scope: "posts" });

    expect(report.accountsFailed).toBe(1);
    expect(rec.successes).toHaveLength(0);
    expect(rec.failures[0]?.key).toBe(postsCursorKey(ALICE.id));
    // Le curseur d'origine est intact : rien ne sera manqué au prochain passage.
    expect(rec.cursors.get(postsCursorKey(ALICE.id))?.lastSyncedAt).toEqual(
      new Date("2026-03-16T10:00:00Z"),
    );
  });

  it("marque un profil restreint et ne l'annonce pas comme synchronisé", async () => {
    const provider = new FakeIngestionProvider({ restrictedProfiles: [ALICE.profileUrl] });
    const rec = recorder([ALICE]);

    const report = await runSync(provider, rec.ports, { ...OPTIONS, scope: "posts" });

    expect(report.accountsRestricted).toBe(1);
    expect(report.accountsSynced).toBe(0);
    expect(rec.states[0]).toMatchObject({ id: ALICE.id, state: "restricted" });
  });

  it("isole les échecs : un compte en panne n'empêche pas les autres", async () => {
    const bob: SyncAccount = { ...ALICE, id: "acc-bob", profileUrl: "https://www.linkedin.com/in/bob" };
    const provider = new FakeIngestionProvider({
      failingProfiles: [ALICE.profileUrl],
      postsByProfile: { [bob.profileUrl]: [post("p9")] },
    });
    const rec = recorder([ALICE, bob]);

    const report = await runSync(provider, rec.ports, { ...OPTIONS, scope: "posts" });

    expect(report.accountsFailed).toBe(1);
    expect(report.accountsSynced).toBe(1);
    expect(report.postsInserted).toBe(1);
  });

  it("ne demande que ce qui suit le curseur au second passage", async () => {
    const provider = new FakeIngestionProvider({
      postsByProfile: {
        [ALICE.profileUrl]: [post("ancien", "2026-03-01T09:00:00Z"), post("recent", "2026-03-17T09:00:00Z")],
      },
    });
    const rec = recorder([ALICE], {}, {
      [postsCursorKey(ALICE.id)]: { lastSyncedAt: new Date("2026-03-10T00:00:00Z") },
    });

    await runSync(provider, rec.ports, { ...OPTIONS, scope: "posts" });

    expect(rec.savedPosts.map((p) => p.providerPostId)).toEqual(["recent"]);
  });

  it("signale une fenêtre tronquée après une très longue absence", async () => {
    const provider = new FakeIngestionProvider({ postsByProfile: { [ALICE.profileUrl]: [] } });
    const rec = recorder([ALICE], {}, {
      [postsCursorKey(ALICE.id)]: { lastSyncedAt: new Date("2024-01-01T00:00:00Z") },
    });

    const report = await runSync(provider, rec.ports, { ...OPTIONS, scope: "posts" });

    expect(report.truncated).toEqual([ALICE.profileUrl]);
  });

  it("complète l'identité d'un compte depuis sa première publication", async () => {
    const provider = new FakeIngestionProvider({
      postsByProfile: { [ALICE.profileUrl]: [post("p1")] },
    });
    const rec = recorder([{ ...ALICE, hasProfileMetadata: false }]);

    await runSync(provider, rec.ports, { ...OPTIONS, scope: "posts" });

    expect(rec.enriched).toEqual([ALICE.id]);
  });

  it("ne conclut pas 'restreint' sur une fenêtre simplement vide", async () => {
    const provider = new FakeIngestionProvider({ postsByProfile: { [ALICE.profileUrl]: [] } });
    const rec = recorder([ALICE]);

    const report = await runSync(provider, rec.ports, { ...OPTIONS, scope: "posts" });

    expect(report.accountsRestricted).toBe(0);
    expect(report.accountsSynced).toBe(1);
    expect(rec.states).toHaveLength(0);
  });
});

describe("runSync — commentaires reçus", () => {
  const OWN_POST = {
    id: "post-1",
    providerPostId: "urn:li:activity:1",
    postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:1",
  };

  it("récupère les commentaires des publications encore dans la fenêtre", async () => {
    const provider = new FakeIngestionProvider({
      commentsByPostUrl: { [OWN_POST.postUrl]: [comment("c1", OWN_POST.providerPostId)] },
    });
    const rec = recorder([], { listOwnPosts: async () => [OWN_POST] });

    const report = await runSync(provider, rec.ports, { ...OPTIONS, scope: "comments" });

    expect(report.commentsInserted).toBe(1);
    expect(rec.successes).toContain(RECEIVED_COMMENTS_CURSOR_KEY);
  });

  it("n'appelle pas le fournisseur quand aucune publication n'est dans la fenêtre", async () => {
    const provider = new FakeIngestionProvider({});
    const rec = recorder([], { listOwnPosts: async () => [] });

    await runSync(provider, rec.ports, { ...OPTIONS, scope: "comments" });

    expect(provider.calls.filter((call) => call.kind === "comments")).toHaveLength(0);
    expect(rec.successes).toContain(RECEIVED_COMMENTS_CURSOR_KEY);
  });

  it("laisse le curseur intact quand la récupération des commentaires échoue", async () => {
    const provider = new FakeIngestionProvider({});
    provider.fetchCommentsForPosts = async () => ({ state: "failed", reason: "quota épuisé" });
    const rec = recorder([], { listOwnPosts: async () => [OWN_POST] });

    const report = await runSync(provider, rec.ports, { ...OPTIONS, scope: "comments" });

    expect(report.errors[0]?.reason).toBe("quota épuisé");
    expect(rec.successes).not.toContain(RECEIVED_COMMENTS_CURSOR_KEY);
  });

  it("ignore les publications sans URL exploitable", async () => {
    const provider = new FakeIngestionProvider({});
    const rec = recorder([], {
      listOwnPosts: async () => [{ id: "x", providerPostId: "y", postUrl: null }],
    });

    await runSync(provider, rec.ports, { ...OPTIONS, scope: "comments" });

    expect(provider.calls.filter((call) => call.kind === "comments")).toHaveLength(0);
  });
});

describe("runSync — portée", () => {
  it("le mode 'posts' ne touche pas aux commentaires et inversement", async () => {
    const provider = new FakeIngestionProvider({
      postsByProfile: { [ALICE.profileUrl]: [post("p1")] },
    });
    const rec = recorder([ALICE], { listOwnPosts: async () => [] });

    await runSync(provider, rec.ports, { ...OPTIONS, scope: "posts" });
    expect(rec.successes).not.toContain(RECEIVED_COMMENTS_CURSOR_KEY);

    await runSync(provider, rec.ports, { ...OPTIONS, scope: "comments" });
    expect(rec.successes).toContain(RECEIVED_COMMENTS_CURSOR_KEY);
  });
});
