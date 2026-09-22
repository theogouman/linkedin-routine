import { readEnv } from "@/shared/lib/env";
import { ApifyIngestionProvider } from "./apify";
import { FakeIngestionProvider } from "./fake";
import type { IngestionProvider } from "./types";

let cached: IngestionProvider | null = null;

/**
 * Point d'entrée unique vers la couche de récupération (FR-020).
 *
 * Changer de fournisseur = ajouter une implémentation et une valeur ici.
 * Aucun autre fichier de l'app ne connaît Apify.
 */
export function getIngestionProvider(): IngestionProvider {
  if (cached) return cached;
  const configured = readEnv("INGESTION_PROVIDER") ?? "apify";
  cached = configured === "fake"
    ? new FakeIngestionProvider()
    : new ApifyIngestionProvider();
  return cached;
}

/** Réservé aux tests : réinjecte un fournisseur et vide le cache. */
export function setIngestionProvider(provider: IngestionProvider | null): void {
  cached = provider;
}

export { ApifyIngestionProvider } from "./apify";
export { FakeIngestionProvider } from "./fake";
export type * from "./types";
