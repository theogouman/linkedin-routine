"use server";

import { revalidatePath } from "next/cache";
import {
  addAccountsToList,
  createList,
  deleteList,
  ensureSelfAccount,
  removeAccountFromList,
  renameList,
} from "@/modules/lists/server/repository";
import { REJECTION_LABELS } from "@/shared/lib/linkedin-url";
import {
  cancelAction,
  getQueueState,
  resumeQueue,
} from "@/modules/engagement/server/repository";
import { canResume } from "@/modules/engagement/lib/circuit";
import { POST_BREAKER_START_FACTOR } from "@/modules/engagement/lib/policy";
import { savePolicy } from "@/modules/engagement/server/settings";
import { QueueSuspendedError } from "@/modules/engagement/server/queue";
import {
  commentOnPost,
  generateForComment,
  generateForPost,
  ignoreComment,
  ignorePost,
  likeComment,
  likePost,
  replyToComment,
  restorePost,
} from "@/server/engagement-service";
import { enrichProfiles, synchronize } from "@/server/sync-service";

/**
 * Server Actions appelées par l'UI.
 *
 * Toutes renvoient un résultat sérialisable `{ ok, ... }` plutôt que de lever :
 * un composant client doit pouvoir afficher « plafond atteint, programmé
 * demain 8 h » sans que ce soit un écran d'erreur. Seuls les bugs réels
 * remontent en exception.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown): ActionResult {
  if (error instanceof QueueSuspendedError) {
    return {
      ok: false,
      message:
        "File suspendue par le coupe-circuit — rien ne partira tant qu'elle n'est pas reprise manuellement.",
    };
  }
  return {
    ok: false,
    message: error instanceof Error ? error.message : "Échec inattendu.",
  };
}

function refreshViews(): void {
  revalidatePath("/fil");
  revalidatePath("/inbox");
  revalidatePath("/file");
}

// ── Actualisation ──────────────────────────────────────────────────────────

export async function refreshNow(
  scope: "all" | "posts" | "comments" = "all",
): Promise<ActionResult & { posts?: number; comments?: number; failed?: number }> {
  try {
    const report = await synchronize(scope);
    refreshViews();
    revalidatePath("/listes");
    return {
      ok: true,
      posts: report.postsInserted,
      comments: report.commentsInserted,
      failed: report.accountsFailed,
      message:
        report.errors.length > 0
          ? `${report.accountsFailed} compte(s) en échec — curseurs intacts, nouvelle tentative au prochain passage.`
          : undefined,
    };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Récupération des photos et des noms de profil (passe séparée).
 *
 * Distincte de l'actualisation parce que son coût est d'une autre nature :
 * chaque profil est facturé à l'unité, alors que l'actualisation ne paie que
 * ce qui a été publié. C'est un geste que l'utilisateur déclenche en sachant
 * ce qu'il déclenche, et le résultat lui dit combien il reste à faire.
 */
export async function fetchProfilePhotosAction(): Promise<
  ActionResult & { attempted?: number; enriched?: number; more?: boolean }
> {
  try {
    const outcome = await enrichProfiles();
    revalidatePath("/listes");
    revalidatePath("/fil");
    return {
      ok: true,
      attempted: outcome.attempted,
      enriched: outcome.enriched,
      more: outcome.more,
      message: outcome.message,
    };
  } catch (error) {
    return fail(error);
  }
}

// ── Écriture ───────────────────────────────────────────────────────────────

export interface EnqueueActionResult extends ActionResult {
  scheduledFor?: string;
  deferred?: boolean;
  deferredReason?: string | null;
}

