import { describe, expect, it } from "vitest";
import {
  extractMedia,
  isRepost,
  normalizeComments,
  normalizePost,
  parseTimestamp,
  selectNewComments,
  selectNewPosts,
} from "./normalize";

/** Échantillon calqué sur la sortie réelle de harvestapi/linkedin-profile-posts. */
const SAMPLE_POST = {
  id: "urn:li:activity:7391573088309534720",
  linkedinUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7391573088309534720/",
  content: "Trois choses que j'ai apprises en lançant mon offre B2B.",
  postImages: [{ url: "https://media.licdn.com/image/a.jpg", width: 1200, height: 800 }],
  postedAt: { timestamp: 1773748800000, date: "2026-03-17T12:00:00.000Z" },
  socialContent: { shareUrl: "https://www.linkedin.com/posts/theo_abc" },
  author: {
    name: "Théo Gouman",
    linkedinUrl: "https://www.linkedin.com/in/theo-gouman",
    publicIdentifier: "Theo-Gouman",
    avatar: { url: "https://media.licdn.com/avatar.jpg" },
  },
  engagement: { likes: 42, comments: 7 },
};

describe("parseTimestamp", () => {
  it("lit un bloc postedAt avec timestamp epoch", () => {
    expect(parseTimestamp({ timestamp: 1773748800000 })?.toISOString())
      .toBe("2026-03-17T12:00:00.000Z");
  });

  it("retombe sur le champ date quand le timestamp manque", () => {
    expect(parseTimestamp({ date: "2026-03-17T12:00:00.000Z" })?.toISOString())
      .toBe("2026-03-17T12:00:00.000Z");
  });

  it("accepte un nombre ou une chaîne ISO nue", () => {
    expect(parseTimestamp(1773748800000)?.toISOString()).toBe("2026-03-17T12:00:00.000Z");
    expect(parseTimestamp("2026-03-17T12:00:00Z")?.toISOString()).toBe("2026-03-17T12:00:00.000Z");
  });

  it("refuse une date invalide plutôt que de renvoyer 1970", () => {
    expect(parseTimestamp("bientôt")).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp({})).toBeNull();
  });
});

describe("isRepost", () => {
  it("détecte un bloc repost", () => {
    expect(isRepost({ repost: { id: "x" } })).toBe(true);
  });
  it("détecte un repostedBy", () => {
    expect(isRepost({ repostedBy: { name: "Alice" } })).toBe(true);
  });
  it("détecte un type explicite, partage cité compris", () => {
    expect(isRepost({ type: "repost" })).toBe(true);
    expect(isRepost({ type: "quote" })).toBe(true);
  });
  it("laisse passer un post original", () => {
    expect(isRepost(SAMPLE_POST)).toBe(false);
  });
});

describe("extractMedia", () => {
  it("marque une vidéo comme non restituable", () => {
    const { media, kind } = extractMedia({
      postVideo: { videoUrl: "https://v.licdn.com/x.mp4", thumbnailUrl: "https://t.jpg" },
    });
    expect(kind).toBe("video");
    expect(media[0]).toMatchObject({ type: "video", externalOnly: true });
  });

  it("marque un carrousel document comme non restituable et garde sa couverture", () => {
    const { media, kind } = extractMedia({
      document: {
        title: "10 leviers",
        manifestUrl: "https://m.licdn.com/manifest",
        coverPages: [{ imageUrls: ["https://cover.jpg"] }],
      },
    });
    expect(kind).toBe("document");
    expect(media[0]).toMatchObject({
      type: "document", externalOnly: true, thumbnailUrl: "https://cover.jpg", title: "10 leviers",
    });
  });

  it("restitue les images dans l'app", () => {
    const { media, kind } = extractMedia(SAMPLE_POST);
    expect(kind).toBe("image");
    expect(media[0]).toMatchObject({ type: "image", externalOnly: false });
  });

  it("renvoie 'none' pour un post texte", () => {
    expect(extractMedia({ content: "texte seul" })).toEqual({ media: [], kind: "none" });
  });
});

describe("normalizePost", () => {
  it("traduit un post complet", () => {
    const post = normalizePost(SAMPLE_POST);
    expect(post).toMatchObject({
      providerPostId: "urn:li:activity:7391573088309534720",
      body: "Trois choses que j'ai apprises en lançant mon offre B2B.",
      isRepost: false,
      mediaKind: "image",
    });
    expect(post?.publishedAt.toISOString()).toBe("2026-03-17T12:00:00.000Z");
    expect(post?.author).toMatchObject({
      name: "Théo Gouman",
      publicIdentifier: "theo-gouman",
      profileUrl: "https://www.linkedin.com/in/theo-gouman",
    });
  });

  it("accepte un post sans texte mais avec un média", () => {
    const post = normalizePost({ ...SAMPLE_POST, content: null });
    expect(post?.body).toBe("");
    expect(post?.mediaKind).toBe("image");
  });

  it("rejette un post sans identifiant ou sans date exploitable", () => {
    expect(normalizePost({ ...SAMPLE_POST, id: null, entityId: null, shareUrn: null })).toBeNull();
    expect(normalizePost({ ...SAMPLE_POST, postedAt: null, createdAt: null })).toBeNull();
    expect(normalizePost("pas un objet")).toBeNull();
  });

  it("reconstruit l'URL de profil depuis l'identifiant public si elle manque", () => {
    const post = normalizePost({
      ...SAMPLE_POST,
      author: { ...SAMPLE_POST.author, linkedinUrl: null },
    });
    expect(post?.author.profileUrl).toBe("https://www.linkedin.com/in/theo-gouman");
  });
});

