/**
 * Réglages de récupération — profondeur, fenêtres et garde-fous de coût.
 *
 * Ils vivent en base, pas dans l'environnement : ce sont des curseurs qu'on
 * bouge en observant le résultat (« le fil est trop court », « la note Apify
 * grimpe »), et un aller-retour par redéploiement pour changer un entier est
 * une friction qui fait qu'on ne les règle jamais. Même raison que les
 * plafonds d'envoi, réglables depuis le téléphone.
 *
 * Tout est ici en fonctions pures : la validation et la fusion se vérifient
 * sans base de données, et l'UI comme le serveur partagent les mêmes bornes.
 */

export interface SyncSettings {
  /** Profondeur du premier passage sur un compte nouvellement ajouté (FR-003). */
  initialBackfillDays: number;
  /** Plafond de rattrapage après une longue absence. */
  maxLookbackDays: number;
  /** Fenêtre glissante des commentaires reçus (FR-008). */
  receivedCommentsWindowDays: number;
  /** Garde-fou de coût : publications demandées par appel et par compte. */
  maxPostsPerAccount: number;
  /** Garde-fou de coût : commentaires demandés par appel et par publication. */
  maxCommentsPerPost: number;
}

export type NumericSyncSetting = keyof SyncSettings;

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  initialBackfillDays: 7,
  maxLookbackDays: 90,
  receivedCommentsWindowDays: 30,
  maxPostsPerAccount: 20,
  maxCommentsPerPost: 50,
};

export interface SettingBound {
  min: number;
  max: number;
  label: string;
  unit: string;
}

/**
 * Bornes dures. Les hautes sont des garde-fous de facture : à ~0,002 $ l'unité,
 * 200 publications par compte et par passage sur 100 comptes suivis, c'est
 * 40 $ par actualisation. Les basses interdisent le zéro, qui désactiverait
 * silencieusement la récupération.
 */
export const SYNC_SETTINGS_BOUNDS: Record<keyof SyncSettings, SettingBound> = {
  initialBackfillDays: { min: 1, max: 365, label: "Historique à l'ajout", unit: "jours" },
  maxLookbackDays: { min: 1, max: 365, label: "Rattrapage maximal", unit: "jours" },
  receivedCommentsWindowDays: {
    min: 1,
    max: 365,
    label: "Fenêtre commentaires",
    unit: "jours",
  },
  maxPostsPerAccount: { min: 1, max: 200, label: "Publ. / compte", unit: "par appel" },
  maxCommentsPerPost: { min: 1, max: 500, label: "Comm. / publication", unit: "par appel" },
};

export const NUMERIC_SYNC_SETTINGS = Object.keys(
  SYNC_SETTINGS_BOUNDS,
) as NumericSyncSetting[];

function isValidNumber(key: NumericSyncSetting, value: unknown): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  const bound = SYNC_SETTINGS_BOUNDS[key];
  return value >= bound.min && value <= bound.max;
}

/**
 * Fusionne un réglage stocké sur une base, champ par champ.
 *
 * Une valeur absente, mal typée ou hors bornes retombe sur la base plutôt que
 * de faire échouer la lecture : un réglage corrompu ne doit pas empêcher
 * l'actualisation de tourner — il doit juste ne pas s'appliquer.
 */
export function mergeSyncSettings(
  base: SyncSettings,
  stored: unknown,
): SyncSettings {
  if (stored === null || typeof stored !== "object") return { ...base };
  const patch = stored as Record<string, unknown>;
  const merged: SyncSettings = { ...base };

  for (const key of NUMERIC_SYNC_SETTINGS) {
    if (isValidNumber(key, patch[key])) merged[key] = patch[key] as number;
  }

  // Un historique plus profond que le plafond de rattrapage serait tronqué en
  // silence par `computeFetchWindow` : on aligne plutôt que de laisser un
  // réglage qui ne produit pas ce qu'il affiche.
  if (merged.initialBackfillDays > merged.maxLookbackDays) {
    merged.initialBackfillDays = merged.maxLookbackDays;
  }
  return merged;
}

/**
 * Valide une saisie complète avant écriture.
 *
 * Renvoie `null` si tout est bon, sinon le message à afficher. Contrairement à
 * la fusion, on refuse ici plutôt que de corriger : l'utilisateur vient de
 * taper la valeur, il doit savoir qu'elle n'est pas prise.
 */
export function validateSyncSettings(patch: unknown): string | null {
  if (patch === null || typeof patch !== "object") {
    return "Réglages illisibles.";
  }
  const input = patch as Record<string, unknown>;

  for (const key of NUMERIC_SYNC_SETTINGS) {
    const value = input[key];
    if (value === undefined) continue;
    if (!isValidNumber(key, value)) {
      const bound = SYNC_SETTINGS_BOUNDS[key];
      return `${bound.label} : un entier entre ${bound.min} et ${bound.max}.`;
    }
  }

  const backfill = input.initialBackfillDays;
  const lookback = input.maxLookbackDays;
  if (
    typeof backfill === "number" &&
    typeof lookback === "number" &&
    backfill > lookback
  ) {
    return "L'historique à l'ajout ne peut pas dépasser le rattrapage maximal.";
  }
  return null;
}
