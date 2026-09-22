import "server-only";

import { db, unwrap } from "@/shared/lib/db";
import type { MediaKindRow, PostRow } from "@/shared/lib/rows";

/** Publications du fil (FR-003, FR-004, FR-010). */

export interface UpsertPostInput {
  providerPostId: string;
  accountId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  authorProfileUrl: string | null;
  body: string;
  media: unknown;
  mediaKind: MediaKindRow;
  isRepost: boolean;
  postUrl: string | null;
  publishedAt: Date;
  isOwn: boolean;
}

/**
 * Insère les publications nouvelles et laisse intactes celles déjà connues.
 *
 * `ignoreDuplicates` est délibéré : un post déjà en base porte peut-être un
 * statut « traité » et un like. Un upsert qui écrase remettrait l'élément dans
 * la file à chaque actualisation — exactement ce que SC-006 interdit.
 */
export async function insertNewPosts(posts: UpsertPostInput[]): Promise<number> {
  if (posts.length === 0) return 0;
  const rows = unwrap(
    await db()
      .from("posts")
      .upsert(
        posts.map((post) => ({
          provider_post_id: post.providerPostId,
          account_id: post.accountId,
          author_name: post.authorName,
          author_avatar_url: post.authorAvatarUrl,
          author_profile_url: post.authorProfileUrl,
          body: post.body,
          media: post.media,
          media_kind: post.mediaKind,
          is_repost: post.isRepost,
          post_url: post.postUrl,
          published_at: post.publishedAt.toISOString(),
          is_own: post.isOwn,
        })),
        { onConflict: "provider_post_id", ignoreDuplicates: true },
      )
      .select("id"),
    "insertion des publications",
  ) as Array<{ id: string }>;
  return rows.length;
}

export interface FeedFilter {
  listId?: string;
  /** `unprocessed` = mode inbox (par défaut), `all` = consultation. */
  scope?: "unprocessed" | "all";
  limit?: number;
  before?: Date;
}

export interface FeedPost extends PostRow {
  /** Action d'écriture en attente sur cette publication, s'il y en a une. */
  pendingAction: { id: string; kind: string; scheduledFor: string } | null;
}

/**
 * Fil antichronologique strict, filtrable par liste (FR-004).
 *
 * Trois exclusions structurelles, appliquées en base et non à l'affichage :
 * les partages, les publications de l'utilisateur (elles vivent dans l'inbox)
 * et rien d'autre. Aucun tri par engagement, aucune recommandation — c'est la
 * promesse du produit.
 */
export async function getFeed(filter: FeedFilter = {}): Promise<FeedPost[]> {
  const limit = filter.limit ?? 50;

  let accountIds: string[] | null = null;
  if (filter.listId) {
    const memberships = unwrap(
      await db().from("list_accounts").select("account_id").eq("list_id", filter.listId),
      "lecture des membres de la liste",
    ) as Array<{ account_id: string }>;
    accountIds = memberships.map((row) => row.account_id);
    if (accountIds.length === 0) return [];
  }

  let query = db()
    .from("posts")
    .select("*")
    .eq("is_own", false)
    .eq("is_repost", false)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (accountIds) query = query.in("account_id", accountIds);
  if ((filter.scope ?? "unprocessed") === "unprocessed") {
    query = query.is("processed_at", null);
  }
  if (filter.before) query = query.lt("published_at", filter.before.toISOString());

  const posts = unwrap(await query, "lecture du fil") as PostRow[];
  if (posts.length === 0) return [];

  const pending = unwrap(
    await db()
      .from("write_actions")
      .select("id, kind, scheduled_for, target_post_id")
      .in("status", ["pending", "sending"])
      .in("target_post_id", posts.map((post) => post.id)),
    "lecture des actions en attente",
  ) as Array<{ id: string; kind: string; scheduled_for: string; target_post_id: string }>;

  return posts.map((post) => {
    const action = pending.find((entry) => entry.target_post_id === post.id);
    return {
      ...post,
      pendingAction: action
        ? { id: action.id, kind: action.kind, scheduledFor: action.scheduled_for }
        : null,
    };
  });
}

export async function getPost(id: string): Promise<PostRow | null> {
  const rows = unwrap(
    await db().from("posts").select("*").eq("id", id).limit(1),
    "lecture d'une publication",
  ) as PostRow[];
  return rows[0] ?? null;
}

/** Publications de l'utilisateur dont on veut les commentaires (FR-008). */
export async function getOwnPostsSince(since: Date): Promise<PostRow[]> {
  return unwrap(
    await db()
      .from("posts")
      .select("*")
      .eq("is_own", true)
      .gte("published_at", since.toISOString())
      .order("published_at", { ascending: false }),
    "lecture des publications de l'utilisateur",
  ) as PostRow[];
}

export async function countUnprocessedPosts(): Promise<number> {
  const { count, error } = await db()
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("is_own", false)
    .eq("is_repost", false)
    .is("processed_at", null);
  if (error) throw new Error(`Comptage du fil : ${error.message}`);
  return count ?? 0;
}

export async function markPostProcessed(
  postId: string,
  reason: "commented" | "ignored" | "liked",
): Promise<void> {
  const { error } = await db()
    .from("posts")
    .update({ processed_at: new Date().toISOString(), processed_reason: reason })
    .eq("id", postId)
    .is("processed_at", null);
  if (error) throw new Error(`Marquage de la publication : ${error.message}`);
}

export async function unmarkPostProcessed(postId: string): Promise<void> {
  const { error } = await db()
    .from("posts")
    .update({ processed_at: null, processed_reason: null })
    .eq("id", postId);
  if (error) throw new Error(`Annulation du marquage : ${error.message}`);
}

export async function setPostLiked(postId: string, likedAt: Date | null): Promise<void> {
  const { error } = await db()
    .from("posts")
    .update({ liked_at: likedAt?.toISOString() ?? null })
    .eq("id", postId);
  if (error) throw new Error(`Enregistrement du like : ${error.message}`);
}
