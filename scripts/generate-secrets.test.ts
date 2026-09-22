import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { verifyPassword } from "@/modules/auth/lib/password";

describe("scripts/generate-secrets.mjs", () => {
  it("produit un APP_PASSWORD_HASH que l'app accepte réellement", async () => {
    const output = execFileSync("node", ["scripts/generate-secrets.mjs", "mot-de-passe-de-test"], {
      encoding: "utf8",
    });
    const hash = /^APP_PASSWORD_HASH=(.+)$/m.exec(output)?.[1];
    expect(hash).toBeDefined();
    expect(await verifyPassword("mot-de-passe-de-test", hash!)).toBe(true);
    expect(await verifyPassword("mauvais", hash!)).toBe(false);
  }, 30_000);

  it("produit un SESSION_SECRET et un CRON_SECRET distincts à chaque appel", () => {
    const a = execFileSync("node", ["scripts/generate-secrets.mjs", "x-long-enough-pass"], { encoding: "utf8" });
    const b = execFileSync("node", ["scripts/generate-secrets.mjs", "x-long-enough-pass"], { encoding: "utf8" });
    const grab = (out: string, key: string) => new RegExp(`^${key}=(.+)$`, "m").exec(out)?.[1];
    expect(grab(a, "SESSION_SECRET")).not.toBe(grab(b, "SESSION_SECRET"));
    expect(grab(a, "CRON_SECRET")).not.toBe(grab(b, "CRON_SECRET"));
    expect(grab(a, "VAPID_PRIVATE_KEY")).not.toBe(grab(b, "VAPID_PRIVATE_KEY"));
  }, 60_000);
});
