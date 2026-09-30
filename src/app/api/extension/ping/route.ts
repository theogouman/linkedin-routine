import { commentSettings } from "@/modules/ai/server/comment-generation";
import { authorizeExtension } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vérification de branchement, appelée par la page de réglages de l'extension.
 *
 * Elle existe pour qu'une erreur de configuration se voie au moment où on la
 * fait, et pas trois jours plus tard devant un post. Elle rend le modèle
 * réellement utilisé : c'est la preuve que le jeton ouvre bien CETTE app, et
 * pas qu'un serveur a répondu 200.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = authorizeExtension(request);
  if (denied) return denied;

  try {
    const { model, effort } = await commentSettings();
    return Response.json({ ok: true, model, effort });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
