import "server-only";

import { db, unwrap } from "./db";

/**
 * Table clé/valeur des réglages.
 *
 * Remontée dans `@/shared` parce que deux modules en ont besoin — la file
 * d'écriture pour ses plafonds, la génération pour son modèle — et qu'un
 * module ne doit pas en importer un autre. Ce n'est pas de la logique métier :
 * c'est un accès table, au même titre que le client Supabase lui-même.
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
