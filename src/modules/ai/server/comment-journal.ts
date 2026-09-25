import "server-only";

import { db, unwrap } from "@/shared/lib/db";
import { normalizedEditDistance } from "../lib/edit-distance";
import { SLOT_TO_CATEGORY, type GenerationMode, type Slot } from "../lib/comment-variants";
import type { CommentGenerationResult } from "./comment-generation";
import { addPublishedExample } from "./comment-examples-repository";

/**
 * Journal de feedback (§9 du brief).
 *
 * Sans lui, il n'existe aucun moyen de savoir si le générateur s'améliore.
 * Les quatre signaux qui comptent — taux de publication, taux de publication
 * SANS retouche, emplacements réellement choisis, distance d'édition — ne se
 * lisent nulle part ailleurs : ni dans la file, ni dans le fil, ni dans les
 * factures Anthropic.
 *
 * Une génération dont rien n'est retenu est enregistrée comme les autres, avec
 * `slot_choisi` à null. C'est la ligne la plus instructive du lot : elle dit
 * que les quatre registres sont passés à côté.
 */

export interface RecordGenerationInput {
  result: CommentGenerationResult;
  intention: string | null;
  postId: string | null;
  commentId: string | null;
}

export async function recordGeneration(input: RecordGenerationInput): Promise<string | null> {
  const { result } = input;
  const rows = unwrap(
    await db()
      .from("comment_generations")
      .insert({
        mode: result.mode,
        post_id: input.postId,
        comment_id: input.commentId,
        intention: input.intention,
        exemples_ids: result.exemplesIds,
        cerveau_version: result.brainVersion,
        model: result.model,
        sortie_brute: result.raw as never,
        post_exploitable: result.postExploitable,
        variantes: result.variantes.map((variante) => ({
          slot: variante.slot,
          texte: variante.texte,
          extrait_post: variante.extrait_post,
          fait_utilise: variante.fait_utilise,
          position_utilisee: variante.position_utilisee,
          coquille: variante.coquille,
          badges: variante.badges.map((badge) => badge.kind),
        })) as never,
        usage: {
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          cache_read_input_tokens: result.usage.cacheReadTokens,
          cache_creation_input_tokens: result.usage.cacheCreationTokens,
          cache_warning: result.cacheWarning,
          thematique_manquant: result.thematiqueManquant,
          typo_overuse: result.typoOveruse,
        } as never,
        latence_ms: result.latencyMs,
      })
      .select("id"),
    "écriture du journal de génération",
  ) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export interface RecordChoiceInput {
  generationId: string;
  slot: Slot;
  /** Texte réellement mis en file, après retouche éventuelle. */
  publishedText: string;
  mode: GenerationMode;
  /** URL du post commenté, conservée si le texte rejoint le corpus. */
  lien: string | null;
}

/**
 * Enregistre ce qui a été retenu, et réinjecte au corpus si nécessaire.
 *
 * La réinjection est conditionnée à une distance d'édition strictement
 * positive, et ce n'est pas une optimisation : un texte publié sans
 * modification est une sortie du MODÈLE, pas un exemple de Théo. L'ajouter au
 * corpus ferait apprendre le système de lui-même, et sa voix dériverait vers
 * sa propre imitation — exactement ce que le projet existe pour éviter.
 */
export async function recordChoice(input: RecordChoiceInput): Promise<void> {
  const rows = unwrap(
    await db()
      .from("comment_generations")
      .select("variantes")
      .eq("id", input.generationId)
      .limit(1),
    "lecture de la génération choisie",
  ) as Array<{ variantes: Array<{ slot: string; texte: string }> }>;

  const proposed = rows[0]?.variantes?.find((variante) => variante.slot === input.slot)?.texte;
  const distance =
    proposed === undefined ? null : normalizedEditDistance(proposed, input.publishedText);

  const { error } = await db()
    .from("comment_generations")
    .update({
      slot_choisi: input.slot,
      texte_publie: input.publishedText,
      distance_edition: distance,
    })
    .eq("id", input.generationId);
  if (error) throw new Error(`Journal de génération : ${error.message}`);

  if (distance !== null && distance > 0) {
    await addPublishedExample({
      texte: input.publishedText,
      categorie: SLOT_TO_CATEGORY[input.slot],
      surMonPost: input.mode === "reponse",
      lien: input.lien,
    });
  }
}

export interface GenerationStats {
  total: number;
  /** Générations dont une variante a été publiée. */
  publiees: number;
  /** Publiées sans aucune retouche. */
  sansRetouche: number;
  /** Distance d'édition moyenne sur les publiées retouchées. */
  distanceMoyenne: number | null;
  /** Nombre de fois où chaque emplacement a été retenu. */
  parSlot: Record<string, number>;
  /** Nombre de fois où chaque badge a été levé. */
  parBadge: Record<string, number>;
  /** Générations où la lecture de cache était nulle hors premier appel. */
  cacheRate: number | null;
}

/**
 * Indicateurs de suivi, calculés sur les N dernières générations.
 *
 * Bornés à une fenêtre plutôt que calculés sur tout l'historique : ce qu'on
 * veut savoir, c'est si le générateur marche MAINTENANT, avec le cerveau
 * courant. Une moyenne sur six mois noierait l'effet d'une mise à jour.
 */
export async function generationStats(limit = 200): Promise<GenerationStats> {
  const rows = unwrap(
    await db()
      .from("comment_generations")
      .select("slot_choisi, distance_edition, variantes, usage")
      .order("created_at", { ascending: false })
      .limit(limit),
    "lecture des indicateurs de génération",
  ) as Array<{
    slot_choisi: string | null;
    distance_edition: number | null;
    variantes: Array<{ badges?: string[] }> | null;
    usage: { cache_read_input_tokens?: number } | null;
  }>;

  const parSlot: Record<string, number> = {};
  const parBadge: Record<string, number> = {};
  let publiees = 0;
  let sansRetouche = 0;
  let distanceSum = 0;
  let distanceCount = 0;
  let cacheHits = 0;

  for (const row of rows) {
    if (row.slot_choisi !== null) {
      publiees += 1;
      parSlot[row.slot_choisi] = (parSlot[row.slot_choisi] ?? 0) + 1;
      if (row.distance_edition === 0) sansRetouche += 1;
      else if (row.distance_edition !== null) {
        distanceSum += row.distance_edition;
        distanceCount += 1;
      }
    }
    for (const variante of row.variantes ?? []) {
      for (const badge of variante.badges ?? []) {
        parBadge[badge] = (parBadge[badge] ?? 0) + 1;
      }
    }
    if ((row.usage?.cache_read_input_tokens ?? 0) > 0) cacheHits += 1;
  }

  return {
    total: rows.length,
    publiees,
    sansRetouche,
    distanceMoyenne: distanceCount === 0 ? null : distanceSum / distanceCount,
    parSlot,
    parBadge,
    cacheRate: rows.length === 0 ? null : cacheHits / rows.length,
  };
}
