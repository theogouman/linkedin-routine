import "server-only";

import { db, unwrap } from "@/shared/lib/db";
import type { PostRow, ReceivedCommentRow } from "@/shared/lib/rows";

/** Commentaires reçus sur les publications de l'utilisateur (FR-008, FR-009). */

export interface UpsertCommentInput {
  providerCommentId: string;
  postId: string;
  parentCommentId: string | null;
  depth: number;
  authorName: string | null;
  authorProfileUrl: string | null;
  authorAvatarUrl: string | null;
  body: string;
  commentUrl: string | null;
  publishedAt: Date;
}

/**
 * Insère les commentaires nouveaux sans toucher aux connus.
 *
 * Même raison que pour les publications : un commentaire déjà traité ne doit
 * jamais revenir dans la file à l'actualisation suivante.
 */
export async function insertNewComments(
  comments: UpsertCommentInput[],
): Promise<number> {
  if (comments.length === 0) return 0;
  const rows = unwrap(
    await db()
      .from("received_comments")
      .upsert(
        comments.map((comment) => ({
          provider_comment_id: comment.providerCommentId,
          post_id: comment.postId,
          parent_comment_id: comment.parentCommentId,
          depth: comment.depth,
          author_name: comment.authorName,
          author_profile_url: comment.authorProfileUrl,
          author_avatar_url: comment.authorAvatarUrl,
          body: comment.body,
          comment_url: comment.commentUrl,
          published_at: comment.publishedAt.toISOString(),
        })),
        { onConflict: "provider_comment_id", ignoreDuplicates: true },
      )
      .select("id"),
    "insertion des commentaires reçus",
  ) as Array<{ id: string }>;
  return rows.length;
}

/** Correspondance identifiant fournisseur → identifiant interne. */
export async function mapProviderCommentIds(
  providerIds: string[],
): Promise<Map<string, string>> {
  if (providerIds.length === 0) return new Map();
  const rows = unwrap(
    await db()
      .from("received_comments")
      .select("id, provider_comment_id")
      .in("provider_comment_id", providerIds),
    "correspondance des commentaires",
  ) as Array<{ id: string; provider_comment_id: string }>;
  return new Map(rows.map((row) => [row.provider_comment_id, row.id]));
}

export interface InboxComment extends ReceivedCommentRow {
  post: Pick<PostRow, "id" | "body" | "post_url" | "published_at"> | null;
  pendingAction: { id: string; scheduledFor: string } | null;
}

export async function getInbox(
  options: { scope?: "unprocessed" | "all"; limit?: number } = {},
): Promise<InboxComment[]> {
  let query = db()
    .from("received_comments")
    .select("*, posts!inner(id, body, post_url, published_at)")
    .order("published_at", { ascending: false })
    .limit(options.limit ?? 100);

  if ((options.scope ?? "unprocessed") === "unprocessed") {
    query = query.is("processed_at", null);
  }

  const rows = unwrap(await query, "lecture de l'inbox") as Array<
    ReceivedCommentRow & { posts: InboxComment["post"] }
  >;
  if (rows.length === 0) return [];

  const pending = unwrap(
    await db()
      .from("write_actions")
      .select("id, scheduled_for, target_comment_id")
      .in("status", ["pending", "sending"])
      .in("target_comment_id", rows.map((row) => row.id)),
    "lecture des réponses en attente",
  ) as Array<{ id: string; scheduled_for: string; target_comment_id: string }>;

  return rows.map(({ posts, ...comment }) => {
    const action = pending.find((entry) => entry.target_comment_id === comment.id);
    return {
      ...comment,
      post: posts,
      pendingAction: action
        ? { id: action.id, scheduledFor: action.scheduled_for }
        : null,
    };
  });
}

export async function getComment(id: string): Promise<ReceivedCommentRow | null> {
  const rows = unwrap(
    await db().from("received_comments").select("*").eq("id", id).limit(1),
    "lecture d'un commentaire",
  ) as ReceivedCommentRow[];
  return rows[0] ?? null;
}

export async function countUnprocessedComments(): Promise<number> {
  const { count, error } = await db()
    .from("received_comments")
    .select("id", { count: "exact", head: true })
    .is("processed_at", null);
  if (error) throw new Error(`Comptage de l'inbox : ${error.message}`);
  return count ?? 0;
}

export async function markCommentProcessed(
  commentId: string,
  reason: "replied" | "ignored" | "liked",
): Promise<void> {
  const { error } = await db()
    .from("received_comments")
    .update({ processed_at: new Date().toISOString(), processed_reason: reason })
    .eq("id", commentId)
    .is("processed_at", null);
  if (error) throw new Error(`Marquage du commentaire : ${error.message}`);
}

export async function unmarkCommentProcessed(commentId: string): Promise<void> {
  const { error } = await db()
    .from("received_comments")
    .update({ processed_at: null, processed_reason: null })
    .eq("id", commentId);
  if (error) throw new Error(`Annulation du marquage : ${error.message}`);
}

export async function setCommentLiked(
  commentId: string,
  likedAt: Date | null,
): Promise<void> {
  const { error } = await db()
    .from("received_comments")
    .update({ liked_at: likedAt?.toISOString() ?? null })
    .eq("id", commentId);
  if (error) throw new Error(`Enregistrement du like : ${error.message}`);
}
