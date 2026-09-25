/**
 * Politique d'écriture — plafonds, montée en charge et cadence (FR-017).
 *
 * Tout est en fonctions pures : la file, l'UI et les tests partagent le même
 * calcul, et le seul point d'indéterminisme (le délai aléatoire entre deux
 * envois) est injecté. C'est la propriété qui protège le compte ; elle doit
 * être vérifiable sans base de données.
 */

import {
  daysBetweenLocal,
  fromZonedTime,
  localDateKey,
  startOfNextLocalDay,
  zonedParts,
} from "@/shared/lib/timezone";

export type WriteKind = "comment" | "reply" | "like";

export interface SendWindow {
  /** Jours autorisés, 0 = dimanche … 6 = samedi. Week-end exclu par défaut. */
  days: number[];
  /** Minutes depuis minuit local. */
  startMinute: number;
  endMinute: number;
  /** Creux méridien — aucune émission entre ces deux bornes. */
  middayPause: { startMinute: number; endMinute: number } | null;
}

export interface QueuePolicy {
  timezone: string;
  /** Plafonds journaliers du régime de croisière, avant facteur de montée. */
  caps: { comments: number; likes: number; total: number };
  /** Délai aléatoire entre deux envois, quel que soit leur type. */
  delayMinutes: { min: number; max: number };
  /** Plafond glissant de commentaires par heure. */
  maxCommentsPerHour: number;
  /**
   * Écart minimal, en secondes, entre deux envois IMMÉDIATS. Anti-rafale :
   * deux commentaires publiés à la même seconde ne ressemblent à personne.
   */
  minGapSeconds: number;
  window: SendWindow;
  ramp: {
    /** Facteur de départ — 50 % des plafonds pendant `plateauDays`. */
    startFactor: number;
    plateauDays: number;
    /** Hausse hebdomadaire composée après le plateau. */
    weeklyIncrease: number;
  };
}

/** Régime décrit par FR-017, valeurs de départ configurables en réglages. */
export const DEFAULT_POLICY: QueuePolicy = {
  timezone: "Europe/Paris",
  caps: { comments: 25, likes: 60, total: 90 },
  delayMinutes: { min: 3, max: 12 },
  maxCommentsPerHour: 8,
  minGapSeconds: 20,
  window: {
    days: [1, 2, 3, 4, 5],
    startMinute: 8 * 60,
    endMinute: 19 * 60,
    middayPause: { startMinute: 12 * 60 + 30, endMinute: 14 * 60 },
  },
  ramp: { startFactor: 0.5, plateauDays: 14, weeklyIncrease: 0.15 },
};

/** Facteur de départ imposé après un coupe-circuit (FR-018). */
export const POST_BREAKER_START_FACTOR = 0.3;

export interface RampState {
  /** Jour local de démarrage de la montée, format `YYYY-MM-DD`. */
  startedOn: string;
  /**
   * Facteur de départ imposé — 0.3 après une reprise de coupe-circuit.
   * `null` = régime normal (`policy.ramp.startFactor`).
   */
  overrideFactor: number | null;
}

function parseLocalDay(day: string, timezone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return fromZonedTime(
    { year: year ?? 1970, month: month ?? 1, day: date ?? 1 },
    timezone,
  );
}

/**
 * Facteur courant appliqué aux plafonds.
 *
 * Plateau à `startFactor` pendant `plateauDays`, puis hausse composée chaque
 * semaine entamée, plafonnée à 1. La reprise après coupe-circuit réutilise la
 * même forme avec un `startFactor` de 0.3 : on ne revient jamais au régime
 * plein d'un coup.
 */
export function rampFactor(
  policy: QueuePolicy,
  state: RampState,
  now: Date,
): number {
  const start = state.overrideFactor ?? policy.ramp.startFactor;
  const elapsedDays = daysBetweenLocal(
    parseLocalDay(state.startedOn, policy.timezone),
    now,
    policy.timezone,
  );
  if (elapsedDays < policy.ramp.plateauDays) return Math.min(1, start);
  const weeks = Math.floor((elapsedDays - policy.ramp.plateauDays) / 7) + 1;
  const factor = start * Math.pow(1 + policy.ramp.weeklyIncrease, weeks);
  return Math.min(1, factor);
}

