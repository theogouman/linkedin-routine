/**
 * Les six réactions LinkedIn.
 *
 * Vocabulaire partagé par la base (contrainte `check` de la migration 007),
 * le fournisseur d'écriture et l'interface. Une seule table, parce qu'une
 * valeur inconnue serait refusée par l'API au moment de l'envoi — c'est-à-dire
 * après la mise en file, après la validation manuelle, et sans que rien ne
 * l'ait signalé au moment où l'utilisateur a cliqué.
 *
 * Les couleurs reprennent celles de LinkedIn : ce sont elles qui rendent une
 * réaction reconnaissable d'un coup d'œil, et les inventer rendrait l'app
 * illisible pour quelqu'un qui connaît le réseau.
 */

export const REACTIONS = [
  { type: "like", label: "J'aime", color: "#378FE9", tint: "rgba(55, 143, 233, 0.14)" },
  { type: "celebrate", label: "Bravo", color: "#6DAE4F", tint: "rgba(109, 174, 79, 0.14)" },
  { type: "support", label: "Soutien", color: "#A78BD0", tint: "rgba(167, 139, 208, 0.16)" },
  { type: "love", label: "J'adore", color: "#DF704D", tint: "rgba(223, 112, 77, 0.14)" },
  { type: "insightful", label: "Instructif", color: "#E7A33E", tint: "rgba(231, 163, 62, 0.16)" },
  { type: "funny", label: "Drôle", color: "#44BFD4", tint: "rgba(68, 191, 212, 0.16)" },
] as const;

export type ReactionType = (typeof REACTIONS)[number]["type"];

export const DEFAULT_REACTION: ReactionType = "like";

const BY_TYPE = new Map(REACTIONS.map((reaction) => [reaction.type, reaction]));

export function reaction(type: string | null | undefined) {
  return BY_TYPE.get((type ?? DEFAULT_REACTION) as ReactionType) ?? REACTIONS[0];
}

/**
 * Filtre d'entrée pour tout ce qui vient de l'extérieur — base, formulaire,
 * fournisseur. Retombe sur `like` plutôt que de lever : une réaction inconnue
 * en base ne doit pas faire échouer l'affichage du fil entier.
 */
export function asReactionType(value: unknown): ReactionType {
  return typeof value === "string" && BY_TYPE.has(value as ReactionType)
    ? (value as ReactionType)
    : DEFAULT_REACTION;
}
