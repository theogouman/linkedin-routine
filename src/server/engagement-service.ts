import "server-only";

import {
  getPost,
  markPostProcessed,
  unmarkPostProcessed,
} from "@/modules/feed/server/repository";
import { DEFAULT_REACTION, type ReactionType } from "@/shared/lib/reactions";
import { getComment, markCommentProcessed } from "@/modules/inbox/server/repository";
import { enqueueWriteAction, type EnqueueResult } from "@/modules/engagement/server/queue";
import {
  generateVariants,
  type CommentGenerationResult,
} from "@/modules/ai/server/comment-generation";
import { recordChoice, recordGeneration } from "@/modules/ai/server/comment-journal";
import type { Intention, Slot } from "@/modules/ai/lib/comment-variants";

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
  /** Génération d'où vient le texte, quand il en vient une. */
  generationId?: string | null;
  slot?: Slot | null;
}): Promise<EnqueueResult> {
  const text = input.body.trim();
  if (text === "") throw new Error("Le commentaire est vide.");

  const post = await getPost(input.postId);
  if (!post) throw new Error("Publication introuvable.");

  const result = await enqueueWriteAction({
    kind: "comment",
    targetType: "post",
    targetPostId: post.id,
    targetCommentId: null,
    body: text,
    media: input.mediaUrl ? { url: input.mediaUrl } : null,
    origin: input.origin,
  });

  // Le journal est écrit APRÈS la mise en file, et son échec n'emporte pas
  // l'action : un commentaire correctement mis en file ne doit pas être perdu
  // parce que la mesure a échoué.
  if (input.generationId && input.slot) {
    await noteChoice({
      generationId: input.generationId,
      slot: input.slot,
      publishedText: text,
      mode: "commentaire",
      lien: post.post_url,
    });
  }

  return result;
}

export async function replyToComment(input: {
  commentId: string;
  body: string;
  origin: "manual" | "ai_edited" | "ai_unchanged";
  mediaUrl?: string | null;
  generationId?: string | null;
  slot?: Slot | null;
}): Promise<EnqueueResult> {
  const text = input.body.trim();
  if (text === "") throw new Error("La réponse est vide.");

  const comment = await getComment(input.commentId);
  if (!comment) throw new Error("Commentaire introuvable.");

  const result = await enqueueWriteAction({
    kind: "reply",
    targetType: "comment",
    targetPostId: comment.post_id,
    targetCommentId: comment.id,
    body: text,
    media: input.mediaUrl ? { url: input.mediaUrl } : null,
    origin: input.origin,
  });

  if (input.generationId && input.slot) {
    await noteChoice({
      generationId: input.generationId,
      slot: input.slot,
      publishedText: text,
      mode: "reponse",
      lien: comment.comment_url,
    });
  }

  return result;
}

/**
 * Journalisation du choix, isolée pour que son échec reste silencieux.
 *
 * Perdre une mesure est regrettable ; perdre un commentaire que l'utilisateur
 * croit en file le serait beaucoup plus. L'erreur part au journal serveur, pas
 * à l'écran.
 */
async function noteChoice(input: Parameters<typeof recordChoice>[0]): Promise<void> {
  try {
    await recordChoice(input);
  } catch (error) {
    console.error("journal de génération :", error);
  }
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

// ── Générateur de quatre variantes (brief du générateur de commentaires) ────
/**
 * Compose le générateur : le fil et l'inbox ne se connaissent pas, et le
 * module IA ne connaît ni l'un ni l'autre. C'est ici, et seulement ici, qu'ils
 * sont branchés ensemble.
 */
export interface VariantsOutcome extends CommentGenerationResult {
  /** Identifiant de la ligne de journal, à renvoyer au moment du choix. */
  generationId: string | null;
}

export async function generateVariantsForPost(
  postId: string,
  intention: Intention | null,
): Promise<VariantsOutcome> {
  const post = await getPost(postId);
  if (!post) throw new Error("Publication introuvable.");

  const result = await generateVariants({
    mode: "commentaire",
    postBody: post.body ?? "",
    authorName: post.author_name,
    visuel: describeMedia(post.media_kind),
    intention,
  });

  const generationId = await safeRecord({
    result,
    intention,
    postId: post.id,
    commentId: null,
  });
  return { ...result, generationId };
}

export async function generateVariantsForComment(
  commentId: string,
  intention: Intention | null,
): Promise<VariantsOutcome> {
  const comment = await getComment(commentId);
  if (!comment) throw new Error("Commentaire introuvable.");
  const post = await getPost(comment.post_id);

  const result = await generateVariants({
    mode: "reponse",
    ownPostBody: post?.body ?? "",
    commenterName: comment.author_name,
    commentBody: comment.body ?? "",
    intention,
  });

  const generationId = await safeRecord({
    result,
    intention,
    postId: comment.post_id,
    commentId: comment.id,
  });
  return { ...result, generationId };
}

/**
 * Même arbitrage que pour le choix : une génération réussie ne doit pas être
 * jetée parce que son enregistrement a échoué. Sans identifiant, le choix ne
 * sera simplement pas mesuré.
 */
async function safeRecord(input: Parameters<typeof recordGeneration>[0]): Promise<string | null> {
  try {
    return await recordGeneration(input);
  } catch (error) {
    console.error("journal de génération :", error);
    return null;
  }
}
