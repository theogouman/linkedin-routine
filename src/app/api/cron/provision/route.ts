import { seedCorpus, topUpEmbeddings } from "@/modules/ai/server/comment-corpus-seed";
import { authorizeCron } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Marge gardée sous `maxDuration` : le lot en cours doit pouvoir finir, et la
 * réponse partir.
 */
const EMBED_BUDGET_MS = 240_000;

/**
 * Installation du générateur de commentaires, sans intervention.
 *
 * L'app porte son corpus dans son dépôt ; cette route le met en base et
 * calcule les embeddings manquants. Elle est APPELÉE EN BOUCLE par
 * l'ordonnanceur Postgres, et devient un no-op dès que tout est en place —
 * deux lectures de comptage, rien de plus.
 *
 * Pourquoi une boucle plutôt qu'un passage unique : trois mille inférences
 * d'embedding ne tiennent pas forcément dans une invocation, et un passage
 * unique qui échoue à mi-chemin laisserait l'installation dans un état que
 * personne ne va constater. Ici, le passage suivant reprend où le précédent
 * s'est arrêté.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const startedAt = Date.now();
  try {
    const seed = await seedCorpus();
    const embed = await topUpEmbeddings({
      deadline: new Date(startedAt + EMBED_BUDGET_MS),
    });

    return Response.json({
      ok: true,
      // `done` est ce que l'ordonnanceur pourrait surveiller : plus rien à
      // faire, ni ligne à insérer, ni vecteur à calculer.
      done: seed.alreadyDone && embed.remaining === 0,
      corpus: {
        alreadyDone: seed.alreadyDone,
        inserted: seed.inserted,
        total: seed.total,
        rejected: seed.rejected,
      },
      embeddings: embed,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
