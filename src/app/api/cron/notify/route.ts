import { countUnprocessedPosts } from "@/modules/feed/server/repository";
import { countUnprocessedComments } from "@/modules/inbox/server/repository";
import { notifyPending } from "@/modules/notifications/server/push";
import { synchronize } from "@/server/sync-service";
import { authorizeCron } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vérification serveur à fréquence réduite (FR-014).
 *
 * Deux fois par jour par défaut. C'est la SEULE récupération qui ne soit pas
 * déclenchée par l'utilisateur, et sa rareté est le compromis explicite de
 * FR-003 : notifier sans transformer la récupération en synchronisation
 * permanente facturée au résultat.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const report = await synchronize("all");
    const [posts, comments] = await Promise.all([
      countUnprocessedPosts(),
      countUnprocessedComments(),
    ]);
    const push = await notifyPending({ posts, comments });

    return Response.json({
      ok: true,
      synced: {
        posts: report.postsInserted,
        comments: report.commentsInserted,
        accountsFailed: report.accountsFailed,
      },
      pending: { posts, comments },
      push,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
