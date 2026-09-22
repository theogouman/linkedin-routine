import "server-only";

import type { WriteActionRow } from "@/shared/lib/rows";
import {
  getPost,
  markPostProcessed,
  setPostLiked,
} from "@/modules/feed/server/repository";
import {
  getComment,
  markCommentProcessed,
  setCommentLiked,
} from "@/modules/inbox/server/repository";
import { drainQueue, type DrainReport, type QueuePorts } from "@/modules/engagement/server/queue";
import { notifyQueueSuspended } from "@/modules/notifications/server/push";

/**
 * Branchement de la file d'écriture sur le reste de l'app.
 *
 * La file sait envoyer et respecter la cadence ; elle ne sait pas ce qu'est
 * une publication ni un commentaire. Ces ports font le lien, et c'est ici que
 * se joue l'invariant FR-010 : un envoi réussi marque sa cible traitée.
 */

const ports: QueuePorts = {
  resolveTarget: async (action) => {
    if (action.target_type === "comment" && action.target_comment_id) {
      const comment = await getComment(action.target_comment_id);
      if (!comment) return null;
      const post = await getPost(comment.post_id);
      if (!post) return null;
      return {
        providerPostId: post.provider_post_id,
        providerCommentId: comment.provider_comment_id,
      };
    }
    if (!action.target_post_id) return null;
    const post = await getPost(action.target_post_id);
    if (!post) return null;
    return { providerPostId: post.provider_post_id, providerCommentId: null };
  },

  onSent: async (action: WriteActionRow) => {
    const sentAt = new Date();

    if (action.kind === "like") {
      if (action.target_type === "comment" && action.target_comment_id) {
        await setCommentLiked(action.target_comment_id, sentAt);
      } else if (action.target_post_id) {
        await setPostLiked(action.target_post_id, sentAt);
      }
      // Un like ne vide pas la file : l'utilisateur peut vouloir commenter
      // ensuite. Seul un commentaire, une réponse ou un « ignorer » explicite
      // fait passer l'élément en traité.
      return;
    }

    if (action.kind === "reply" && action.target_comment_id) {
      await markCommentProcessed(action.target_comment_id, "replied");
      return;
    }
    if (action.target_post_id) {
      await markPostProcessed(action.target_post_id, "commented");
    }
  },

  onSuspended: async (reason) => {
    await notifyQueueSuspended(reason);
  },
};

export async function drain(options: { limit?: number } = {}): Promise<DrainReport> {
  return drainQueue(ports, options);
}

export { ports as queuePorts };