export async function submitComment(
  postId: string,
  body: string,
  origin: "manual" | "ai_edited" | "ai_unchanged",
): Promise<EnqueueActionResult> {
  try {
    const result = await commentOnPost({ postId, body, origin });
    refreshViews();
    return {
      ok: true,
      scheduledFor: result.scheduledFor.toISOString(),
      deferred: result.deferred,
      deferredReason: result.deferredReason,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function submitReply(
  commentId: string,
  body: string,
  origin: "manual" | "ai_edited" | "ai_unchanged",
): Promise<EnqueueActionResult> {
  try {
    const result = await replyToComment({ commentId, body, origin });
    refreshViews();
    return {
      ok: true,
      scheduledFor: result.scheduledFor.toISOString(),
      deferred: result.deferred,
      deferredReason: result.deferredReason,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function likePostAction(postId: string): Promise<EnqueueActionResult> {
  try {
    const result = await likePost(postId);
    refreshViews();
    return {
      ok: true,
      scheduledFor: result.scheduledFor.toISOString(),
      deferred: result.deferred,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function likeCommentAction(commentId: string): Promise<EnqueueActionResult> {
  try {
    const result = await likeComment(commentId);
    refreshViews();
    return {
      ok: true,
      scheduledFor: result.scheduledFor.toISOString(),
      deferred: result.deferred,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function ignorePostAction(postId: string): Promise<ActionResult> {
  try {
    await ignorePost(postId);
    refreshViews();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function restorePostAction(postId: string): Promise<ActionResult> {
  try {
    await restorePost(postId);
    refreshViews();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function ignoreCommentAction(commentId: string): Promise<ActionResult> {
  try {
    await ignoreComment(commentId);
    refreshViews();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ── Génération ─────────────────────────────────────────────────────────────

export interface GenerateResult extends ActionResult {
  text?: string;
  placeholderProcess?: boolean;
}

export async function generateForPostAction(postId: string): Promise<GenerateResult> {
  try {
    const result = await generateForPost(postId);
    return {
      ok: true,
      text: result.text,
      placeholderProcess: result.usedPlaceholderProcess,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function generateForCommentAction(commentId: string): Promise<GenerateResult> {
  try {
    const result = await generateForComment(commentId);
    return {
      ok: true,
      text: result.text,
      placeholderProcess: result.usedPlaceholderProcess,
    };
  } catch (error) {
    return fail(error);
  }
}

// ── Listes ─────────────────────────────────────────────────────────────────

export async function createListAction(name: string): Promise<ActionResult> {
  try {
    await createList(name);
    revalidatePath("/listes");
    revalidatePath("/fil");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function renameListAction(id: string, name: string): Promise<ActionResult> {
  try {
    await renameList(id, name);
    revalidatePath("/listes");
    revalidatePath("/fil");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteListAction(id: string): Promise<ActionResult> {
  try {
    await deleteList(id);
    revalidatePath("/listes");
    revalidatePath("/fil");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function addAccountsAction(
  listId: string,
  rawInput: string,
): Promise<ActionResult & { added?: number; alreadyPresent?: number; rejected?: string[] }> {
  try {
    const result = await addAccountsToList(listId, rawInput);
    revalidatePath("/listes");
    return {
      ok: true,
      added: result.added,
      alreadyPresent: result.alreadyPresent,
      rejected: result.rejected.map(
        (entry) =>
          `${entry.input} — ${REJECTION_LABELS[entry.reason as keyof typeof REJECTION_LABELS] ?? entry.reason}`,
      ),
    };
  } catch (error) {
    return fail(error);
  }
}

export async function removeAccountAction(
  listId: string,
  accountId: string,
): Promise<ActionResult> {
  try {
    await removeAccountFromList(listId, accountId);
    revalidatePath("/listes");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setSelfProfileAction(profileUrl: string): Promise<ActionResult> {
  try {
    await ensureSelfAccount(profileUrl);
    revalidatePath("/file");
    revalidatePath("/inbox");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ── File d'écriture ────────────────────────────────────────────────────────

export async function cancelQueuedAction(actionId: string): Promise<ActionResult> {
  try {
    const cancelled = await cancelAction(actionId);
    refreshViews();
    return cancelled
      ? { ok: true }
      : { ok: false, message: "Trop tard : cette action est déjà partie ou en cours d'envoi." };
  } catch (error) {
    return fail(error);
  }
}

/** Reprise après coupe-circuit — refusée avant 72 h (FR-018). */
export async function resumeQueueAction(): Promise<ActionResult> {
  try {
    const state = await getQueueState();
    const decision = canResume(
      {
        status: state.status,
        suspendedAt: state.suspended_at ? new Date(state.suspended_at) : null,
        suspendedReason: state.suspended_reason,
        suspendedSignal: null,
      },
      new Date(),
    );

    if (!decision.allowed) {
      if (decision.reason === "not_suspended") {
        return { ok: false, message: "La file n'est pas suspendue." };
      }
      const hours = Math.ceil(decision.remainingMs / 3_600_000);
      return {
        ok: false,
        message: `Reprise impossible avant ${hours} h — le délai de 72 h protège le compte.`,
      };
    }

    await resumeQueue(new Date(), POST_BREAKER_START_FACTOR);
    refreshViews();
    return {
      ok: true,
      message: "File reprise à 30 % des plafonds, remontée progressive ensuite.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function savePolicyAction(patch: {
  caps?: { comments?: number; likes?: number; total?: number };
  delayMinutes?: { min?: number; max?: number };
  maxCommentsPerHour?: number;
  window?: {
    days?: number[];
    startMinute?: number;
    endMinute?: number;
    middayPause?: { startMinute: number; endMinute: number } | null;
  };
}): Promise<ActionResult> {
  try {
    await savePolicy(patch as never);
    revalidatePath("/file");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
