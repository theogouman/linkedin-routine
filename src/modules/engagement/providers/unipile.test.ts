import { describe, expect, it } from "vitest";
import { describeNetworkError, normalizeDsn, UnipileWriteProvider } from "./unipile";
import { WriteProviderError } from "./types";

/**
 * Un like a échoué en production avec « fetch failed » au journal — un message
 * qui ne dit rien et n'ouvre aucune piste. La cause réelle vit dans
 * `error.cause`, et elle était jetée.
 */
describe("describeNetworkError", () => {
  it("déplie la cause d'un échec de fetch", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND api3.unipile.com"), {
      code: "ENOTFOUND",
    });
    const error = Object.assign(new TypeError("fetch failed"), { cause });

    // Le code n'est pas répété : il est déjà dans le message système.
    expect(describeNetworkError(error)).toBe(
      "fetch failed — getaddrinfo ENOTFOUND api3.unipile.com",
    );
  });

  it("déplie plusieurs niveaux sans boucler", () => {
    const deep = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const mid = Object.assign(new Error("Client network socket disconnected"), { cause: deep });
    const error = Object.assign(new TypeError("fetch failed"), { cause: mid });

    expect(describeNetworkError(error)).toContain("ECONNREFUSED");
    expect(describeNetworkError(error).split(" — ")).toHaveLength(3);
  });

  it("ajoute le code système quand le message ne le porte pas", () => {
    const cause = Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" });
    const error = Object.assign(new TypeError("fetch failed"), { cause });
    expect(describeNetworkError(error)).toBe(
      "fetch failed — Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)",
    );
  });

  it("laisse passer une erreur ordinaire", () => {
    expect(describeNetworkError(new Error("boum"))).toBe("boum");
    expect(describeNetworkError("boum")).toBe("boum");
  });
});

describe("normalizeDsn", () => {
  it("complète le schéma d'un DSN collé sans https", () => {
    // C'est la forme que le tableau de bord Unipile affiche ; collée telle
    // quelle, elle faisait échouer `fetch` sur une URL invalide.
    expect(normalizeDsn("api3.unipile.com:13031/api/v1")).toBe(
      "https://api3.unipile.com:13031/api/v1",
    );
  });

  it("ajoute le chemin de version quand il manque", () => {
    // Sans `/api/v1`, chaque route répond 404 et l'erreur ressemble à une
    // route disparue plutôt qu'à un DSN incomplet.
    expect(normalizeDsn("https://api3.unipile.com:13031")).toBe(
      "https://api3.unipile.com:13031/api/v1",
    );
  });

  it("laisse intact un DSN déjà complet, barre finale comprise", () => {
    expect(normalizeDsn("https://api3.unipile.com:13031/api/v1/")).toBe(
      "https://api3.unipile.com:13031/api/v1",
    );
  });

  it("refuse tôt un DSN vide ou inexploitable", () => {
    expect(() => normalizeDsn("   ")).toThrow(WriteProviderError);
    expect(() => normalizeDsn("https://")).toThrow(/n'est pas une URL exploitable|est vide/);
  });
});

describe("UnipileWriteProvider", () => {
  it("transmet le type de réaction choisi", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "x" }) } as Response;
    }) as unknown as typeof fetch;

    const provider = new UnipileWriteProvider({
      dsn: "https://api3.unipile.com:13031/api/v1",
      apiKey: "k",
      accountId: "acc",
      fetchImpl: impl,
    });

    await provider.publishLike({
      targetType: "post",
      providerPostId: "urn:li:activity:1",
      reactionType: "insightful",
    });

    expect(calls[0]?.body).toMatchObject({ reaction_type: "insightful", account_id: "acc" });
  });

  it("remonte la cause réelle d'un échec réseau", async () => {
    const impl = (async () => {
      const cause = Object.assign(new Error("getaddrinfo ENOTFOUND nope"), { code: "ENOTFOUND" });
      throw Object.assign(new TypeError("fetch failed"), { cause });
    }) as unknown as typeof fetch;

    const provider = new UnipileWriteProvider({
      dsn: "https://nope:1/api/v1",
      apiKey: "k",
      accountId: "acc",
      fetchImpl: impl,
    });

    await expect(
      provider.publishLike({ targetType: "post", providerPostId: "p" }),
    ).rejects.toThrow(/ENOTFOUND/);
  });
});
