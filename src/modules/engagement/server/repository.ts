import "server-only";

import { db, unwrap } from "@/shared/lib/db";
import type {
  QueueStateRow,
  WriteActionRow,
  WriteOrigin,
  WriteStatus,
} from "@/shared/lib/rows";
import type { RestrictionSignal } from "../lib/circuit";
import type { ScheduledAction, WriteKind } from "../lib/policy";

/** File d'écriture, état du coupe-circuit et journal (FR-016 → FR-018, FR-023). */

export interface EnqueueInput {
  kind: WriteKind;
  targetType: "post" | "comment";
  targetPostId: string | null;
  targetCommentId: string | null;
  body: string | null;
  media: unknown;
  origin: WriteOrigin;
  scheduledFor: Date;
}

export async function insertWriteAction(
  input: EnqueueInput,
): Promise<WriteActionRow> {
  const rows = unwrap(
    await db()
      .from("write_actions")
      .insert({
        kind: input.kind,
        target_type: input.targetType,
        target_post_id: input.targetPostId,
        target_comment_id: input.targetCommentId,
        body: input.body,
        media: input.media,
        origin: input.origin,
        scheduled_for: input.scheduledFor.toISOString(),
      })
      .select(),
    "mise en file de l'action",
  ) as WriteActionRow[];
  const action = rows[0];
  if (!action) throw new Error("Mise en file : aucune ligne renvoyée.");
  return action;
}

/**
 * Actions prises en compte par l'ordonnanceur.
 *
 * On retient les envoyées ET les programmées : les plafonds et la cadence
 * portent sur le rythme réel du compte, pas seulement sur ce qui est déjà
 * parti. Ignorer la file à venir permettrait d'empiler dix commentaires sur la
 * même minute.
 */
export async function getSchedulingHistory(since: Date): Promise<ScheduledAction[]> {
  const rows = unwrap(
    await db()
      .from("write_actions")
      .select("kind, scheduled_for, sent_at, status")
      .in("status", ["pending", "sending", "sent"])
      .gte("scheduled_for", since.toISOString())
      .order("scheduled_for"),
    "lecture de l'historique d'ordonnancement",
  ) as Array<{
    kind: WriteKind;
    scheduled_for: string;
    sent_at: string | null;
    status: WriteStatus;
  }>;

  return rows.map((row) => ({
    kind: row.kind,
    at: new Date(row.sent_at ?? row.scheduled_for),
  }));
}

export async function getPendingActions(): Promise<WriteActionRow[]> {
  return unwrap(
    await db()
      .from("write_actions")
      .select("*")
      .in("status", ["pending", "sending"])
      .order("scheduled_for"),
    "lecture de la file",
  ) as WriteActionRow[];
}

/**
 * Compte seul, sans ramener les lignes.
 *
 * La pastille de navigation n'a besoin que du nombre ; charger la file entière
 * pour en prendre la longueur faisait transiter tout le corps des commentaires
 * en attente à chaque affichage d'écran.
 */
export async function countPendingActions(): Promise<number> {
  const { count, error } = await db()
    .from("write_actions")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "sending"]);
  if (error) throw new Error(`Comptage de la file : ${error.message}`);
  return count ?? 0;
}

export async function getDueActions(now: Date, limit = 5): Promise<WriteActionRow[]> {
  return unwrap(
    await db()
      .from("write_actions")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now.toISOString())
      .order("scheduled_for")
      .limit(limit),
    "lecture des actions dues",
  ) as WriteActionRow[];
}

/**
 * Passe une action en `sending` seulement si elle est encore `pending`.
 *
 * C'est le verrou qui empêche deux exécutions concurrentes de la purge
 * d'envoyer deux fois le même commentaire : la condition sur le statut fait
 * échouer la seconde mise à jour, qui ne renvoie alors aucune ligne.
 */
export async function claimAction(actionId: string): Promise<boolean> {
  const rows = unwrap(
    await db()
      .from("write_actions")
      .update({ status: "sending", attempts: 1 })
      .eq("id", actionId)
      .eq("status", "pending")
      .select("id"),
    "réservation de l'action",
  ) as Array<{ id: string }>;
  return rows.length === 1;
}

export async function markActionSent(
  actionId: string,
  result: unknown,
  sentAt: Date,
): Promise<void> {
  const { error } = await db()
    .from("write_actions")
    .update({
      status: "sent",
      sent_at: sentAt.toISOString(),
      provider_result: result,
      error: null,
    })
    .eq("id", actionId);
  if (error) throw new Error(`Enregistrement de l'envoi : ${error.message}`);
}

export async function markActionFailed(
  actionId: string,
  reason: string,
): Promise<void> {
  const { error } = await db()
    .from("write_actions")
    .update({ status: "failed", error: reason.slice(0, 2000) })
    .eq("id", actionId);
  if (error) throw new Error(`Enregistrement de l'échec : ${error.message}`);
}

