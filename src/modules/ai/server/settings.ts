import "server-only";

import { readEnv } from "@/shared/lib/env";
import { readSetting, writeSetting } from "@/shared/lib/settings-store";
import {
  DEFAULT_AI_SETTINGS,
  mergeAiSettings,
  validateAiSettings,
  type AiSettings,
} from "../lib/settings";

export const AI_SETTINGS_KEY = "ai_settings";

/**
 * `ANTHROPIC_MODEL` et `ANTHROPIC_EFFORT` ne sont plus qu'une amorce, lue tant
 * qu'aucun réglage n'a été enregistré depuis l'app. `ANTHROPIC_API_KEY`, elle,
 * reste une variable d'environnement : une clé d'API n'a rien à faire dans une
 * base de données que l'app lit en clair.
 */
function seedSettings(): AiSettings {
  return mergeAiSettings(DEFAULT_AI_SETTINGS, {
    model: readEnv("ANTHROPIC_MODEL"),
    effort: readEnv("ANTHROPIC_EFFORT"),
  });
}

export async function loadAiSettings(): Promise<AiSettings> {
  const stored = await readSetting<Partial<AiSettings>>(AI_SETTINGS_KEY);
  return mergeAiSettings(seedSettings(), stored);
}

export async function saveAiSettings(patch: Partial<AiSettings>): Promise<void> {
  const error = validateAiSettings(patch);
  if (error) throw new Error(error);
  await writeSetting(AI_SETTINGS_KEY, mergeAiSettings(await loadAiSettings(), patch));
}
