import "server-only";

import {
  getPost,
  markPostProcessed,
  unmarkPostProcessed,
} from "@/modules/feed/server/repository";
import { DEFAULT_REACTION, type ReactionType } from "@/shared/lib/reactions";
import { getComment, markCommentProcessed } from "@/modules/inbox/server/repository";
import { enqueueWriteAction, type EnqueueResult } from "@/modules/engagement/server/queue";
import { generateComment, type GenerationResult } from "@/modules/ai/server/generate";
import type { GenerationContext } from "@/modules/ai/lib/prompt";

/**
 * Cas d'usage de l'écran : commenter, répondre, liker, ignorer, générer.
 *
 * Chaque fonction est le pendant serveur d'un geste de l'utilisateur, et
 * assemble les modules sans qu'aucun n'ait à connaître les autres.
 */

export async function commentOnPost(input: {
  postId: string;
  body: string;
  origin: "manual" | "ai_edited" | "ai_unchanged";
  mediaUrl?: string | null;
}): Promise<EnqueueResult> {
  const text = input.body.trim();
  if (text === "") throw new Error("Le commentaire est vide.");

  const post = await getPost(input.postId);
  if (!post) throw new Error("Publication introuvable.");

  return enqueueWriteAction({
    kind: "comment",
    targetType: "post",
    targetPostId: post.id,
    targetCommentId: null,
    body: text,
    media: input.mediaUrl ? { url: input.mediaUrl } : null,
    origin: input.origin,
  });
}

export async function replyToComment(input: {
  commentId: string;
  body: string;
  origin: "manual" | "ai_edited" | "ai_unchanged";
  mediaUrl?: string | null;
}): Promise<EnqueueResult> {
  const text = input.body.trim();
  if (text === "") throw new Error("La réponse est vide.");

  const comment = await getComment(input.commentId);
  if (!comment) throw new Error("Commentaire introuvable.");

  return enqueueWriteAction({
    kind: "reply",
    targetType: "comment",
    targetPostId: comment.post_id,
    targetCommentId: comment.id,
    body: text,
    media: input.mediaUrl ? { url: input.mediaUrl } : null,
    origin: input.origin,
  });
}

/**
 * Pose une réaction sur une publication (FR-013, étendu aux six réactions).
 *
 * Une réaction déjà posée n'est pas remplaçable : LinkedIn accepte le
 * changement, mais chaque modification est une action de plus sur le compte,
 * et le plafond protège précisément contre ce volume. Changer d'avis coûte
 * donc un passage par LinkedIn, comme avant.
 */
export async function likePost(
  postId: string,
  reactionType: ReactionType = DEFAULT_REACTION,
): Promise<EnqueueResult> {
  const post = await getPost(postId);
  if (!post) throw new Error("Publication introuvable.");
  if (post.liked_at) throw new Error("Cette publication porte déjà une réaction.");

  return enqueueWriteAction({
    kind: "like",
    targetType: "post",
    targetPostId: post.id,
    targetCommentId: null,
    body: null,
    origin: "manual",
    reactionType,
  });
}

export async function likeComment(
  commentId: string,
  reactionType: ReactionType = DEFAULT_REACTION,
): Promise<EnqueueResult> {
  const comment = await getComment(commentId);
  if (!comment) throw new Error("Commentaire introuvable.");
  if (comment.liked_at) throw new Error("Ce commentaire porte déjà une réaction.");

  return enqueueWriteAction({
    kind: "like",
    targetType: "comment",
    targetPostId: comment.post_id,
    targetCommentId: comment.id,
    body: null,
    origin: "manual",
    reactionType,
  });
}

export async function ignorePost(postId: string): Promise<void> {
  await markPostProcessed(postId, "ignored");
}

export async function restorePost(postId: string): Promise<void> {
  await unmarkPostProcessed(postId);
}

export async function ignoreComment(commentId: string): Promise<void> {
  await markCommentProcessed(commentId, "ignored");
}

/** Génération pour une publication du fil (FR-006, process « commentaire »). */
export async function generateForPost(postId: string): Promise<GenerationResult> {
  const post = await getPost(postId);
  if (!post) throw new Error("Publication introuvable.");

  const context: GenerationContext = {
    kind: "comment_on_post",
    authorName: post.author_name,
    postBody: post.body ?? "",
    mediaNote: describeMedia(post.media_kind),
  };
  return generateComment(context);
}

/** Génération pour un commentaire reçu (FR-009, process « réponse »). */
export async function generateForComment(commentId: string): Promise<GenerationResult> {
  const comment = await getComment(commentId);
  if (!comment) throw new Error("Commentaire introuvable.");
  const post = await getPost(comment.post_id);

  const context: GenerationContext = {
    kind: "reply_to_comment",
    ownPostBody: post?.body ?? "",
    commenterName: comment.author_name,
    commentBody: comment.body ?? "",
    thread: [],
  };
  return generateComment(context);
}

function describeMedia(kind: string): string | null {
  switch (kind) {
    case "video":
      return "vidéo non restituée dans l'app — le texte seul est disponible";
    case "document":
      return "carrousel document non restitué dans l'app — le texte seul est disponible";
    case "image":
      return "une ou plusieurs images accompagnent le post";
    case "article":
      return "un article partagé accompagne le post";
    default:
      return null;
  }
}
