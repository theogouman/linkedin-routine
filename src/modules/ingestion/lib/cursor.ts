/**
 * Curseurs de récupération incrémentale (FR-003, FR-022).
 *
 * Le principe tient en une phrase : on ne redemande jamais une fenêtre fixe,
 * seulement ce qui est paru depuis la dernière récupération **réussie**. Deux
 * garde-fous l'encadrent :
 *
 *  — à l'amorçage d'un compte, on remonte `initialBackfillDays` (7 par défaut)
 *    pour que le fil ne soit pas vide à l'ajout ;
 *  — après une longue absence, on plafonne à `maxLookbackDays` : sans cela une
 *    seule ouverture après six mois demanderait six mois de publications sur
 *    100+ comptes, d'un coup et au prix fort.
 */

export interface CursorState {
  /** Dernière récupération réussie. `null` = compte jamais synchronisé. */
  lastSyncedAt: Date | null;
}

export interface FetchWindowOptions {
  now: Date;
  initialBackfillDays: number;
  maxLookbackDays: number;
  /**
   * Léger recul appliqué au curseur pour absorber les publications dont
   * l'horodatage remonte après coup côté fournisseur. Sans ce chevauchement,
   * un post publié à la seconde près pendant la récupération précédente
   * pourrait n'être vu par aucun des deux passages.
   */
  overlapMinutes?: number;
}

export interface FetchWindow {
  /** Borne basse : on ne demande rien de plus ancien. */
  since: Date;
  /** Premier passage sur ce compte (aucun curseur). */
  isInitial: boolean;
  /** true si `maxLookbackDays` a tronqué la fenêtre — du contenu est manqué. */
  truncated: boolean;
}

const DAY_MS = 86_400_000;

export function computeFetchWindow(
  cursor: CursorState,
  options: FetchWindowOptions,
): FetchWindow {
  const { now, initialBackfillDays, maxLookbackDays } = options;
  const overlapMs = (options.overlapMinutes ?? 10) * 60_000;
  const floor = new Date(now.getTime() - maxLookbackDays * DAY_MS);

  if (cursor.lastSyncedAt === null) {
    const backfill = new Date(now.getTime() - initialBackfillDays * DAY_MS);
    const since = backfill.getTime() < floor.getTime() ? floor : backfill;
    return { since, isInitial: true, truncated: false };
  }

  const withOverlap = new Date(cursor.lastSyncedAt.getTime() - overlapMs);
  if (withOverlap.getTime() < floor.getTime()) {
    return { since: floor, isInitial: false, truncated: true };
  }
  // Un curseur dans le futur (horloge décalée, restauration de sauvegarde) ne
  // doit pas produire une fenêtre vide silencieuse : on le ramène à maintenant.
  const since = withOverlap.getTime() > now.getTime() ? now : withOverlap;
  return { since, isInitial: false, truncated: false };
}

/**
 * Fenêtre glissante des commentaires reçus (FR-008).
 *
 * Deux bornes se combinent : on ne veut pas de commentaire sur une publication
 * de plus de 30 jours, et on ne veut pas non plus re-télécharger ce qu'on a
 * déjà. La borne effective est donc la plus récente des deux.
 */
export function computeReceivedCommentsWindow(
  cursor: CursorState,
  options: FetchWindowOptions & { windowDays: number },
): FetchWindow {
  const base = computeFetchWindow(cursor, options);
  const slidingFloor = new Date(
    options.now.getTime() - options.windowDays * DAY_MS,
  );
  return {
    ...base,
    since: base.since.getTime() > slidingFloor.getTime() ? base.since : slidingFloor,
  };
}

/**
 * Traduit une borne absolue vers le filtre grossier des actors (`1h`, `24h`,
 * `week`, `month`, `any`). Le filtrage fin reste fait côté app sur
 * l'horodatage exact — ce filtre ne sert qu'à ne pas payer pour du contenu
 * qu'on jetterait ensuite.
 */
export type PostedLimit = "1h" | "24h" | "week" | "month" | "3months" | "6months" | "year" | "any";

export function toPostedLimit(since: Date, now: Date): PostedLimit {
  const ageMs = now.getTime() - since.getTime();
  if (ageMs <= 3_600_000) return "1h";
  if (ageMs <= DAY_MS) return "24h";
  if (ageMs <= 7 * DAY_MS) return "week";
  if (ageMs <= 31 * DAY_MS) return "month";
  if (ageMs <= 93 * DAY_MS) return "3months";
  if (ageMs <= 186 * DAY_MS) return "6months";
  if (ageMs <= 366 * DAY_MS) return "year";
  return "any";
}

/** Variante restreinte aux valeurs acceptées par l'actor de commentaires. */
export function toCommentPostedLimit(
  since: Date,
  now: Date,
): "1h" | "24h" | "week" | "month" | "any" {
  const limit = toPostedLimit(since, now);
  return limit === "1h" || limit === "24h" || limit === "week" || limit === "month"
    ? limit
    : "any";
}
