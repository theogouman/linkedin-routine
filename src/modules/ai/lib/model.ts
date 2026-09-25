/**
 * Choix du modèle de génération, isolé du client Anthropic pour être testable.
 *
 * Deux décisions vivent ici, et une seule des deux se voit à l'œil :
 *
 *  1. **Le modèle par défaut est Haiku.** Rédiger un commentaire de cinquante
 *     mots en suivant un process fourni n'est pas une tâche de raisonnement,
 *     c'est de la mise en forme contrainte. Au volume cible, cela ramène le
 *     coût mensuel de quelques euros à quelques centimes.
 *
 *  2. **`output_config.effort` n'existe que sur la famille Claude 5.** Le
 *     transmettre à Haiku 4.5 fait rejeter la requête pour paramètre inconnu :
 *     la génération échouerait à chaque appel, et l'utilisateur lirait
 *     « Génération impossible » sans jamais soupçonner le changement de
 *     modèle. Le paramètre n'est donc envoyé que là où il a un sens.
 */

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_EFFORT = "low";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * Modèles proposés dans les réglages.
 *
 * Une liste fermée plutôt qu'un champ libre : une faute de frappe dans un
 * identifiant de modèle ne se voit qu'au moment de la génération, sous la
 * forme d'une erreur d'API opaque. `ANTHROPIC_MODEL` reste disponible pour
 * pointer un modèle absent de cette liste.
 */
export const MODEL_CHOICES = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    hint: "Le défaut. Quelques centimes par mois au volume cible.",
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    hint: "À essayer si les propositions restent plates une fois tes process rédigés.",
  },
  {
    id: "claude-opus-5",
    label: "Opus 5",
    hint: "Le plus cher, et le moins justifié pour cinquante mots contraints.",
  },
] as const;

export interface GenerationSettings {
  model: string;
  effort: Effort;
}

/** Filtre d'entrée : un réglage stocké ne doit pas pouvoir casser l'appel. */
export function normalizeGenerationSettings(value: unknown): GenerationSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const model =
    typeof raw.model === "string" && raw.model.trim() !== "" ? raw.model.trim() : DEFAULT_MODEL;
  const effort = EFFORTS.includes(raw.effort as Effort)
    ? (raw.effort as Effort)
    : (DEFAULT_EFFORT as Effort);
  return { model, effort };
}

const EFFORT_CAPABLE_MODEL = /^claude-(opus|sonnet|fable)-5/;

export function supportsEffort(model: string): boolean {
  return EFFORT_CAPABLE_MODEL.test(model);
}

// ── Génération de commentaires (brief §4) ──────────────────────────────────
/**
 * Modèle du générateur de commentaires, distinct de celui des process.
 *
 * Sonnet 5 par défaut : imiter une voix à partir de cinq exemples et produire
 * quatre registres franchement différents demande plus qu'une mise en forme
 * contrainte. Surchargeable par `COMMENT_MODEL` sans redéploiement de code.
 */
export const DEFAULT_COMMENT_MODEL = "claude-sonnet-5";

/** Quatre commentaires courts ne tiennent pas dans moins, ni n'ont besoin de plus. */
export const COMMENT_MAX_TOKENS = 800;

/**
 * Réflexion minimisée, pas juste abaissée.
 *
 * Sur Sonnet 5, OMETTRE `thinking` ne coupe pas la réflexion : le modèle part
 * en adaptatif, et paie des tokens de raisonnement pour écrire quatre phrases
 * de quinze mots. Il faut la désactiver explicitement.
 *
 * Mais `{ type: "disabled" }` n'est pas accepté partout : Fable 5 et Opus 5.5
 * le rejettent en 400, et les modèles antérieurs à la famille 4.6 attendent
 * `budget_tokens` — chez eux, omettre le paramètre suffit à ne pas réfléchir.
 * D'où cette fonction plutôt qu'une constante : `COMMENT_MODEL` est réglable,
 * et une valeur mal choisie ne doit pas faire échouer chaque génération.
 */
const DISABLED_THINKING_OK = [
  /^claude-sonnet-5(?!-)/,
  /^claude-sonnet-4-6/,
  /^claude-opus-5(?!-5)/,
  /^claude-opus-4-[678]/,
];

export function supportsDisabledThinking(model: string): boolean {
  return DISABLED_THINKING_OK.some((pattern) => pattern.test(model));
}

/**
 * Bloc `thinking` à transmettre, ou rien.
 *
 * Renvoyer un objet à étaler (`...thinkingFor(model)`) plutôt qu'un booléen :
 * l'appelant ne doit pas avoir à réinventer la forme du paramètre, ni à se
 * souvenir que « pas de réflexion » s'écrit tantôt `disabled`, tantôt par
 * l'absence du champ.
 */
export function thinkingFor(model: string): { thinking?: { type: "disabled" } } {
  return supportsDisabledThinking(model) ? { thinking: { type: "disabled" } } : {};
}
