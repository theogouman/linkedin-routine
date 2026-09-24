import { describe, expect, it } from "vitest";
import { matchKey, matchProfiles, pickAvatarUrl } from "./profiles";

describe("matchProfiles", () => {
  it("apparie par identifiant public, pas par position", () => {
    const matched = matchProfiles(
      [
        "https://www.linkedin.com/in/alice",
        "https://www.linkedin.com/in/bob",
        "https://www.linkedin.com/in/carol",
      ],
      [
        { publicIdentifier: "carol", profileUrl: null, name: "Carol", headline: null, avatarUrl: "c.jpg" },
        { publicIdentifier: "alice", profileUrl: null, name: "Alice", headline: null, avatarUrl: "a.jpg" },
      ],
    );

    expect(matched.map((profile) => [profile.requestedUrl, profile.avatarUrl])).toEqual([
      ["https://www.linkedin.com/in/carol", "c.jpg"],
      ["https://www.linkedin.com/in/alice", "a.jpg"],
    ]);
  });

  it("ignore la casse d'un slug mais respecte celle d'un identifiant opaque", () => {
    const opaque = `ACoA${"A".repeat(35)}`;
    const otherCase = `ACoA${"a".repeat(35)}`;

    expect(matchKey("https://www.linkedin.com/in/Alice-Martin")).toBe(
      matchKey("https://www.linkedin.com/in/alice-martin"),
    );
    expect(matchKey(`https://www.linkedin.com/in/${opaque}`)).not.toBe(
      matchKey(`https://www.linkedin.com/in/${otherCase}`),
    );
  });

  it("écarte un profil qui ne correspond à aucune demande", () => {
    // Un compte affublé de la photo de quelqu'un d'autre est pire qu'un compte
    // sans photo : l'erreur ne lève rien et ne se voit qu'à l'œil.
    const matched = matchProfiles(
      ["https://www.linkedin.com/in/alice"],
      [{ publicIdentifier: "mallory", profileUrl: null, name: "Mallory", headline: null, avatarUrl: "m.jpg" }],
    );
    expect(matched).toEqual([]);
  });

  it("ne consomme qu'une fois une demande, même si l'actor duplique", () => {
    const matched = matchProfiles(
      ["https://www.linkedin.com/in/alice"],
      [
        { publicIdentifier: "alice", profileUrl: null, name: "Alice", headline: null, avatarUrl: "1.jpg" },
        { publicIdentifier: "Alice", profileUrl: null, name: "Alice", headline: null, avatarUrl: "2.jpg" },
      ],
    );
    expect(matched).toHaveLength(1);
    expect(matched[0]?.avatarUrl).toBe("1.jpg");
  });

  it("retombe sur l'URL rendue quand l'identifiant public manque", () => {
    const matched = matchProfiles(
      ["https://www.linkedin.com/in/alice"],
      [
        {
          publicIdentifier: null,
          profileUrl: "https://fr.linkedin.com/in/ALICE",
          name: "Alice",
          headline: null,
          avatarUrl: "a.jpg",
        },
      ],
    );
    expect(matched[0]?.requestedUrl).toBe("https://www.linkedin.com/in/alice");
  });
});

describe("pickAvatarUrl", () => {
  it("prend la chaîne telle quelle", () => {
    expect(pickAvatarUrl("https://media.licdn.com/a.jpg")).toBe("https://media.licdn.com/a.jpg");
  });

  it("prend la plus grande taille disponible", () => {
    expect(
      pickAvatarUrl({
        url: "https://media.licdn.com/small.jpg",
        sizes: [
          { width: 100, height: 100, url: "https://media.licdn.com/100.jpg" },
          { width: 400, height: 400, url: "https://media.licdn.com/400.jpg" },
          { width: 200, height: 200, url: "https://media.licdn.com/200.jpg" },
        ],
      }),
    ).toBe("https://media.licdn.com/400.jpg");
  });

  it("retombe sur `url` quand il n'y a pas de tailles", () => {
    expect(pickAvatarUrl({ url: "https://media.licdn.com/a.jpg" })).toBe(
      "https://media.licdn.com/a.jpg",
    );
  });

  it("rend null sur une valeur vide ou absente", () => {
    expect(pickAvatarUrl(null)).toBeNull();
    expect(pickAvatarUrl("")).toBeNull();
    expect(pickAvatarUrl({ sizes: [] })).toBeNull();
  });
});
