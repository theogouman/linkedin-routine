import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

/**
 * Client Supabase côté serveur, avec la service role key.
 *
 * Jamais exposé au navigateur : l'app est mono-utilisateur et tout l'accès
 * données passe par des Server Actions et des Route Handlers derrière le
 * cookie de session (FR-015).
 *
 * La base porte malgré tout la RLS, activée sans aucune politique (migration
 * 003) : elle ferme l'API PostgREST à anon et authenticated, que l'app
 * n'utilise pas, pendant que service_role la contourne. Sans elle, la seule
 * chose qui protégerait les tables serait que la clé anon ne soit publiée
 * nulle part — ce qui n'est pas une frontière.
 *
 * L'import `server-only` transforme toute fuite accidentelle vers un composant
 * client en erreur de build plutôt qu'en clé de service dans un bundle.
 */

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  client = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-application-name": "linkedin-routine" } },
    },
  );
  return client;
}

/** Lève avec un message lisible plutôt que de propager un objet d'erreur nu. */
export function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  context: string,
): T {
  if (result.error) {
    throw new Error(`${context} : ${result.error.message}`);
  }
  if (result.data === null) {
    throw new Error(`${context} : aucune donnée renvoyée.`);
  }
  return result.data;
}
