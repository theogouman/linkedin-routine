import { z } from "zod";
import type { VariantsActionResult } from "@/app/actions";
import { INTENTIONS } from "@/modules/ai/lib/comment-variants";
import { toVarianteView } from "@/modules/ai/lib/variant-view";
import { generateVariantsForRawPost } from "@/server/engagement-service";
import { authorizeExtension } from "../_auth";

/**
 * Génération des quatre variantes à partir d'un post lu sur linkedin.com.
 *
 * C'est la même route que `/api/variants`, à une différence près : elle reçoit
 * le TEXTE du post au lieu de l'identifiant d'une ligne en base. Tout ce qui
 * fait la valeur du générateur — cerveau v2, corpus de commentaires réels,
 * sélection des cinq exemples, huit contrôles, journal — se trouve derrière
 * `generateVariantsForRawPost` et ne change pas d'un iota.
 *
 * Même protocole NDJSON que l'autre route, pour que l'extension et l'app
 * lisent le flux avec le même code.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 20 000 caractères : un post LinkedIn est plafonné à 3 000, la marge absorbe
 * un article partagé ou une extraction un peu large. Au-delà, c'est que le
 * sélecteur a attrapé la page entière — mieux vaut refuser que payer.
 */
const bodySchema = z.object({
  postBody: z.string().min(1).max(20_000),
  authorName: z.string().max(200).nullish(),
  /** `image`, `video`, `document`, `article` — tout le reste vaut « aucun ». */
  media: z.string().max(40).nullish(),
  intention: z.enum(INTENTIONS).nullish(),
});

export type ExtensionStreamEvent =
  | { type: "variante"; variante: ReturnType<typeof toVarianteView> }
  | { type: "retry" }
  | { type: "done"; result: VariantsActionResult }
  | { type: "error"; message: string };

export async function POST(request: Request): Promise<Response> {
  const denied = authorizeExtension(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "requête invalide" }, { status: 400 });
  }
  const { postBody, authorName, media, intention } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ExtensionStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        const result = await generateVariantsForRawPost(
          {
            postBody,
            authorName: authorName ?? null,
            media: media ?? "none",
          },
          intention ?? null,
          {
            onVariante: (variante) => send({ type: "variante", variante: toVarianteView(variante) }),
            onRetry: () => send({ type: "retry" }),
          },
        );
        send({
          type: "done",
          result: {
            ok: true,
            generationId: result.generationId,
            postExploitable: result.postExploitable,
            thematiqueManquant: result.thematiqueManquant,
            cacheWarning: result.cacheWarning,
            variantes: result.variantes.map(toVarianteView),
          },
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Génération impossible.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      // Sans ces deux en-têtes, un proxy peut tamponner la réponse entière et
      // rendre le flux inutile : tout arriverait d'un bloc, à la fin.
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
