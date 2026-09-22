/**
 * Coupe-circuit (FR-018).
 *
 * Deux responsabilités, volontairement séparées de la file :
 *  1. reconnaître, dans une erreur du fournisseur d'écriture, un signal de
 *     restriction du compte plutôt qu'une panne banale ;
 *  2. arbitrer une demande de reprise (manuelle uniquement, jamais avant 72 h).
 *
 * La reconnaissance est délibérément généreuse : un faux positif coûte une
 * suspension inutile qu'on lève à la main, un faux négatif coûte le compte.
 */

export type RestrictionSignal =
  | "rate_limited"
  | "provider_error"
  | "checkpoint"
  | "session_expired"
  | "identity_verification";

export interface RestrictionDetection {
  signal: RestrictionSignal;
  reason: string;
}

export interface ProviderFailure {
  status?: number;
  code?: string;
  message?: string;
  body?: unknown;
}

/** Motifs textuels renvoyés par les fournisseurs d'écriture LinkedIn. */
const PATTERNS: Array<{ signal: RestrictionSignal; regex: RegExp; reason: string }> = [
  {
    signal: "checkpoint",
    regex: /\b(checkpoint|captcha|two[-\s]?factor|2fa|otp|in[-\s]?app[-\s]?validation|challenge)\b/i,
    reason: "LinkedIn demande une validation (checkpoint, 2FA, OTP ou CAPTCHA).",
  },
  {
    signal: "identity_verification",
    regex: /\b(identity[-\s]?verification|verify[-\s]?your[-\s]?identity|account[-\s]?restricted|restriction)\b/i,
    reason: "LinkedIn demande une vérification d'identité ou signale une restriction.",
  },
  {
    signal: "session_expired",
    regex: /\b(session[-\s]?expired|credentials?[-\s]?(invalid|expired)|disconnected[-\s]?account|reconnect|unauthorized)\b/i,
    reason: "La session du compte connecté a expiré.",
  },
];

/**
 * Analyse un échec d'écriture. Retourne `null` quand rien n'indique une
 * restriction — l'action est alors simplement marquée en échec.
 */
export function detectRestriction(
  failure: ProviderFailure,
): RestrictionDetection | null {
  const haystack = [
    failure.code ?? "",
    failure.message ?? "",
    typeof failure.body === "string" ? failure.body : JSON.stringify(failure.body ?? ""),
  ].join(" ");

  for (const pattern of PATTERNS) {
    if (pattern.regex.test(haystack)) {
      return { signal: pattern.signal, reason: pattern.reason };
    }
  }

  if (failure.status === 429) {
    return {
      signal: "rate_limited",
      reason: "Le fournisseur d'écriture a renvoyé 429 (trop de requêtes).",
    };
  }
  if (failure.status !== undefined && failure.status >= 500) {
    return {
      signal: "provider_error",
      reason: `Le fournisseur d'écriture a renvoyé ${failure.status}.`,
    };
  }
  if (failure.status === 401 || failure.status === 403) {
    return {
      signal: "session_expired",
      reason: `Accès refusé par le fournisseur d'écriture (${failure.status}).`,
    };
  }
  return null;
}

/** Délai minimal avant toute reprise après suspension (FR-018). */
export const MIN_SUSPENSION_HOURS = 72;

export interface CircuitState {
  status: "active" | "suspended";
  suspendedAt: Date | null;
  suspendedReason: string | null;
  suspendedSignal: RestrictionSignal | null;
}

export type ResumeDecision =
  | { allowed: true }
  | { allowed: false; reason: "not_suspended" }
  | { allowed: false; reason: "too_soon"; availableAt: Date; remainingMs: number };

/**
 * Peut-on reprendre la file ?
 *
 * Aucune reprise automatique : cette fonction ne répond qu'à une demande
 * explicite de l'utilisateur, et refuse tant que les 72 h ne sont pas écoulées.
 */
export function canResume(
  state: CircuitState,
  now: Date,
  minimumHours: number = MIN_SUSPENSION_HOURS,
): ResumeDecision {
  if (state.status !== "suspended") {
    return { allowed: false, reason: "not_suspended" };
  }
  if (!state.suspendedAt) return { allowed: true };

  const availableAt = new Date(
    state.suspendedAt.getTime() + minimumHours * 3_600_000,
  );
  if (now.getTime() < availableAt.getTime()) {
    return {
      allowed: false,
      reason: "too_soon",
      availableAt,
      remainingMs: availableAt.getTime() - now.getTime(),
    };
  }
  return { allowed: true };
}

/** Un envoi peut-il partir dans cet état ? */
export function canSend(state: CircuitState): boolean {
  return state.status === "active";
}
