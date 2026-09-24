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

  it("préserve la casse d'un identifiant opaque de membre", () => {
    // Régression : ces identifiants (`/in/ACoAA…`) sont sensibles à la casse.
    // Les passer en minuscules, comme on le fait pour un slug, produit une URL
    // morte. C'est la forme que renvoient la plupart des outils qui lisent
    // LinkedIn par API.
    const urn = "ACoAAAyy6A8BPf1WGmlGI2UUwvDLX4tIxpzpRrk";
    const result = normalizeProfileUrl(`https://www.linkedin.com/in/${urn}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toBe(`https://www.linkedin.com/in/${urn}`);
      expect(result.value.publicIdentifier).toBe(urn);
    }
  });

  it("continue d'unifier la casse des slugs ordinaires", () => {
    const a = normalizeProfileUrl("https://www.linkedin.com/in/Theo-Gouman");
    const b = normalizeProfileUrl("https://www.linkedin.com/in/theo-gouman");
    expect(a.ok && b.ok && a.value.url === b.value.url).toBe(true);
  });

  it("ne confond pas un slug commençant par « ACoA » avec un identifiant opaque", () => {
    // Piège trouvé en écrivant ce test : un motif large (« ACoA » + au moins
    // dix caractères) capturait ce slug ordinaire et lui gardait sa casse,
    // ce qui l'aurait fait entrer deux fois dans une liste.
    const result = normalizeProfileUrl("https://www.linkedin.com/in/ACoAlade-Martin");
    expect(result.ok && result.value.publicIdentifier).toBe("acoalade-martin");
  });

  it("n'accepte comme identifiant opaque que la longueur exacte de LinkedIn", () => {
    const tropCourt = "ACoAAAyy6A8BPf1WGmlGI2UUwvDLX4tIxpzpRr"; // 38
    const result = normalizeProfileUrl(`https://www.linkedin.com/in/${tropCourt}`);
    expect(result.ok && result.value.publicIdentifier).toBe(tropCourt.toLowerCase());
  });

  it("accepte les slugs contenant des emoji", () => {
    // Profils réels : LinkedIn laisse mettre des emoji dans un slug. Une
    // version restreinte aux lettres et chiffres les rejetait en silence.
    for (const input of [
      "https://www.linkedin.com/in/dorian-soler-☀️-254915147",
      "https://www.linkedin.com/in/marine-dupray%F0%9F%91%A9%F0%9F%8F%BC%E2%80%8D%F0%9F%92%BB-297a35156",
      "https://www.linkedin.com/in/georges-monteiro-%F0%9F%90%BF%EF%B8%8F-0b8423142",
    ]) {
      expect(normalizeProfileUrl(input).ok).toBe(true);
    }
  });

  it("fait converger un emoji écrit en clair et le même percent-encodé", () => {
    const brut = normalizeProfileUrl("https://www.linkedin.com/in/clara-odekerken-☀️-17a67ab3");
    const encode = normalizeProfileUrl("https://www.linkedin.com/in/clara-odekerken-%E2%98%80%EF%B8%8F-17a67ab3");
    expect(brut.ok && encode.ok && brut.value.url === encode.value.url).toBe(true);
  });

  it("rejette toujours une suite sans lettre ni chiffre", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/---").ok).toBe(false);
    expect(normalizeProfileUrl("!!!").ok).toBe(false);
  });

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
