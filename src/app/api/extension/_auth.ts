import { verifyBearer } from "@/modules/auth/lib/bearer";
import { readEnv } from "@/shared/lib/env";

/**
 * Porte des routes de l'extension Chrome.
 *
 * Même principe que `/api/cron/*` : appelées sans navigateur, donc sans cookie
 * de session, donc porteuses de leur propre secret. Sans `EXTENSION_TOKEN`
 * configuré on refuse plutôt que d'ouvrir — ces routes déclenchent des appels
 * facturés chez Anthropic.
 *
 * Aucun en-tête CORS n'est rendu, et c'est délibéré : la requête part du
 * service worker de l'extension, qui a la permission d'hôte et n'est donc pas
 * soumis à CORS. Ouvrir la route à l'origine `linkedin.com` la rendrait
 * joignable par n'importe quel script de la page.
 */
export function authorizeExtension(request: Request): Response | null {
  switch (verifyBearer(request.headers.get("authorization"), readEnv("EXTENSION_TOKEN"))) {
    case "non_configure":
      return Response.json(
        { error: "EXTENSION_TOKEN non configuré — routes d'extension désactivées." },
        { status: 503 },
      );
    case "refuse":
      return Response.json({ error: "non autorisé" }, { status: 401 });
    default:
      return null;
  }
}