export interface EffectiveCaps {
  comments: number;
  likes: number;
  total: number;
  factor: number;
}

/** Plafonds du jour, facteur de montée appliqué. Jamais moins de 1. */
export function effectiveCaps(
  policy: QueuePolicy,
  state: RampState,
  now: Date,
): EffectiveCaps {
  const factor = rampFactor(policy, state, now);
  return {
    comments: Math.max(1, Math.floor(policy.caps.comments * factor)),
    likes: Math.max(1, Math.floor(policy.caps.likes * factor)),
    total: Math.max(1, Math.floor(policy.caps.total * factor)),
    factor,
  };
}

function isOpenAtMinute(window: SendWindow, minute: number): boolean {
  if (minute < window.startMinute || minute >= window.endMinute) return false;
  const pause = window.middayPause;
  if (pause && minute >= pause.startMinute && minute < pause.endMinute) {
    return false;
  }
  return true;
}

/** L'instant tombe-t-il dans la fenêtre d'émission ? */
export function isWithinSendWindow(policy: QueuePolicy, date: Date): boolean {
  const parts = zonedParts(date, policy.timezone);
  if (!policy.window.days.includes(parts.weekday)) return false;
  return isOpenAtMinute(policy.window, parts.hour * 60 + parts.minute);
}

function atLocalMinute(date: Date, minute: number, timezone: string): Date {
  const parts = zonedParts(date, timezone);
  return fromZonedTime(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: Math.floor(minute / 60),
      minute: minute % 60,
    },
    timezone,
  );
}

/**
 * Prochain instant >= `from` où la fenêtre est ouverte.
 *
 * Avance par paliers (reprise après le creux méridien, ouverture du lendemain,
 * saut du week-end) plutôt que minute par minute : quelques itérations
 * suffisent même pour un vendredi soir.
 */
export function nextWindowOpening(policy: QueuePolicy, from: Date): Date {
  const { window, timezone } = policy;
  let candidate = from;
  for (let guard = 0; guard < 400; guard += 1) {
    const parts = zonedParts(candidate, timezone);
    const minute = parts.hour * 60 + parts.minute;

    if (!window.days.includes(parts.weekday)) {
      candidate = startOfNextLocalDay(candidate, timezone);
      continue;
    }
    if (minute < window.startMinute) {
      return atLocalMinute(candidate, window.startMinute, timezone);
    }
    if (minute >= window.endMinute) {
      candidate = startOfNextLocalDay(candidate, timezone);
      continue;
    }
    const pause = window.middayPause;
    if (pause && minute >= pause.startMinute && minute < pause.endMinute) {
      return atLocalMinute(candidate, pause.endMinute, timezone);
    }
    return candidate;
  }
  throw new Error("Aucune fenêtre d'émission trouvée : vérifie les réglages.");
}

export interface ScheduledAction {
  at: Date;
  kind: WriteKind;
}

export interface NextSlotInput {
  policy: QueuePolicy;
  ramp: RampState;
  now: Date;
  kind: WriteKind;
  /**
   * Actions déjà envoyées ou déjà programmées, tous types confondus. Sert au
   * délai inter-envoi, aux plafonds journaliers et au plafond horaire.
   */
  existing: ScheduledAction[];
  /** Injecté pour rendre le calcul déterministe en test. */
  random?: () => number;
  /**
   * Avant cet instant, la fenêtre d'émission est ignorée (cf.
   * `SESSION_CONTINUATION_MS`). Absent = fenêtre appliquée partout.
   */
  windowFreeUntil?: Date;
}

export interface NextSlotResult {
  scheduledFor: Date;
  /** true si l'action a dû être reportée à un jour ultérieur (plafond atteint). */
  deferred: boolean;
  /** Renseigné quand `deferred` : ce qui a bloqué. */
  deferredReason: "daily_cap" | "hourly_cap" | "window" | null;
}

