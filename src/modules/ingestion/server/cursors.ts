import "server-only";

import { db, unwrap } from "@/shared/lib/db";
import type { SyncCursorRow, SyncRunRow } from "@/shared/lib/rows";
import type { CursorState } from "../lib/cursor";

/** Persistance des curseurs et journal des actualisations (FR-003, FR-022). */

export async function readCursor(key: string): Promise<CursorState> {
  const rows = unwrap(
    await db().from("sync_cursors").select("*").eq("key", key).limit(1),
    "lecture du curseur",
  ) as SyncCursorRow[];
  const row = rows[0];
  return {
    lastSyncedAt: row?.last_synced_at ? new Date(row.last_synced_at) : null,
  };
}

export async function recordCursorSuccess(key: string, syncedAt: Date): Promise<void> {
  const { error } = await db().from("sync_cursors").upsert(
    {
      key,
      last_synced_at: syncedAt.toISOString(),
      last_attempt_at: syncedAt.toISOString(),
      last_error: null,
      consecutive_failures: 0,
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(`Écriture du curseur : ${error.message}`);
}

/**
 * Enregistre l'échec SANS toucher à `last_synced_at`.
 *
 * C'est l'invariant de FR-022 tenu au niveau du stockage : même si un appelant
 * se trompait, cette fonction ne peut pas faire avancer le curseur.
 */
export async function recordCursorFailure(key: string, reason: string): Promise<void> {
  const current = unwrap(
    await db().from("sync_cursors").select("*").eq("key", key).limit(1),
    "lecture du curseur avant échec",
  ) as SyncCursorRow[];
  const existing = current[0];

  const { error } = await db().from("sync_cursors").upsert(
    {
      key,
      last_synced_at: existing?.last_synced_at ?? null,
      last_attempt_at: new Date().toISOString(),
      last_error: reason.slice(0, 2000),
      consecutive_failures: (existing?.consecutive_failures ?? 0) + 1,
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(`Écriture de l'échec de curseur : ${error.message}`);
}

/**
 * Tous les curseurs, en une seule lecture paginée.
 *
 * Existe parce que l'ordonnancement d'une actualisation a besoin de connaître
 * l'ancienneté de chaque compte AVANT d'en interroger un seul. Les lire un par
 * un faisait un aller-retour par compte : à 373 comptes, ces lectures
 * dépassaient à elles seules le budget du passage, qui se terminait sans avoir
 * rien récupéré.
 *
 * La pagination n'est pas décorative : PostgREST plafonne une réponse à 1000
 * lignes et ne le dit pas. Sans elle, passé mille comptes, les derniers
 * seraient vus comme jamais synchronisés et rejoués à chaque fois.
 */
const CURSOR_PAGE = 1000;

export async function readAllCursors(): Promise<Map<string, CursorState>> {
  const cursors = new Map<string, CursorState>();
  for (let from = 0; ; from += CURSOR_PAGE) {
    const rows = unwrap(
      await db()
        .from("sync_cursors")
        .select("key, last_synced_at")
        .order("key")
        .range(from, from + CURSOR_PAGE - 1),
      "lecture groupée des curseurs",
    ) as Array<{ key: string; last_synced_at: string | null }>;
    for (const row of rows) {
      cursors.set(row.key, {
        lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
      });
    }
    if (rows.length < CURSOR_PAGE) return cursors;
  }
}

/**
 * Efface les curseurs de publications pour repartir d'une date de départ.
 *
 * Ne touche ni aux publications ni au curseur des commentaires reçus : les
 * posts déjà en base sont dédoublonnés par identifiant fournisseur, donc une
 * reprise ne crée pas de doublon et ne remet rien dans la file.
 */
export async function clearPostsCursors(): Promise<number> {
  const rows = unwrap(
    await db().from("sync_cursors").delete().like("key", "posts:%").select("key"),
    "purge des curseurs de publications",
  ) as Array<{ key: string }>;
  return rows.length;
}

export async function getCursors(): Promise<SyncCursorRow[]> {
  return unwrap(
    await db().from("sync_cursors").select("*").order("key"),
    "lecture des curseurs",
  ) as SyncCursorRow[];
}

export async function startSyncRun(scope: string): Promise<string> {
  const rows = unwrap(
    await db().from("sync_runs").insert({ scope }).select("id"),
    "ouverture du journal d'actualisation",
  ) as Array<{ id: string }>;
  const row = rows[0];
  if (!row) throw new Error("Journal d'actualisation : aucune ligne renvoyée.");
  return row.id;
}

export async function finishSyncRun(
  id: string,
  summary: {
    ok: boolean;
    accountsSynced: number;
    accountsFailed: number;
    postsInserted: number;
    commentsInserted: number;
    error: string | null;
    /** Comptes laissés pour le passage suivant. */
    remaining?: number;
  },
): Promise<void> {
  const { error } = await db()
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      ok: summary.ok,
      accounts_synced: summary.accountsSynced,
      accounts_failed: summary.accountsFailed,
      posts_inserted: summary.postsInserted,
      comments_inserted: summary.commentsInserted,
      error: summary.error?.slice(0, 2000) ?? null,
      accounts_remaining: summary.remaining ?? 0,
    })
    .eq("id", id);
  if (error) throw new Error(`Clôture du journal d'actualisation : ${error.message}`);
}

export async function getRecentSyncRuns(limit = 10): Promise<SyncRunRow[]> {
  return unwrap(
    await db()
      .from("sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit),
    "lecture des actualisations récentes",
  ) as SyncRunRow[];
}

/** Dernière actualisation terminée avec succès, pour l'affichage. */
export async function getLastSuccessfulSync(): Promise<SyncRunRow | null> {
  const rows = unwrap(
    await db()
      .from("sync_runs")
      .select("*")
      .eq("ok", true)
      .order("started_at", { ascending: false })
      .limit(1),
    "lecture de la dernière actualisation",
  ) as SyncRunRow[];
  return rows[0] ?? null;
}
