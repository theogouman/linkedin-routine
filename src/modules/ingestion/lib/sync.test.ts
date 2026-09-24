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

describe("budget d'un passage", () => {
  function ports(accountCount: number) {
    const accounts = Array.from({ length: accountCount }, (_, index) => ({
      id: `a${index}`,
      profileUrl: `https://www.linkedin.com/in/a${index}`,
      isSelf: false,
      hasProfileMetadata: true,
    }));
    const synced: string[] = [];
    const cursors = new Map<string, CursorState>();
    return {
      accounts,
      synced,
      cursors,
      ports: {
        listAccounts: async () => accounts,
        readCursor: async (key: string) =>
          cursors.get(key) ?? { lastSyncedAt: null },
        recordCursorSuccess: async (key: string, at: Date) => {
          cursors.set(key, { lastSyncedAt: at });
        },
        recordCursorFailure: async () => {},
        savePosts: async (account: { id: string }) => {
          synced.push(account.id);
          return 0;
        },
        setAccountState: async () => {},
        enrichAccount: async () => {},
        listOwnPosts: async () => [],
        saveComments: async () => 0,
      } satisfies SyncPorts,
    };
  }

  const provider = {
    name: "stub",
    fetchPostsForProfile: async () => ({ state: "ok" as const, posts: [] }),
    fetchCommentsForPosts: async () => ({ state: "ok" as const, comments: [] }),
  };

  it("s'arrête au plafond de comptes et dit combien il reste", async () => {
    // Plusieurs centaines de comptes ne tiennent pas dans une invocation
    // serverless : sans plafond, la fonction est tuée avant la fin et le
    // journal reste ouvert pour toujours.
    const { ports: p, synced } = ports(10);
    const report = await runSync(provider, p, {
      ...OPTIONS,
      now: new Date("2026-03-17T10:00:00Z"),
      scope: "posts",
      maxAccountsPerRun: 4,
    });

    expect(synced).toHaveLength(4);
    expect(report.accountsRemaining).toBe(6);
    expect(report.partial).toBe(true);
  });

  it("reprend là où le passage précédent s'est arrêté", async () => {
    const { ports: p, synced } = ports(6);
    const options = {
      ...OPTIONS,
      now: new Date("2026-03-17T10:00:00Z"),
      scope: "posts" as const,
      maxAccountsPerRun: 3,
    };

    await runSync(provider, p, options);
    const first = [...synced];
    synced.length = 0;

    await runSync(provider, p, { ...options, now: new Date("2026-03-17T11:00:00Z") });

    // Aucun compte du premier passage n'est rejoué : les curseurs les plus
    // anciens passent d'abord, donc chaque passage avance vraiment.
    expect(synced).toHaveLength(3);
    expect(synced.some((id) => first.includes(id))).toBe(false);
  });

  it("n'entame pas un compte après l'échéance", async () => {
    const { ports: p, synced } = ports(10);
    const report = await runSync(provider, p, {
      ...OPTIONS,
      now: new Date("2026-03-17T10:00:00Z"),
      scope: "posts",
      // Échéance déjà passée : aucun compte ne doit être entamé, et le reste
      // doit être annoncé en entier plutôt que perdu.
      deadline: new Date(Date.now() - 1000),
    });

    expect(synced).toHaveLength(0);
    expect(report.accountsRemaining).toBe(10);
    expect(report.partial).toBe(true);
  });

  it("traite tout quand aucun budget n'est fixé", async () => {
    const { ports: p, synced } = ports(7);
    const report = await runSync(provider, p, {
      ...OPTIONS,
      now: new Date("2026-03-17T10:00:00Z"),
      scope: "posts",
    });
    expect(synced).toHaveLength(7);
    expect(report.accountsRemaining).toBe(0);
    expect(report.partial).toBe(false);
  });

  it("traite chaque compte une seule fois en parallèle", async () => {
    const { ports: p, synced } = ports(9);
    await runSync(provider, p, {
      ...OPTIONS,
      now: new Date("2026-03-17T10:00:00Z"),
      scope: "posts",
      concurrency: 4,
    });
    expect(synced).toHaveLength(9);
    expect(new Set(synced).size).toBe(9);
  });
});
