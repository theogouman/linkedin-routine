import { readEnv } from "@/shared/lib/env";
import { FakeWriteProvider } from "./fake";
import { UnipileWriteProvider } from "./unipile";
import type { WriteProvider } from "./types";

let cached: WriteProvider | null = null;

/** Point d'entrée unique vers l'écriture — cf. `getIngestionProvider`. */
export function getWriteProvider(): WriteProvider {
  if (cached) return cached;
  const configured = readEnv("WRITE_PROVIDER") ?? "unipile";
  cached = configured === "fake" ? new FakeWriteProvider() : new UnipileWriteProvider();
  return cached;
}

export function setWriteProvider(provider: WriteProvider | null): void {
  cached = provider;
}

export { FakeWriteProvider } from "./fake";
export { UnipileWriteProvider } from "./unipile";
export * from "./types";