/**
 * Durée pendant laquelle la fenêtre d'émission ne s'applique pas à une action
 * mise en file.
 *
 * La fenêtre (8 h–19 h en semaine) sert à ce que des envois AUTOMATIQUES aient
 * l'air humains. Mais quand Théo commente lui-même à 23 h, un report de
 * quarante minutes prolonge sa propre session : le repousser au lundi 8 h
 * rendrait le commentaire inutile sans rien protéger. Au-delà de ce délai,
 * l'action n'est plus la suite de sa session, et la fenêtre reprend ses droits.
 */
export const SESSION_CONTINUATION_MS = 3 * 3_600_000;

const HOUR_MS = 3_600_000;

/**
 * Calcule le créneau d'envoi d'une nouvelle action.
 *
 * Ordre des contraintes : délai inter-envoi → fenêtre → plafond horaire de
 * commentaires → plafonds journaliers. Chaque violation repousse le candidat
 * et relance la boucle, si bien qu'un report pour plafond journalier repasse
 * par la fenêtre du jour suivant.
 *
 * Note de dimensionnement : à plafonds pleins (90 actions/jour) et délai moyen
 * de 7,5 min, la journée demanderait ~11 h d'émission pour ~9,5 h de fenêtre
 * ouverte. La cadence l'emporte — c'est elle qui protège le compte — et le
 * surplus déborde sur les jours suivants. Les plafonds sont des maxima, pas
 * des objectifs.
 */
export function computeNextSlot(input: NextSlotInput): NextSlotResult {
  const { policy, ramp, now, kind } = input;
  const random = input.random ?? Math.random;
  const caps = effectiveCaps(policy, ramp, now);
  const isComment = kind === "comment" || kind === "reply";

  const sorted = [...input.existing].sort((a, b) => a.at.getTime() - b.at.getTime());
  const last = sorted[sorted.length - 1];

  const spanMinutes = policy.delayMinutes.max - policy.delayMinutes.min;
  const delayMs =
    (policy.delayMinutes.min + random() * spanMinutes) * 60_000;

  let candidate = new Date(
    Math.max(now.getTime(), last ? last.at.getTime() + delayMs : now.getTime()),
  );
  let deferredReason: NextSlotResult["deferredReason"] = null;

  const windowFreeUntil = input.windowFreeUntil?.getTime() ?? -Infinity;

  for (let guard = 0; guard < 500; guard += 1) {
    if (candidate.getTime() > windowFreeUntil && !isWithinSendWindow(policy, candidate)) {
      const opened = nextWindowOpening(policy, candidate);
      if (deferredReason === null) deferredReason = "window";
      candidate = opened;
      continue;
    }

    // Plafond horaire glissant sur les commentaires et réponses.
    if (isComment) {
      const windowStart = candidate.getTime() - HOUR_MS;
      const inHour = sorted.filter(
        (action) =>
          action.kind !== "like" &&
          action.at.getTime() > windowStart &&
          action.at.getTime() <= candidate.getTime(),
      );
      if (inHour.length >= policy.maxCommentsPerHour) {
        const oldest = inHour[0];
        if (oldest) {
          deferredReason = deferredReason ?? "hourly_cap";
          candidate = new Date(
            oldest.at.getTime() + HOUR_MS + policy.delayMinutes.min * 60_000,
          );
          continue;
        }
      }
    }

    // Plafonds journaliers, comptés sur le jour local du candidat.
    const dayKey = localDateKey(candidate, policy.timezone);
    const sameDay = sorted.filter(
      (action) => localDateKey(action.at, policy.timezone) === dayKey,
    );
    const dayTotal = sameDay.length;
    const dayOfKind = sameDay.filter((action) =>
      isComment ? action.kind !== "like" : action.kind === "like",
    ).length;
    const kindCap = isComment ? caps.comments : caps.likes;

    if (dayTotal >= caps.total || dayOfKind >= kindCap) {
      deferredReason = "daily_cap";
      candidate = nextWindowOpening(
        policy,
        startOfNextLocalDay(candidate, policy.timezone),
      );
      continue;
    }

    return {
      scheduledFor: candidate,
      deferred:
        deferredReason === "daily_cap" ||
        localDateKey(candidate, policy.timezone) !==
          localDateKey(now, policy.timezone),
      deferredReason,
    };
  }

  throw new Error(
    "Impossible de programmer l'action : les plafonds ou la fenêtre sont trop étroits.",
  );
}

