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
import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  normalizeGenerationSettings,
  supportsEffort,
  type GenerationSettings,
} from "../lib/model";
import { readSetting, writeSetting } from "@/shared/lib/settings";

/** Clé du réglage de génération dans la table `settings`. */
export const GENERATION_SETTING_KEY = "generation_model";

/**
 * Réglage effectif : la base d'abord, l'environnement ensuite, le défaut en
 * dernier.
 *
 * L'ordre n'est pas arbitraire. Le modèle était choisi uniquement par
 * `ANTHROPIC_MODEL`, donc changeable seulement par un redéploiement — alors
 * que c'est exactement le genre de réglage qu'on veut pouvoir bouger depuis le
 * téléphone après avoir lu trois propositions fades. La variable reste
 * prioritaire sur le défaut, pour ne pas casser un déploiement qui s'y fie.
 */
export async function loadGenerationSettings(): Promise<GenerationSettings> {
  const stored = await readSetting<unknown>(GENERATION_SETTING_KEY);
  if (stored !== null) return normalizeGenerationSettings(stored);
  return normalizeGenerationSettings({
    model: readEnv("ANTHROPIC_MODEL") ?? DEFAULT_MODEL,
    effort: readEnv("ANTHROPIC_EFFORT") ?? DEFAULT_EFFORT,
  });
}

export async function saveGenerationSettings(
  settings: GenerationSettings,
): Promise<GenerationSettings> {
  const normalized = normalizeGenerationSettings(settings);
  await writeSetting(GENERATION_SETTING_KEY, normalized);
  return normalized;
}

/**
 * Génération assistée (FR-006, FR-019).
 *
 * Clé d'API dédiée, jamais le jeton d'abonnement Claude : son emploi hors des
 * applications officielles viole les conditions d'utilisation d'Anthropic et
 * exposerait le compte Claude de l'utilisateur. Le code ne lit donc QUE
 * `ANTHROPIC_API_KEY`.
 *
 * Le choix du modèle et la transmission de `output_config` vivent dans
 * `../lib/model` : ce sont des décisions testables sans client HTTP.
 */

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
  const { model, effort } = await loadGenerationSettings();

  try {
    const response = await anthropic().messages.create({
      model,
      max_tokens: MAX_TOKENS,
      ...(supportsEffort(model) ? { output_config: { effort } } : {}),
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
