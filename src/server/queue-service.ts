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

/**
 * Intervalle minimal entre deux purges opportunistes sur une même instance.
 *
 * Sans lui, chaque navigation déclencherait une requête de plus ; avec lui,
 * une session d'engagement de dix minutes en déclenche une dizaine au maximum.
 */
const OPPORTUNISTIC_INTERVAL_MS = 60_000;
let lastOpportunisticRun = 0;

/**
 * Purge déclenchée par l'activité de l'utilisateur, en plus de l'ordonnanceur.
 *
 * Deux raisons d'exister :
 *
 *  1. **Le plan Hobby de Vercel n'autorise qu'un cron par jour.** L'ordonnanceur
 *     fin vit donc ailleurs (pg_cron côté Supabase, cf. migration 002). Cette
 *     purge-ci est le filet : même sans aucun ordonnanceur configuré, ouvrir
 *     l'app fait partir ce qui est dû.
 *  2. Elle rend l'app cohérente avec ce que l'utilisateur voit. Il ouvre le
 *     fil, la file se vide en arrière-plan, les compteurs sont justes.
 *
 * Elle ne peut pas accélérer les envois : la politique (plafonds, délai
 * aléatoire, fenêtre diurne) est réappliquée à chaque passage. Visiter la file
 * plus souvent ne fait jamais partir plus d'actions — c'est ce qui rend ce
 * déclenchement opportuniste sûr par construction.
 *
 * Silencieuse par conception : une panne du fournisseur d'écriture ne doit pas
 * transformer l'affichage du fil en écran d'erreur. L'échec est déjà enregistré
 * en base et visible dans la file.
 */
export async function drainOpportunistically(): Promise<void> {
  const now = Date.now();
  if (now - lastOpportunisticRun < OPPORTUNISTIC_INTERVAL_MS) return;
  lastOpportunisticRun = now;

  try {
    await drainQueue(ports, { limit: 1 });
  } catch {
    // Volontairement avalé — cf. commentaire ci-dessus.
  }
}

export { ports as queuePorts };
