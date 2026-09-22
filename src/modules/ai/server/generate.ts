import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { readEnv, requireEnv } from "@/shared/lib/env";
import {
  buildSystemPrompt,
  buildUserPrompt,
  cleanGeneratedComment,
  type GenerationContext,
} from "../lib/prompt";
import { isPlaceholder, PROCESS_FILES, type ProcessKind } from "../lib/process-files";

/**
 * Génération assistée (FR-006, FR-019).
 *
 * Clé d'API dédiée, jamais le jeton d'abonnement Claude : son emploi hors des
 * applications officielles viole les conditions d'utilisation d'Anthropic et
 * exposerait le compte Claude de l'utilisateur. Le code ne lit donc QUE
 * `ANTHROPIC_API_KEY`.
 *
 * `effort: "low"` par défaut : rédiger un commentaire de cinquante mots selon
 * un process fourni n'est pas une tâche de raisonnement. C'est le réglage qui
 * tient la cible de « quelques euros par mois » sans rien perdre en qualité ;
 * il reste surchargeable.
 */

const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_EFFORT = "low";
const MAX_TOKENS = 4000;

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  }
  return client;
}

/**
 * Les process sont relus à chaque génération plutôt que mis en cache : le
 * gain d'un cache serait d'une lecture de fichier, le coût serait de devoir
 * redéployer pour qu'une modification du process prenne effet.
 */
export async function readProcess(kind: ProcessKind): Promise<string> {
  const filename = PROCESS_FILES[kind];
  const directory = readEnv("PROCESS_DIR") ?? path.join(process.cwd(), "process");
  try {
    return await readFile(path.join(directory, filename), "utf8");
  } catch {
    return "";
  }
}

export interface GenerationResult {
  text: string;
  model: string;
  /** true quand le process correspondant n'a pas encore été rédigé. */
  usedPlaceholderProcess: boolean;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export class GenerationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "GenerationError";
  }
}

export async function generateComment(
  context: GenerationContext,
): Promise<GenerationResult> {
  const processMarkdown = await readProcess(context.kind);
  const model = readEnv("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
  const effort = (readEnv("ANTHROPIC_EFFORT") ?? DEFAULT_EFFORT) as
    | "low" | "medium" | "high" | "xhigh" | "max";

  try {
    const response = await anthropic().messages.create({
      model,
      max_tokens: MAX_TOKENS,
      output_config: { effort },
      system: buildSystemPrompt(processMarkdown),
      messages: [{ role: "user", content: buildUserPrompt(context) }],
    });

    if (response.stop_reason === "refusal") {
      throw new GenerationError(
        "Le modèle a refusé de rédiger ce commentaire. Rédige-le à la main.",
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (text === "") {
      throw new GenerationError("Le modèle n'a rien renvoyé d'exploitable.");
    }

    return {
      text: cleanGeneratedComment(text),
      model: response.model,
      usedPlaceholderProcess: isPlaceholder(processMarkdown),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new GenerationError("Clé ANTHROPIC_API_KEY invalide ou absente.", error);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new GenerationError("Limite de débit Anthropic atteinte — réessaie dans un instant.", error);
    }
    if (error instanceof Anthropic.APIError) {
      throw new GenerationError(`Erreur API Anthropic (${error.status}).`, error);
    }
    throw new GenerationError(
      error instanceof Error ? error.message : "Échec de génération inconnu.",
      error,
    );
  }
}

/** État des deux process, pour l'écran de réglages. */
export async function getProcessStatus(): Promise<
  Array<{ kind: ProcessKind; file: string; placeholder: boolean; excerpt: string }>
> {
  const kinds: ProcessKind[] = ["comment_on_post", "reply_to_comment"];
  return Promise.all(
    kinds.map(async (kind) => {
      const markdown = await readProcess(kind);
      return {
        kind,
        file: `process/${PROCESS_FILES[kind]}`,
        placeholder: isPlaceholder(markdown),
        excerpt: markdown.slice(0, 400),
      };
    }),
  );
}
