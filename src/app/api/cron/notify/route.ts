import { countUnprocessedPosts } from "@/modules/feed/server/repository";
import { countUnprocessedComments } from "@/modules/inbox/server/repository";
import { notifyPending } from "@/modules/notifications/server/push";
import { synchronize } from "@/server/sync-service";
import { authorizeCron } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Marge gardée sous `maxDuration` : le compte en cours doit pouvoir finir, et
 * la passe de commentaires plus la notification viennent après.
 */
const SYNC_BUDGET_MS = 220_000;

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
    // La vérification quotidienne dispose des 300 s de la route, pas des 45 s
    // d'une action d'écran. Avec le budget de l'interface, elle ne couvrait
    // qu'un tiers des comptes, chaque jour, indéfiniment : un compte en fin de
    // liste n'aurait jamais été interrogé que par un clic manuel.
    const report = await synchronize("all", {
      budgetMs: SYNC_BUDGET_MS,
      maxAccounts: Number.MAX_SAFE_INTEGER,
    });
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