// ── Envoi immédiat ou file ─────────────────────────────────────────────────
export type DispatchDecision =
  | {
      mode: "now";
      /** Attente anti-rafale avant l'envoi, en millisecondes (souvent 0). */
      waitMs: number;
    }
  | ({ mode: "queue" } & NextSlotResult);

/**
 * Envoi immédiat par défaut, file seulement quand une limite est atteinte.
 *
 * Théo commente en direct, depuis son téléphone : son geste EST le rythme
 * humain. Tant qu'aucune limite n'est franchie, l'action part tout de suite,
 * à toute heure — un commentaire publié le lendemain matin sur un post de la
 * veille ne sert plus à rien.
 *
 * Les limites qui basculent en file :
 *  - plafond journalier de commentaires, de likes, ou total (montée en charge
 *    appliquée) ;
 *  - plafond horaire glissant de commentaires.
 *
 * Tout est compté sur ce qui est parti ET ce qui est programmé : une file déjà
 * chargée pour aujourd'hui consomme le même quota qu'un envoi réel.
 *
 * L'écart minimal entre deux envois immédiats n'envoie PAS en file : il ne
 * coûte que quelques secondes d'attente, absorbées pendant la requête.
 */
export function decideDispatch(input: NextSlotInput): DispatchDecision {
  const { policy, ramp, now, kind } = input;
  const caps = effectiveCaps(policy, ramp, now);
  const isComment = kind === "comment" || kind === "reply";

  const todayKey = localDateKey(now, policy.timezone);
  const today = input.existing.filter(
    (action) => localDateKey(action.at, policy.timezone) === todayKey,
  );
  const todayOfKind = today.filter((action) =>
    isComment ? action.kind !== "like" : action.kind === "like",
  ).length;
  const kindCap = isComment ? caps.comments : caps.likes;

  const hourStart = now.getTime() - HOUR_MS;
  const commentsLastHour = input.existing.filter(
    (action) =>
      action.kind !== "like" &&
      action.at.getTime() > hourStart &&
      action.at.getTime() <= now.getTime(),
  ).length;

  const underDaily = today.length < caps.total && todayOfKind < kindCap;
  const underHourly = !isComment || commentsLastHour < policy.maxCommentsPerHour;

  if (underDaily && underHourly) {
    const lastPast = input.existing
      .map((action) => action.at.getTime())
      .filter((at) => at <= now.getTime())
      .reduce((max, at) => Math.max(max, at), -Infinity);
    const gapMs = policy.minGapSeconds * 1000;
    const waitMs = Math.max(0, Math.round(lastPast + gapMs - now.getTime()));
    return { mode: "now", waitMs };
  }

  return {
    mode: "queue",
    ...computeNextSlot({
      ...input,
      windowFreeUntil: new Date(now.getTime() + SESSION_CONTINUATION_MS),
    }),
  };
}

/** Compteurs du jour local courant, pour l'affichage de la file. */
export function countToday(
  policy: QueuePolicy,
  existing: ScheduledAction[],
  now: Date,
): { comments: number; likes: number; total: number } {
  const key = localDateKey(now, policy.timezone);
  const today = existing.filter(
    (action) => localDateKey(action.at, policy.timezone) === key,
  );
  return {
    comments: today.filter((a) => a.kind !== "like").length,
    likes: today.filter((a) => a.kind === "like").length,
    total: today.length,
  };
}

/** Minutes de la fenêtre ouvertes dans une journée — sert aux réglages. */
export function dailyOpenMinutes(window: SendWindow): number {
  const span = window.endMinute - window.startMinute;
  const pause = window.middayPause;
  return span - (pause ? pause.endMinute - pause.startMinute : 0);
}
