import { drain } from "@/server/queue-service";
import { authorizeCron } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Purge de la file d'écriture (FR-017).
 *
 * Appelée souvent et ne fait presque rien à chaque fois : la cadence impose un
 * délai de plusieurs minutes entre deux envois, donc un passage typique envoie
 * zéro ou une action. C'est voulu — le rythme vient de la politique, pas de la
 * fréquence de l'ordonnanceur.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const report = await drain({ limit: 2 });
    return Response.json({ ok: true, ...report });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
