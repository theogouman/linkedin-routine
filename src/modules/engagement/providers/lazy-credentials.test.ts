import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UnipileWriteProvider } from "./unipile";

/** Pendant côté écriture — même régression, même garde. */
describe("UnipileWriteProvider — identifiants paresseux", () => {
  const saved = {
    dsn: process.env.UNIPILE_DSN,
    key: process.env.UNIPILE_API_KEY,
    account: process.env.UNIPILE_ACCOUNT_ID,
  };

  beforeEach(() => {
    delete process.env.UNIPILE_DSN;
    delete process.env.UNIPILE_API_KEY;
    delete process.env.UNIPILE_ACCOUNT_ID;
  });
  afterEach(() => {
    for (const [name, value] of [
      ["UNIPILE_DSN", saved.dsn],
      ["UNIPILE_API_KEY", saved.key],
      ["UNIPILE_ACCOUNT_ID", saved.account],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("se construit sans identifiants configurés", () => {
    expect(() => new UnipileWriteProvider()).not.toThrow();
  });

  it("ne les réclame qu'au moment de publier, en nommant la variable", async () => {
    const provider = new UnipileWriteProvider();
    await expect(
      provider.publishComment({ providerPostId: "urn:li:activity:1", text: "bonjour" }),
    ).rejects.toThrow(/UNIPILE_DSN/);
  });

  it("utilise les identifiants passés explicitement sans toucher à l'environnement", async () => {
    const calls: string[] = [];
    const provider = new UnipileWriteProvider({
      dsn: "https://api9.unipile.com:1234/api/v1/",
      apiKey: "clé",
      accountId: "compte",
      fetchImpl: (async (url: string | URL | Request) => {
        calls.push(String(url));
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "c1" }) } as Response;
      }) as unknown as typeof fetch,
    });

    const result = await provider.publishComment({
      providerPostId: "urn:li:activity:1",
      text: "bonjour",
    });

    expect(result.providerId).toBe("c1");
    // Le / final du DSN ne doit pas produire une URL à double slash.
    expect(calls[0]).toBe(
      "https://api9.unipile.com:1234/api/v1/posts/urn%3Ali%3Aactivity%3A1/comments",
    );
  });
});
