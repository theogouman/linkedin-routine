import "server-only";

import type { WriteActionRow } from "@/shared/lib/rows";
import {
  canSend,
  detectRestriction,
  type CircuitState,
} from "../lib/circuit";
import {
  computeNextSlot,
  countToday,
  effectiveCaps,
  POST_BREAKER_START_FACTOR,
  type NextSlotResult,
  type WriteKind,
} from "../lib/policy";
import { getWriteProvider } from "../providers";
import { WriteProviderError } from "../providers/types";
import {
  claimAction,
  getDueActions,
  getQueueState,
  getSchedulingHistory,
  insertWriteAction,
  markActionFailed,
  markActionSent,
  releaseAction,
  suspendQueue,
} from "./repository";
import { loadPolicy, loadRampState } from "./settings";

/**
 * Orchestration de la file d'écriture (FR-017, FR-018).
 *
 * Deux opérations seulement : mettre en file, et purger ce qui est dû. Toute
 * la politique vit dans `lib/policy.ts` (pur, testé) ; ce fichier ne fait que
 * la brancher sur la base et sur le fournisseur.
 */

export interface QueuePorts {
  /**
   * Appelé après un envoi réussi, pour marquer la cible traitée (FR-010).
   * Injecté par la couche d'orchestration : la file n'a pas à connaître le
   * fil ni l'inbox.
   */
  onSent(action: WriteActionRow): Promise<void>;
  /** Appelé au déclenchement du coupe-circuit, pour alerter l'utilisateur. */
  onSuspended?(reason: string, signal: string): Promise<void>;
  /** Résolution des identifiants fournisseur de la cible d'une action. */
  resolveTarget(action: WriteActionRow): Promise<{
    providerPostId: string;
    providerCommentId: string | null;
  } | null>;
}

const HISTORY_LOOKBACK_MS = 3 * 86_400_000;

export interface EnqueueRequest {
  kind: WriteKind;
  targetType: "post" | "comment";
  targetPostId: string | null;
  targetCommentId: string | null;
  body: string | null;
  media?: unknown;
  origin: "manual" | "ai_edited" | "ai_unchanged";
}

export interface EnqueueResult extends NextSlotResult {
  action: WriteActionRow;
  caps: { comments: number; likes: number; total: number; factor: number };
  usedToday: { comments: number; likes: number; total: number };
}

/**
 * Met une action en file au premier créneau autorisé.
 *
 * Une file suspendue refuse la mise en file : accepter puis ne jamais envoyer
 * laisserait croire à l'utilisateur que son commentaire est parti.
 */
export async function enqueueWriteAction(
  request: EnqueueRequest,
  options: { now?: Date; random?: () => number } = {},
): Promise<EnqueueResult> {
  const now = options.now ?? new Date();
  const state = await getQueueState();
  if (state.status === "suspended") {
    throw new QueueSuspendedError(state.suspended_reason);
  }

  const [policy, ramp] = await Promise.all([loadPolicy(), loadRampState()]);
  const existing = await getSchedulingHistory(
    new Date(now.getTime() - HISTORY_LOOKBACK_MS),
  );

  const slot = computeNextSlot({
    policy,
    ramp,
    now,
    kind: request.kind,
    existing,
    random: options.random,
  });

  const action = await insertWriteAction({
    kind: request.kind,
    targetType: request.targetType,
    targetPostId: request.targetPostId,
    targetCommentId: request.targetCommentId,
    body: request.body,
    media: request.media ?? null,
    origin: request.origin,
    scheduledFor: slot.scheduledFor,
  });

  return {
    ...slot,
    action,
    caps: effectiveCaps(policy, ramp, now),
    usedToday: countToday(policy, existing, now),
  };
}

export class QueueSuspendedError extends Error {
  constructor(readonly suspendedReason: string | null) {
    super(
      "La file de publication est suspendue (coupe-circuit). Reprise manuelle requise.",
    );
    this.name = "QueueSuspendedError";
  }
}

export interface DrainReport {
  attempted: number;
  sent: number;
  failed: number;
  suspended: boolean;
  suspendedReason: string | null;
}

/**
 * Envoie les actions dues.
 *
 * Trois invariants :
 *  — un lot court (`limit`) : entre deux actions il doit s'écouler le délai
 *    aléatoire, donc les envoyer en rafale contredirait la cadence. La purge
 *    tourne souvent et prend peu à chaque fois ;
 *  — au premier signal de restriction, on suspend et on sort de la boucle,
 *    sans tenter l'action suivante ;
 *  — une action réservée mais non partie est remise en file, jamais perdue.
 */
export async function drainQueue(
  ports: QueuePorts,
  options: { now?: Date; limit?: number } = {},
): Promise<DrainReport> {
  const now = options.now ?? new Date();
  const report: DrainReport = {
    attempted: 0, sent: 0, failed: 0, suspended: false, suspendedReason: null,
  };

  const state = await getQueueState();
  const circuit: CircuitState = {
    status: state.status,
    suspendedAt: state.suspended_at ? new Date(state.suspended_at) : null,
    suspendedReason: state.suspended_reason,
    suspendedSignal: null,
  };
  if (!canSend(circuit)) {
    return { ...report, suspended: true, suspendedReason: state.suspended_reason };
  }

  const due = await getDueActions(now, options.limit ?? 3);
  const provider = getWriteProvider();

  for (const action of due) {
    if (!(await claimAction(action.id))) continue;
    report.attempted += 1;

    try {
      const target = await ports.resolveTarget(action);
      if (!target) {
        // Publication ou commentaire disparu entre la mise en file et l'envoi :
        // échec propre, qui n'empêche pas le reste de la file de partir.
        await markActionFailed(
          action.id,
          "Cible introuvable — publication ou commentaire supprimé depuis la mise en file.",
        );
        report.failed += 1;
        continue;
      }

      const result =
        action.kind === "like"
          ? await provider.publishLike({
              targetType: action.target_type,
              providerPostId: target.providerPostId,
              providerCommentId: target.providerCommentId,
            })
          : action.kind === "reply"
            ? await provider.publishReply({
                providerPostId: target.providerPostId,
                providerCommentId: target.providerCommentId ?? "",
                text: action.body ?? "",
                media: toMedia(action.media),
              })
            : await provider.publishComment({
                providerPostId: target.providerPostId,
                text: action.body ?? "",
                media: toMedia(action.media),
              });

      await markActionSent(action.id, result.raw, new Date());
      await ports.onSent(action);
      report.sent += 1;
    } catch (error) {
      const failure =
        error instanceof WriteProviderError
          ? { status: error.status, code: error.code, message: error.message, body: error.body }
          : { message: error instanceof Error ? error.message : String(error) };

      const restriction = detectRestriction(failure);
      if (restriction) {
        // On libère l'action plutôt que de la marquer en échec : elle n'a
        // probablement pas été acceptée, et elle repartira à la reprise.
        await releaseAction(action.id);
        await suspendQueue(restriction.reason, restriction.signal, new Date());
        await ports.onSuspended?.(restriction.reason, restriction.signal);
        report.suspended = true;
        report.suspendedReason = restriction.reason;
        break;
      }

      await markActionFailed(action.id, failure.message ?? "Échec inconnu.");
      report.failed += 1;
    }
  }

  return report;
}

function toMedia(value: unknown): { url: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  return typeof raw.url === "string" ? { url: raw.url } : null;
}

export { POST_BREAKER_START_FACTOR };