/** Remet en file une action réservée mais non partie (file suspendue). */
export async function releaseAction(actionId: string): Promise<void> {
  const { error } = await db()
    .from("write_actions")
    .update({ status: "pending" })
    .eq("id", actionId)
    .eq("status", "sending");
  if (error) throw new Error(`Libération de l'action : ${error.message}`);
}

/** Annulation par l'utilisateur — possible tant que l'action n'est pas partie. */
export async function cancelAction(actionId: string): Promise<boolean> {
  const rows = unwrap(
    await db()
      .from("write_actions")
      .update({ status: "cancelled" })
      .eq("id", actionId)
      .eq("status", "pending")
      .select("id"),
    "annulation de l'action",
  ) as Array<{ id: string }>;
  return rows.length === 1;
}

export interface JournalEntry extends WriteActionRow {
  postUrl: string | null;
  postExcerpt: string | null;
  commentExcerpt: string | null;
}

/** Journal de tout ce qui est parti depuis l'app (FR-016, FR-023). */
export async function getJournal(limit = 100): Promise<JournalEntry[]> {
  const actions = unwrap(
    await db()
      .from("write_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
    "lecture du journal",
  ) as WriteActionRow[];
  if (actions.length === 0) return [];

  const postIds = [...new Set(actions.map((a) => a.target_post_id).filter(isString))];
  const commentIds = [...new Set(actions.map((a) => a.target_comment_id).filter(isString))];

  const posts = postIds.length
    ? ((unwrap(
        await db().from("posts").select("id, post_url, body").in("id", postIds),
        "lecture des publications du journal",
      ) as Array<{ id: string; post_url: string | null; body: string | null }>))
    : [];
  const comments = commentIds.length
    ? ((unwrap(
        await db()
          .from("received_comments")
          .select("id, comment_url, body")
          .in("id", commentIds),
        "lecture des commentaires du journal",
      ) as Array<{ id: string; comment_url: string | null; body: string | null }>))
    : [];

  return actions.map((action) => {
    const post = posts.find((entry) => entry.id === action.target_post_id);
    const comment = comments.find((entry) => entry.id === action.target_comment_id);
    return {
      ...action,
      postUrl: comment?.comment_url ?? post?.post_url ?? null,
      postExcerpt: excerpt(post?.body ?? null),
      commentExcerpt: excerpt(comment?.body ?? null),
    };
  });
}

function isString(value: string | null): value is string {
  return typeof value === "string";
}

function excerpt(value: string | null): string | null {
  if (!value) return null;
  return value.length > 160 ? `${value.slice(0, 157)}…` : value;
}

// ── État de la file / coupe-circuit ────────────────────────────────────────

export async function getQueueState(): Promise<QueueStateRow> {
  const rows = unwrap(
    await db().from("queue_state").select("*").eq("id", 1).limit(1),
    "lecture de l'état de la file",
  ) as QueueStateRow[];
  const state = rows[0];
  if (state) return state;

  const created = unwrap(
    await db().from("queue_state").insert({ id: 1 }).select(),
    "initialisation de l'état de la file",
  ) as QueueStateRow[];
  const row = created[0];
  if (!row) throw new Error("État de la file : initialisation impossible.");
  return row;
}

export async function suspendQueue(
  reason: string,
  signal: RestrictionSignal,
  at: Date,
): Promise<void> {
  // La condition sur `status` rend l'appel idempotent : plusieurs échecs
  // simultanés ne réécrivent pas la date de suspension, qui commande les 72 h.
  const { error } = await db()
    .from("queue_state")
    .update({
      status: "suspended",
      suspended_at: at.toISOString(),
      suspended_reason: reason.slice(0, 1000),
      suspended_signal: signal,
    })
    .eq("id", 1)
    .eq("status", "active");
  if (error) throw new Error(`Suspension de la file : ${error.message}`);
}

/** Reprise manuelle : redémarrage du ramp-up à ~30 % (FR-018). */
export async function resumeQueue(at: Date, startFactor: number): Promise<void> {
  const { error } = await db()
    .from("queue_state")
    .update({
      status: "active",
      resumed_at: at.toISOString(),
      suspended_at: null,
      suspended_reason: null,
      suspended_signal: null,
      ramp_started_on: at.toISOString().slice(0, 10),
      ramp_override: startFactor,
      ramp_override_on: at.toISOString().slice(0, 10),
    })
    .eq("id", 1);
  if (error) throw new Error(`Reprise de la file : ${error.message}`);
}

// ── Réglages ───────────────────────────────────────────────────────────────

export async function readSetting<T>(key: string): Promise<T | null> {
  const rows = unwrap(
    await db().from("settings").select("value").eq("key", key).limit(1),
    `lecture du réglage ${key}`,
  ) as Array<{ value: T }>;
  return rows[0]?.value ?? null;
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const { error } = await db()
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Écriture du réglage ${key} : ${error.message}`);
}
