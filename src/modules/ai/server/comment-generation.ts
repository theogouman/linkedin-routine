import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readEnv, readBoolEnv, requireEnv } from "@/shared/lib/env";
import {
  COMMENT_MAX_TOKENS,
  DEFAULT_COMMENT_MODEL,
  supportsEffort,
  thinkingFor,
} from "../lib/model";
import {
  checkVariante,
  orderForDisplay,
  type CheckedVariante,
} from "../lib/comment-checks";
import { selectExamples, type SelectedExample } from "../lib/comment-examples";
import {
  buildCommentPrompt,
  buildReplyPrompt,
  type Relation,
} from "../lib/comment-prompt";
import {
  countTypos,
  describeIncompleteness,
  generationSchema,
  slotsFor,
  type GenerationMode,
  type GenerationPayload,
  type Intention,
} from "../lib/comment-variants";
import { loadBrain } from "./comment-brain";
import { nearestExamples, poolsForSlots } from "./comment-examples-repository";

/**
 * Le générateur de commentaires (§4 du brief).
 *
 * UN SEUL appel d'API par génération, qui rend les quatre variantes. Pas de
 * rédaction en deux temps, pas d'appel de relecture. Cette contrainte tient
 * tout le reste : elle est ce qui rend le coût prévisible, et elle est la
 * raison pour laquelle les contrôles de qualité sont des expressions
 * régulières plutôt qu'un second passage du modèle.
 *
 * Une variante qui échoue à un contrôle n'est donc PAS régénérée. Elle est
 * affichée avec son motif, reléguée en bas de pile, et Théo tranche.
 */

export class CommentGenerationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "CommentGenerationError";
  }
}

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    // La clé d'API dédiée, jamais le jeton d'abonnement Claude : son emploi
    // hors des applications officielles viole les conditions d'utilisation
    // d'Anthropic et exposerait le compte de l'utilisateur (FR-019).
    client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  }
  return client;
}

export function commentModel(): string {
  return readEnv("COMMENT_MODEL") ?? DEFAULT_COMMENT_MODEL;
}

/**
 * Durée de vie du cache.
 *
 * Cinq minutes par défaut, et l'horloge repart à chaque lecture : une session
 * d'engagement, où les générations s'enchaînent, tient entièrement dedans. La
 * fenêtre d'une heure coûte deux fois le prix d'entrée à l'écriture au lieu de
 * 1,25 — elle ne vaut le coup que si les appels sont espacés de plus de cinq
 * minutes, ce que seul l'usage réel dira.
 */
function cacheControl(): { type: "ephemeral"; ttl?: "1h" } {
  return readBoolEnv("COMMENT_CACHE_1H", false)
    ? { type: "ephemeral", ttl: "1h" }
    : { type: "ephemeral" };
}

export type CommentRequest =
  | {
      mode: "commentaire";
      postBody: string;
      authorName: string | null;
      visuel: string | null;
      relation?: Relation;
      intention: Intention | null;
    }
  | {
      mode: "reponse";
      ownPostBody: string;
      commenterName: string | null;
      commentBody: string;
      intention: Intention | null;
    };

export interface CommentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface CommentGenerationResult {
  mode: GenerationMode;
  postExploitable: boolean;
  variantes: CheckedVariante[];
  /** Ids des exemples injectés, pour le journal. */
  exemplesIds: number[];
  /** true quand aucun embedding n'était disponible : le cinquième exemple manque. */
  thematiqueManquant: boolean;
  brainVersion: string;
  model: string;
  usage: CommentUsage;
  latencyMs: number;
  /** Sortie brute du modèle, conservée au journal. */
  raw: unknown;
  /**
   * Levé quand la lecture de cache est nulle alors que ce n'est pas le premier
   * appel du processus : quelque chose de variable s'est glissé dans le system.
   */
  cacheWarning: boolean;
  /** Plus d'une variante porte une coquille — on garde le texte, on note l'écart. */
  typoOveruse: boolean;
}

/** Compteur d'appels du processus, pour l'alerte de cache (§6). */
let callsThisProcess = 0;

function sourceTextFor(request: CommentRequest): string {
  return request.mode === "commentaire" ? request.postBody : request.commentBody;
}

