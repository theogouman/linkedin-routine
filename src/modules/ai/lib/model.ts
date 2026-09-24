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

const EFFORT_CAPABLE_MODEL = /^claude-(opus|sonnet|fable)-5/;

export function supportsEffort(model: string): boolean {
  return EFFORT_CAPABLE_MODEL.test(model);
}
