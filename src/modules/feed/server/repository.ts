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
  reactionCount: number | null;
  commentCount: number | null;
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
          reaction_count: post.reactionCount,
          comment_count: post.commentCount,
        })),
        { onConflict: "provider_post_id", ignoreDuplicates: true },
      )
      .select("id"),
    "insertion des publications",
  ) as Array<{ id: string }>;
  return rows.length;
}

export interface FeedFilter {
  /** Listes retenues. Vide ou absent = toutes. */
  listIds?: string[];
  /**
   * `unprocessed` = à commenter (par défaut), `processed` = déjà commenté,
   * `all` = les deux.
   */
  scope?: "unprocessed" | "processed" | "all";
  limit?: number;
  before?: Date;
}

export interface FeedPost extends PostRow {
  /** Action d'écriture en attente sur cette publication, s'il y en a une. */
  pendingAction: { id: string; kind: string; scheduledFor: string } | null;
  /**
   * Listes auxquelles appartient l'auteur.
   *
   * Calculé ici et non à l'affichage : la carte doit pouvoir dire d'où vient
   * la publication sans que chaque composant refasse la jointure.
   */
  lists: Array<{ id: string; name: string }>;
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

  // Deux lectures BORNÉES plutôt qu'un balayage de `list_accounts` : la
  // première ne charge que les rattachements des listes filtrées, la seconde
  // (plus bas) que ceux des auteurs réellement affichés. Lire la table entière
  // marcherait aujourd'hui — 490 lignes — et se ferait silencieusement
  // tronquer par la limite de lignes de PostgREST le jour où elle grossit,
  // en faisant disparaître des comptes du filtre sans aucune erreur.
  const selected = filter.listIds?.filter((id) => id !== "") ?? [];
  let accountIds: string[] | null = null;
  if (selected.length > 0) {
    const scoped = unwrap(
      await db().from("list_accounts").select("account_id").in("list_id", selected),
      "lecture des membres des listes",
    ) as Array<{ account_id: string }>;
    accountIds = [...new Set(scoped.map((row) => row.account_id))];
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
  const scope = filter.scope ?? "unprocessed";
  if (scope === "unprocessed") query = query.is("processed_at", null);
  else if (scope === "processed") query = query.not("processed_at", "is", null);
  if (filter.before) query = query.lt("published_at", filter.before.toISOString());

  const posts = unwrap(await query, "lecture du fil") as PostRow[];
  if (posts.length === 0) return [];

  const authorIds = [
    ...new Set(posts.map((post) => post.account_id).filter((id): id is string => id !== null)),
  ];

  const [pending, lists, memberships] = await Promise.all([
    db()
      .from("write_actions")
      .select("id, kind, scheduled_for, target_post_id")
      .in("status", ["pending", "sending"])
      .in("target_post_id", posts.map((post) => post.id))
      .then((result) =>
        unwrap(result, "lecture des actions en attente") as Array<{
          id: string;
          kind: string;
          scheduled_for: string;
          target_post_id: string;
        }>,
      ),
    db()
      .from("lists")
      .select("id, name")
      .order("position")
      .then((result) =>
        unwrap(result, "lecture des listes") as Array<{ id: string; name: string }>,
      ),
    authorIds.length === 0
      ? Promise.resolve([] as Array<{ list_id: string; account_id: string }>)
      : db()
          .from("list_accounts")
          .select("list_id, account_id")
          .in("account_id", authorIds)
          .then((result) =>
            unwrap(result, "lecture des rattachements des auteurs") as Array<{
              list_id: string;
              account_id: string;
            }>,
          ),
  ]);

  const listById = new Map(lists.map((list) => [list.id, list]));
  const listsByAccount = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of memberships) {
    const list = listById.get(row.list_id);
    if (!list) continue;
    const current = listsByAccount.get(row.account_id);
    if (current) current.push(list);
    else listsByAccount.set(row.account_id, [list]);
  }

  return posts.map((post) => {
    const action = pending.find((entry) => entry.target_post_id === post.id);
    return {
      ...post,
      pendingAction: action
        ? { id: action.id, kind: action.kind, scheduledFor: action.scheduled_for }
        : null,
      lists: post.account_id ? listsByAccount.get(post.account_id) ?? [] : [],
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

export async function setPostLiked(
  postId: string,
  likedAt: Date | null,
  reactionType: string | null = null,
): Promise<void> {
  const { error } = await db()
    .from("posts")
    .update({
      liked_at: likedAt?.toISOString() ?? null,
      // Remis à null en même temps que la date : une réaction sans date serait
      // un état que rien dans l'app ne sait afficher.
      reaction_type: likedAt === null ? null : reactionType,
    })
    .eq("id", postId);
  if (error) throw new Error(`Enregistrement de la réaction : ${error.message}`);
}