async function buildUserMessage(
  request: CommentRequest,
): Promise<{ prompt: string; examples: SelectedExample[]; thematiqueManquant: boolean }> {
  const surMonPost = request.mode === "reponse";
  const slots = slotsFor(request.mode);

  // Les réponses de type lead magnet sont exclues du thématique, SAUF quand le
  // commentaire reçu est justement un mot-clé : c'est alors exactement le bon
  // registre de réponse.
  const excluded =
    request.mode === "reponse" &&
    request.commentBody.trim().split(/\s+/).filter(Boolean).length > 3
      ? ["reponse_lead_magnet"]
      : [];

  const [bySlot, thematique] = await Promise.all([
    poolsForSlots(slots, request.intention, surMonPost),
    nearestExamples(sourceTextFor(request), surMonPost, excluded),
  ]);

  const examples = selectExamples({
    mode: request.mode,
    slots,
    pools: { bySlot, thematique },
  });

  const prompt =
    request.mode === "commentaire"
      ? buildCommentPrompt({
          examples,
          authorName: request.authorName,
          relation: request.relation ?? "inconnu",
          postBody: request.postBody,
          visuel: request.visuel,
          intention: request.intention,
        })
      : buildReplyPrompt({
          examples,
          ownPostBody: request.ownPostBody,
          commenterName: request.commenterName,
          commentBody: request.commentBody,
        });

  return { prompt, examples, thematiqueManquant: thematique.length === 0 };
}

async function callModel(
  brainText: string,
  userMessage: string,
  model: string,
): Promise<{ payload: GenerationPayload | null; raw: unknown; usage: CommentUsage; stopReason: string | null }> {
  const response = await anthropic().messages.parse({
    model,
    max_tokens: COMMENT_MAX_TOKENS,
    // Le bloc mis en cache. Rien de variable ici : ni date, ni prénom, ni
    // compteur. Le moindre octet de différence et les six mille tokens du
    // cerveau repassent au plein tarif, en silence.
    system: [{ type: "text", text: brainText, cache_control: cacheControl() }],
    messages: [{ role: "user", content: userMessage }],
    ...thinkingFor(model),
    output_config: {
      ...(supportsEffort(model) ? { effort: "low" as const } : {}),
      format: zodOutputFormat(generationSchema),
    },
    // Pas de `temperature` : les modèles de la famille Claude 5 l'ont retirée
    // et la rejettent en 400. Le brief demandait de ne pas la mettre au
    // minimum — il n'y a plus de curseur à régler.
  });

  const usage: CommentUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  return {
    payload: response.parsed_output ?? null,
    raw: response.parsed_output ?? response.content,
    usage,
    stopReason: response.stop_reason ?? null,
  };
}

export async function generateVariants(
  request: CommentRequest,
): Promise<CommentGenerationResult> {
  const startedAt = Date.now();
  const brain = await loadBrain();
  const model = commentModel();
  const { prompt, examples, thematiqueManquant } = await buildUserMessage(request);

  let payload: GenerationPayload | null = null;
  let raw: unknown = null;
  let usage: CommentUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  let lastProblem = "sortie illisible";

  // Un seul nouvel essai (§7.1), de l'appel ENTIER. Régénérer une variante
  // seule demanderait un second appel avec le contexte complet : au prix d'un
  // appel, autant les quatre.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result;
    try {
      result = await callModel(brain.text, prompt, model);
    } catch (error) {
      throw translate(error);
    }
    callsThisProcess += 1;
    usage = result.usage;
    raw = result.raw;

    if (result.stopReason === "refusal") {
      throw new CommentGenerationError(
        "Le modèle a refusé de rédiger sur ce post. Écris le commentaire à la main.",
      );
    }

    const parsed = generationSchema.safeParse(result.payload);
    if (!parsed.success) {
      lastProblem = "sortie hors schéma";
      continue;
    }
    const incomplete = describeIncompleteness(parsed.data, request.mode);
    if (incomplete !== null) {
      lastProblem = incomplete;
      continue;
    }
    payload = parsed.data;
    break;
  }

  if (payload === null) {
    throw new CommentGenerationError(
      `Le modèle n'a pas rendu quatre variantes exploitables (${lastProblem}). Réessaie.`,
    );
  }

  const source = sourceTextFor(request);
  const checked = payload.variantes.map((variante) => checkVariante(variante, { source }));

  return {
    mode: request.mode,
    postExploitable: payload.post_exploitable,
    variantes: orderForDisplay(checked, slotsFor(request.mode)),
    exemplesIds: examples.map((example) => example.id),
    thematiqueManquant,
    brainVersion: brain.version,
    model,
    usage,
    latencyMs: Date.now() - startedAt,
    raw,
    cacheWarning: callsThisProcess > 1 && usage.cacheReadTokens === 0,
    typoOveruse: countTypos(payload) > 1,
  };
}

function translate(error: unknown): CommentGenerationError {
  if (error instanceof CommentGenerationError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new CommentGenerationError("Clé ANTHROPIC_API_KEY invalide ou absente.", error);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new CommentGenerationError(
      "Limite de débit Anthropic atteinte — réessaie dans un instant.",
      error,
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new CommentGenerationError(`Erreur API Anthropic (${error.status}).`, error);
  }
  return new CommentGenerationError(
    error instanceof Error ? error.message : "Échec de génération inconnu.",
    error,
  );
}