describe("normalizeComments", () => {
  const TREE = [
    {
      id: "c1",
      postId: "p1",
      commentary: "Super post",
      createdAtTimestamp: 1773748800000,
      linkedinUrl: "https://www.linkedin.com/feed/update/c1",
      actor: { name: "Alice", linkedinUrl: "https://www.linkedin.com/in/alice", pictureUrl: "https://a.jpg" },
      replies: [
        {
          id: "c2",
          postId: "p1",
          commentary: "Merci Alice",
          createdAtTimestamp: 1773748900000,
          actor: { name: "Théo" },
          replies: [
            { id: "c3", postId: "p1", commentary: "+1", createdAtTimestamp: 1773749000000, actor: { name: "Bob" } },
          ],
        },
      ],
    },
  ];

  it("aplatit l'arbre à tous les niveaux d'imbrication", () => {
    const comments = normalizeComments(TREE);
    expect(comments.map((c) => c.providerCommentId)).toEqual(["c1", "c2", "c3"]);
    expect(comments.map((c) => c.depth)).toEqual([0, 1, 2]);
  });

  it("chaîne correctement les parents", () => {
    const comments = normalizeComments(TREE);
    expect(comments[1]?.parentProviderCommentId).toBe("c1");
    expect(comments[2]?.parentProviderCommentId).toBe("c2");
    expect(comments[0]?.parentProviderCommentId).toBeNull();
  });

  it("utilise le postId de contexte quand le commentaire ne le porte pas", () => {
    const comments = normalizeComments(
      [{ id: "c9", commentary: "x", createdAtTimestamp: 1773748800000, actor: {} }],
      { providerPostId: "p42" },
    );
    expect(comments[0]?.providerPostId).toBe("p42");
  });

  it("ignore une entrée sans identifiant mais garde ses réponses valides", () => {
    const comments = normalizeComments([
      { commentary: "sans id", createdAtTimestamp: 1, replies: [
        { id: "ok", postId: "p1", commentary: "valide", createdAtTimestamp: 1773748800000, actor: {} },
      ] },
    ]);
    expect(comments.map((c) => c.providerCommentId)).toEqual(["ok"]);
  });

  it("renvoie un tableau vide sur une entrée vide", () => {
    expect(normalizeComments([])).toEqual([]);
    expect(normalizeComments(null)).toEqual([]);
  });
});

describe("selectNewPosts", () => {
  function post(id: string, iso: string, repost = false) {
    const normalized = normalizePost({
      ...SAMPLE_POST, id, postedAt: { date: iso }, type: repost ? "repost" : "post",
    });
    if (!normalized) throw new Error("échantillon invalide");
    return normalized;
  }

  it("exclut les partages", () => {
    const result = selectNewPosts(
      [post("a", "2026-03-17T12:00:00Z"), post("b", "2026-03-17T13:00:00Z", true)],
      { since: new Date("2026-03-01T00:00:00Z") },
    );
    expect(result.map((p) => p.providerPostId)).toEqual(["a"]);
  });

  it("écarte ce qui précède le curseur", () => {
    const result = selectNewPosts(
      [post("vieux", "2026-03-01T12:00:00Z"), post("neuf", "2026-03-17T12:00:00Z")],
      { since: new Date("2026-03-10T00:00:00Z") },
    );
    expect(result.map((p) => p.providerPostId)).toEqual(["neuf"]);
  });

  it("déduplique une publication ramenée deux fois", () => {
    const result = selectNewPosts(
      [post("a", "2026-03-17T12:00:00Z"), post("a", "2026-03-17T12:00:00Z")],
      { since: new Date("2026-03-01T00:00:00Z") },
    );
    expect(result).toHaveLength(1);
  });

  it("trie du plus récent au plus ancien", () => {
    const result = selectNewPosts(
      [post("a", "2026-03-15T12:00:00Z"), post("b", "2026-03-17T12:00:00Z"), post("c", "2026-03-16T12:00:00Z")],
      { since: new Date("2026-03-01T00:00:00Z") },
    );
    expect(result.map((p) => p.providerPostId)).toEqual(["b", "c", "a"]);
  });
});

describe("selectNewComments", () => {
  it("filtre sur le curseur, déduplique et garde les parents avant les enfants", () => {
    const comments = normalizeComments([
      {
        id: "c1", postId: "p1", commentary: "a", createdAtTimestamp: Date.parse("2026-03-17T12:00:00Z"), actor: {},
        replies: [{ id: "c2", postId: "p1", commentary: "b", createdAtTimestamp: Date.parse("2026-03-17T13:00:00Z"), actor: {} }],
      },
      { id: "vieux", postId: "p1", commentary: "c", createdAtTimestamp: Date.parse("2026-01-01T00:00:00Z"), actor: {} },
    ]);
    const selected = selectNewComments([...comments, ...comments], {
      since: new Date("2026-03-01T00:00:00Z"),
    });
    expect(selected.map((c) => c.providerCommentId)).toEqual(["c1", "c2"]);
  });
});
