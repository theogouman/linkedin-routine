import { describe, expect, it } from "vitest";
import { normalizeProfileUrl, parseBulkProfileUrls } from "./profile-url";

function expectUrl(input: string, expected: string) {
  const result = normalizeProfileUrl(input);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value.url).toBe(expected);
}

describe("normalizeProfileUrl", () => {
  const canonical = "https://www.linkedin.com/in/theo-gouman";

  it.each([
    "https://www.linkedin.com/in/theo-gouman",
    "https://www.linkedin.com/in/theo-gouman/",
    "http://linkedin.com/in/theo-gouman",
    "www.linkedin.com/in/theo-gouman",
    "linkedin.com/in/theo-gouman",
    "https://fr.linkedin.com/in/theo-gouman",
    "https://www.linkedin.com/in/theo-gouman?originalSubdomain=fr",
    "https://www.linkedin.com/in/theo-gouman/recent-activity/all/",
    "https://www.linkedin.com/fr/in/theo-gouman",
    "  https://www.linkedin.com/in/Theo-Gouman  ",
    "theo-gouman",
  ])("canonise %p", (input) => expectUrl(input, canonical));

  it("décode les identifiants encodés", () => {
    expectUrl("https://www.linkedin.com/in/jos%C3%A9-garcia", "https://www.linkedin.com/in/jos%C3%A9-garcia");
    const result = normalizeProfileUrl("https://www.linkedin.com/in/jos%C3%A9-garcia");
    expect(result.ok && result.value.publicIdentifier).toBe("josé-garcia");
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["https://twitter.com/in/theo", "not_linkedin"],
    ["https://www.linkedin.com/company/anthropic", "not_a_profile"],
    ["https://www.linkedin.com/feed/", "not_a_profile"],
    ["https://www.linkedin.com/in/", "missing_identifier"],
    ["pas une url du tout !", "not_a_url"],
  ])("rejette %p pour %s", (input, reason) => {
    const result = normalizeProfileUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });
});

describe("parseBulkProfileUrls", () => {
  it("accepte un collage multi-lignes hétérogène", () => {
    const result = parseBulkProfileUrls(`
      https://www.linkedin.com/in/alice
      linkedin.com/in/bob/
      https://fr.linkedin.com/in/carol?trk=nav
    `);
    expect(result.accepted.map((p) => p.publicIdentifier)).toEqual(["alice", "bob", "carol"]);
    expect(result.rejected).toHaveLength(0);
  });

  it("accepte aussi les séparateurs virgule et point-virgule", () => {
    const result = parseBulkProfileUrls("alice, bob; carol");
    expect(result.accepted).toHaveLength(3);
  });

  it("isole les doublons internes au collage sans les compter deux fois", () => {
    const result = parseBulkProfileUrls(
      "https://www.linkedin.com/in/alice\nhttps://fr.linkedin.com/in/Alice/\nbob",
    );
    expect(result.accepted.map((p) => p.publicIdentifier)).toEqual(["alice", "bob"]);
    expect(result.duplicates).toHaveLength(1);
  });

  it("ajoute les entrées valides et liste les rejets avec leur motif", () => {
    const result = parseBulkProfileUrls(
      "https://www.linkedin.com/in/alice\nhttps://twitter.com/bob\nhttps://www.linkedin.com/company/acme",
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toEqual([
      { input: "https://twitter.com/bob", reason: "not_linkedin" },
      { input: "https://www.linkedin.com/company/acme", reason: "not_a_profile" },
    ]);
  });

  it("renvoie un résultat vide sur un collage vide", () => {
    expect(parseBulkProfileUrls("   \n  ")).toEqual({
      accepted: [], rejected: [], duplicates: [],
    });
  });
});
