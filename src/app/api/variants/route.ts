import { z } from "zod";
import type { VariantsActionResult } from "@/app/actions";
import { toVarianteView } from "@/modules/ai/lib/variant-view";
import {
  generateVariantsForComment,
  generateVariantsForPost,
} from "@/server/engagement-service";

/**
 * Génération des quatre variantes, en flux.
 *
 * Une Server Action rend tout ou rien : Théo regardait un bouton « Rédaction… »
 * pendant six secondes alors que la première proposition était écrite au bout
 * de deux. Cette route pousse chaque variante dès que le modèle la referme.
 *
 * Protocole : une ligne JSON par évènement (NDJSON).
 *  - `{ type: "variante", variante }` : une proposition prête, contrôles passés ;
 *  - `{ type: "retry" }` : le premier essai est rejeté, effacer ce qui a été montré ;
 *  - `{ type: "done", result }` : le résultat final, trié et journalisé ;
 *  - `{ type: "error", message }`.
 *
 * Protégée par la session comme toute route hors `/api/cron/` (middleware).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  target: z.enum(["post", "comment"]),
  id: z.string().min(1),
});

export type VariantsStreamEvent =
  | { type: "variante"; variante: ReturnType<typeof toVarianteView> }
  | { type: "retry" }
  | { type: "done"; result: VariantsActionResult }
  | { type: "error"; message: string };

export async function POST(request: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "requête invalide" }, { status: 400 });
  }
  const { target, id } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: VariantsStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      const hooks = {
        onVariante: (variante: Parameters<typeof toVarianteView>[0]) =>
          send({ type: "variante", variante: toVarianteView(variante) }),
        onRetry: () => send({ type: "retry" }),
      };

      try {
        const result =
          target === "post"
            ? await generateVariantsForPost(id, null, hooks)
            : await generateVariantsForComment(id, null, hooks);
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
