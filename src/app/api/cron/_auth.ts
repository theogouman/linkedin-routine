import { readEnv } from "@/shared/lib/env";

/**
 * Les routes d'ordonnanceur ne passent pas par le cookie de session — elles
 * sont appelées sans navigateur. Elles portent donc leur propre secret.
 *
 * Sans `CRON_SECRET` configuré, on REFUSE au lieu d'ouvrir : ces routes
 * déclenchent des envois sur le compte LinkedIn et des appels facturés.
 */
export function authorizeCron(request: Request): Response | null {
  const secret = readEnv("CRON_SECRET");
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET non configuré — routes d'ordonnanceur désactivées." },
      { status: 503 },
    );
  }
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return Response.json({ error: "non autorisé" }, { status: 401 });
  }
  return null;
}
