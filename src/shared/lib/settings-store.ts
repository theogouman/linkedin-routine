import "server-only";

import { db, unwrap } from "./db";

/**
 * Magasin clé/valeur des réglages (table `settings`).
 *
 * Partagé par tous les modules — la politique d'envoi, la fréquence des
 * notifications, les réglages de récupération. Il vit ici plutôt que dans le
 * dépôt d'un module donné pour qu'`ingestion` puisse lire ses propres réglages
 * sans avoir à importer `engagement` : les modules métier ne se connaissent pas
 * entre eux, seul le socle partagé leur est commun.
 */

export async function readSetting<T>(key: string): Promise<T | null> {
  const rows = unwrap(
    await db().from("settings").select("value").eq("key", key).limit(1),
    `lecture du réglage ${key}`,
  ) as Array<{ value: T }>;
  return rows[0]?.value ?? null;
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const { error } = await db()
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Écriture du réglage ${key} : ${error.message}`);
}
