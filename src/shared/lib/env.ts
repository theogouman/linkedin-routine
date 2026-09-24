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

/**
 * Fuseau de référence des plafonds et de la fenêtre diurne (FR-017).
 *
 * Amorce seulement : le fuseau effectif se règle dans l'app et vit en base
 * (`queue_policy`). Cette variable ne sert qu'aux déploiements qui n'ont
 * encore jamais enregistré de réglage.
 */
export const APP_TIMEZONE = readEnv("APP_TIMEZONE") ?? "Europe/Paris";

/**
 * Les profondeurs de récupération et les garde-fous de coût ne sont plus lus
 * ici : ils vivent en base et se règlent depuis l'app
 * (`src/modules/ingestion/lib/settings.ts`). Les variables d'environnement
 * correspondantes ne subsistent que comme valeurs de départ, lues une seule
 * fois par `loadSyncSettings` tant qu'aucun réglage n'a été enregistré.
 */
