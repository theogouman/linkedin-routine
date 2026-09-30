import { z } from "zod";
import { ALL_SLOTS } from "@/modules/ai/lib/comment-variants";
import { noteRawChoice } from "@/server/engagement-service";
import { authorizeExtension } from "../_auth";

/**
 * Ce qui a été retenu d'une génération faite depuis l'extension (§9).
 *
 * Sans cette route, l'extension serait un générateur aveugle : on saurait ce
 * qui a été proposé, jamais ce qui a servi. Or les quatre signaux du journal —
 * taux d'utilisation, utilisation SANS retouche, registres réellement choisis,
 * distance d'édition — sont la seule mesure de progrès du générateur, et c'est
 * aussi par eux que les textes retouchés rejoignent le corpus.
 *
 * L'échec n'est jamais fatal côté extension : une mesure perdue est regrettable,
 * un commentaire perdu le serait davantage. La route dit simplement ce qui
 * s'est passé.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  generationId: z.uuid(),
  slot: z.enum(ALL_SLOTS),
  /** Le texte réellement inséré, après retouche éventuelle. */
  publishedText: z.string().min(1).max(10_000),
  postUrl: z.url().max(2_000).nullish(),
});

export async function POST(request: Request): Promise<Response> {
  const denied = authorizeExtension(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "requête invalide" }, { status: 400 });
  }

  try {
    await noteRawChoice({
      generationId: parsed.data.generationId,
      slot: parsed.data.slot,
      publishedText: parsed.data.publishedText,
      lien: parsed.data.postUrl ?? null,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
