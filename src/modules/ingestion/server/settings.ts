import "server-only";

import { readIntEnv } from "@/shared/lib/env";
import { readSetting, writeSetting } from "@/shared/lib/settings-store";
import {
  DEFAULT_SYNC_SETTINGS,
  mergeSyncSettings,
  validateSyncSettings,
  type SyncSettings,
} from "../lib/settings";

export const SYNC_SETTINGS_KEY = "sync_settings";

/**
 * Valeurs de départ : défauts de la spec, surchargés par l'environnement s'il
 * en porte encore.
 *
 * Les variables `INITIAL_BACKFILL_DAYS`, `MAX_LOOKBACK_DAYS`, … sont conservées
 * comme amorce pour les déploiements qui les avaient renseignées avant que ces
 * réglages passent en base. Dès qu'un enregistrement a eu lieu depuis l'app,
 * c'est la base qui prime — définitivement, y compris si la variable change.
 */
function seedSettings(): SyncSettings {
  return {
    initialBackfillDays: readIntEnv(
      "INITIAL_BACKFILL_DAYS",
      DEFAULT_SYNC_SETTINGS.initialBackfillDays,
    ),
    maxLookbackDays: readIntEnv(
      "MAX_LOOKBACK_DAYS",
      DEFAULT_SYNC_SETTINGS.maxLookbackDays,
    ),
    receivedCommentsWindowDays: readIntEnv(
      "RECEIVED_COMMENTS_WINDOW_DAYS",
      DEFAULT_SYNC_SETTINGS.receivedCommentsWindowDays,
    ),
    maxPostsPerAccount: readIntEnv(
      "MAX_POSTS_PER_ACCOUNT",
      DEFAULT_SYNC_SETTINGS.maxPostsPerAccount,
    ),
    maxCommentsPerPost: readIntEnv(
      "MAX_COMMENTS_PER_POST",
      DEFAULT_SYNC_SETTINGS.maxCommentsPerPost,
    ),
  };
}

export async function loadSyncSettings(): Promise<SyncSettings> {
  const stored = await readSetting<Partial<SyncSettings>>(SYNC_SETTINGS_KEY);
  // La graine passe elle aussi par la fusion : une variable d'environnement
  // aberrante est écartée exactement comme un réglage corrompu le serait.
  const base = mergeSyncSettings(DEFAULT_SYNC_SETTINGS, seedSettings());
  return mergeSyncSettings(base, stored);
}

export async function saveSyncSettings(
  patch: Partial<SyncSettings>,
): Promise<void> {
  const error = validateSyncSettings(patch);
  if (error) throw new Error(error);
  // On écrit le réglage complet : un enregistrement partiel laisserait des
  // champs continuer à suivre l'environnement, ce qui est précisément ce dont
  // on cherche à se libérer.
  await writeSetting(SYNC_SETTINGS_KEY, mergeSyncSettings(await loadSyncSettings(), patch));
}
