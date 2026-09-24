/**
 * Réglages de génération — modèle et niveau d'effort.
 *
 * En base plutôt que dans l'environnement, pour la même raison que les
 * plafonds d'envoi : ce sont deux curseurs qu'on ajuste en lisant ce que le
 * modèle propose (« les commentaires sont plats », « la note grimpe »), et
 * redéployer pour changer un mot décourage de les régler.
 *
 * Le modèle est une chaîne libre, pas une liste fermée : Anthropic publie de
 * nouveaux identifiants régulièrement, et une liste codée en dur redonnerait
 * exactement la contrainte dont on cherche à se défaire. Les suggestions
 * ci-dessous ne font qu'alimenter l'autocomplétion.
 */

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

export type Effort = (typeof EFFORT_LEVELS)[number];

export interface AiSettings {
  model: string;
  effort: Effort;
}

/**
 * `low` suffit : rédiger cinquante mots selon un process fourni n'est pas une
 * tâche de raisonnement. C'est le réglage qui tient la cible de « quelques
 * euros par mois ». Monter à `medium` est le premier geste si les propositions
 * semblent plates, avant de changer de modèle.
 */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  model: "claude-opus-5",
  effort: "low",
};

/** Suggestions d'autocomplétion. Ni exhaustives, ni contraignantes. */
export const SUGGESTED_MODELS = [
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4-5",
] as const;

/** Repères de coût affichés à côté du champ, à effort égal. */
export const MODEL_HINTS: Record<string, string> = {
  "claude-opus-5": "le plus capable, le plus cher",
  "claude-sonnet-5": "~2,5 fois moins cher qu'Opus",
  "claude-haiku-4-5": "le moins cher, le plus rapide",
};

export function isEffort(value: unknown): value is Effort {
  return typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * Un identifiant de modèle plausible : non vide, sans espace, et de la famille
 * `claude-`. On ne vérifie pas qu'il existe — seule l'API le sait, et elle le
 * dira clairement à la première génération.
 */
export function isModelId(value: unknown): value is string {
  return typeof value === "string" && /^claude-[a-z0-9][a-z0-9.-]*$/.test(value);
}

/** Fusion champ par champ ; une valeur invalide retombe sur la base. */
export function mergeAiSettings(base: AiSettings, stored: unknown): AiSettings {
  if (stored === null || typeof stored !== "object") return { ...base };
  const patch = stored as Record<string, unknown>;
  return {
    model: isModelId(patch.model) ? patch.model : base.model,
    effort: isEffort(patch.effort) ? patch.effort : base.effort,
  };
}

/** Valide une saisie avant écriture. `null` si tout est bon. */
export function validateAiSettings(patch: unknown): string | null {
  if (patch === null || typeof patch !== "object") return "Réglages illisibles.";
  const input = patch as Record<string, unknown>;

  if (input.model !== undefined && !isModelId(input.model)) {
    return "Identifiant de modèle invalide — il commence par `claude-`, sans espace.";
  }
  if (input.effort !== undefined && !isEffort(input.effort)) {
    return `Effort inconnu — l'un de : ${EFFORT_LEVELS.join(", ")}.`;
  }
  return null;
}
