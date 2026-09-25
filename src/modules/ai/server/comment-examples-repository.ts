import "server-only";

import { db, unwrap } from "@/shared/lib/db";
import { readEnv, requireEnv } from "@/shared/lib/env";
import {
  categoriesForSlot,
  maxWordsForSlot,
  type ExampleRow,
} from "../lib/comment-examples";
import type { Intention, Slot } from "../lib/comment-variants";

/**
 * Accès au corpus d'exemples.
 *
 * La base fournit les VIVIERS, le module pur choisit qui sort. Cette séparation
 * n'est pas cosmétique : l'algorithme de sélection est la partie qu'on voudra
 * corriger après avoir lu trente générations, et il doit pouvoir l'être sans
 * Postgres sous la main.
 */

/** Priorité au corpus récent (§5). 2023 n'est rouvert qu'en cas de disette. */
const RECENT_FLOOR = "2024-01-01T00:00:00Z";

/**
 * Taille du vivier remonté par emplacement.
 *
 * Borné, et par les plus récents : la pondération par récence donne de toute
 * façon un poids de 1/8 à un commentaire de trois ans. Remonter huit cents
 * lignes pour que les plus vieilles ne sortent jamais serait payer un transfert
 * pour rien.
 */
const POOL_SIZE = 150;

/** En deçà, on rouvre 2023 plutôt que de laisser l'emplacement à sec. */
const MIN_POOL = 8;

const COLUMNS = "id, texte, categorie, mots, date";

async function fetchPool(
  categories: readonly string[],
  surMonPost: boolean,
  maxWords: number | null,
  floor: string | null,
): Promise<ExampleRow[]> {
  let query = db()
    .from("comment_examples")
    .select(COLUMNS)
    .eq("sur_mon_post", surMonPost)
    .in("categorie", [...categories])
    .order("date", { ascending: false })
    .limit(POOL_SIZE);

  if (maxWords !== null) query = query.lte("mots", maxWords);
  if (floor !== null) query = query.gte("date", floor);

  return unwrap(await query, "lecture du corpus d'exemples") as ExampleRow[];
}

/**
 * Vivier d'un emplacement, avec élargissement à 2023 si besoin.
 *
 * La disette est réelle sur les emplacements étroits : `reaction_courte` exige
 * six mots au plus, et `avis_nuance` seul — le cas du désaccord — ne compte
 * qu'une centaine de lignes sur tout le corpus.
 */
export async function poolForSlot(
  slot: Slot,
  intention: Intention | null,
  surMonPost: boolean,
): Promise<ExampleRow[]> {
  const categories = categoriesForSlot(slot, intention);
  const maxWords = maxWordsForSlot(slot);
  const recent = await fetchPool(categories, surMonPost, maxWords, RECENT_FLOOR);
  if (recent.length >= MIN_POOL) return recent;
  return fetchPool(categories, surMonPost, maxWords, null);
}

export async function poolsForSlots(
  slots: readonly Slot[],
  intention: Intention | null,
  surMonPost: boolean,
): Promise<Record<string, ExampleRow[]>> {
  const pools = await Promise.all(
    slots.map(async (slot) => [slot, await poolForSlot(slot, intention, surMonPost)] as const),
  );
  return Object.fromEntries(pools);
}

// ── Exemple thématique ─────────────────────────────────────────────────────
/** Parmi les vingt plus proches, un est tiré au hasard (§5). */
const NEAREST = 20;

/**
 * Embedding d'un texte, calculé par la fonction Edge `embed`.
 *
 * Rend `null` plutôt que de lever quand elle n'est pas déployée ou qu'elle
 * échoue. C'est délibéré : l'exemple thématique est le cinquième sur cinq, et
 * une génération sans lui reste bonne. Faire échouer toute la génération parce
 * qu'un service annexe est absent serait disproportionné — et empêcherait
 * d'utiliser le générateur avant d'avoir calculé trois mille embeddings.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  const base = readEnv("SUPABASE_URL");
  if (!base) return null;

  try {
    const response = await fetch(`${base.replace(/\/+$/, "")}/functions/v1/embed`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ input: trimmed.slice(0, 4000) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as { embeddings?: unknown };
    const first = Array.isArray(parsed.embeddings) ? parsed.embeddings[0] : null;
    return Array.isArray(first) && first.every((value) => typeof value === "number")
      ? (first as number[])
      : null;
  } catch {
    return null;
  }
}

/**
 * Les vingt exemples les plus proches du texte donné.
 *
 * Vide quand les embeddings ne sont pas calculés : la sélection sait faire
 * sans, et le journal enregistre l'absence pour qu'elle se voie.
 */
export async function nearestExamples(
  text: string,
  surMonPost: boolean,
  excludeCategories: readonly string[] = [],
): Promise<ExampleRow[]> {
  const embedding = await embedText(text);
  if (embedding === null) return [];

  const { data, error } = await db().rpc("match_comment_examples", {
    query_embedding: JSON.stringify(embedding),
    want_sur_mon_post: surMonPost,
    match_count: NEAREST,
    since_date: RECENT_FLOOR,
    exclude_categories: [...excludeCategories],
  });
  // Même logique que l'embedding : une similarité indisponible dégrade la
  // sélection, elle ne casse pas la génération.
  if (error) return [];
  return (data ?? []) as ExampleRow[];
}

// ── Réinjection (§9) ───────────────────────────────────────────────────────
/**
 * Ajoute au corpus un commentaire publié APRÈS retouche.
 *
 * La condition n'est pas un détail d'implémentation, c'est ce qui empêche le
 * système de tourner en rond : un texte publié sans modification est une sortie
 * du modèle, pas un exemple de Théo. Le réinjecter reviendrait à apprendre de
 * soi-même, et la voix dériverait vers sa propre imitation.
 */
export async function addPublishedExample(input: {
  texte: string;
  categorie: string;
  surMonPost: boolean;
  lien: string | null;
}): Promise<void> {
  const texte = input.texte.trim();
  if (texte === "") return;
  const { error } = await db()
    .from("comment_examples")
    .upsert(
      {
        date: new Date().toISOString(),
        lien: input.lien,
        sur_mon_post: input.surMonPost,
        categorie: input.categorie,
        mots: texte.split(/\s+/).filter(Boolean).length,
        texte,
        source: "publie",
      },
      { onConflict: "date,texte", ignoreDuplicates: true },
    );
  if (error) throw new Error(`Réinjection au corpus : ${error.message}`);
}

/** Pour l'écran de réglages : où en est le corpus. */
export async function corpusStatus(): Promise<{ total: number; embedded: number }> {
  const [total, embedded] = await Promise.all([
    db().from("comment_examples").select("id", { count: "exact", head: true }),
    db()
      .from("comment_examples")
      .select("id", { count: "exact", head: true })
      .not("embedding", "is", null),
  ]);
  return { total: total.count ?? 0, embedded: embedded.count ?? 0 };
}
