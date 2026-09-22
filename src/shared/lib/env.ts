/**
 * Accès centralisé aux variables d'environnement.
 *
 * Aucune n'est lue à l'import : tout passe par des getters, pour qu'un build
 * ou un test qui ne touche pas à un fournisseur donné n'ait pas besoin de sa
 * clé. `requireEnv` échoue au premier appel réel avec un message qui nomme la
 * variable manquante plutôt qu'un `undefined` propagé jusqu'à un 500 opaque.
 */

export function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (value === undefined) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Voir .env.example.`,
    );
  }
  return value;
}

export function readIntEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = readEnv(name);
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

/** Fuseau de référence pour les plafonds et la fenêtre diurne (FR-017). */
export const APP_TIMEZONE = readEnv("APP_TIMEZONE") ?? "Europe/Paris";

/**
 * Profondeur de récupération au premier passage sur un compte nouvellement
 * ajouté (FR-003, point tranché en clarification). 7 jours par défaut :
 * assez pour que le fil ne soit pas vide à l'ajout, assez court pour que
 * l'amorçage de 100+ comptes reste marginal en coût.
 */
export const INITIAL_BACKFILL_DAYS = readIntEnv("INITIAL_BACKFILL_DAYS", 7);

/** Fenêtre glissante des commentaires reçus (FR-008). */
export const RECEIVED_COMMENTS_WINDOW_DAYS = readIntEnv(
  "RECEIVED_COMMENTS_WINDOW_DAYS",
  30,
);

/**
 * Garde-fou : même après une longue absence, on ne redemande jamais plus que
 * cette profondeur au fournisseur. Le curseur peut être très ancien (app non
 * ouverte pendant des mois) ; sans plafond, une seule actualisation pourrait
 * coûter des dizaines d'euros.
 */
export const MAX_LOOKBACK_DAYS = readIntEnv("MAX_LOOKBACK_DAYS", 90);
