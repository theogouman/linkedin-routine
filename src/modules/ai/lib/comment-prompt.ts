/**
 * Message utilisateur du générateur (§4.2 du brief).
 *
 * Deux règles de forme, toutes deux consécutives au cache.
 *
 * 1. **Les données d'abord, la consigne à la fin.** Le modèle lit dans l'ordre :
 *    placer « Génère les 4 variantes » avant le post reviendrait à demander
 *    avant d'avoir montré.
 * 2. **Rien de ce fichier n'est mis en cache.** Le cache porte sur le system
 *    (le cerveau), qui ne bouge jamais. Tout ce qui varie d'un post à l'autre
 *    vit ici, après le point de césure — c'est ce qui garde la lecture de
 *    cache à dix pour cent du prix d'entrée.
 */

import { renderExamples, type SelectedExample } from "./comment-examples";
import type { Intention } from "./comment-variants";

export type Relation = "inconnu" | "connaissance" | "proche";
export type Langue = "fr" | "en";

/**
 * Détection de langue à deux listes de mots.
 *
 * Volontairement rustique : il n'y a que deux issues, et se tromper coûte un
 * commentaire dans la mauvaise langue que Théo voit immédiatement. Une
 * dépendance de détection linguistique pour ça serait un paquet de plus à
 * maintenir pour un problème qui tient en trente mots.
 */
const FR_MARKERS = /\b(le|la|les|des|une|un|et|est|pour|avec|dans|sur|que|qui|pas|plus|vous|nous|ce|cette|au|aux|du|en|ne|se|son|sa|ses|mais|comme|tout|faire|être)\b/gi;
const EN_MARKERS = /\b(the|and|is|are|for|with|in|on|that|this|you|we|of|to|be|have|has|it|as|was|will|can|from|they|our|not|but|what|how)\b/gi;

export function detectLanguage(text: string): Langue {
  const fr = text.match(FR_MARKERS)?.length ?? 0;
  const en = text.match(EN_MARKERS)?.length ?? 0;
  // Égalité → français : c'est la langue de Théo, et un post trop court pour
  // trancher est un post où il écrira en français.
  return en > fr ? "en" : "fr";
}

/** Au-delà, on tronque : un post de dix mille signes n'aide pas à réagir à un point. */
const MAX_POST_CHARS = 4000;

function truncate(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > MAX_POST_CHARS
    ? `${trimmed.slice(0, MAX_POST_CHARS)}\n[..post tronqué..]`
    : trimmed;
}

export interface CommentPromptInput {
  examples: SelectedExample[];
  authorName: string | null;
  relation: Relation;
  postBody: string;
  /** Décrit le média quand l'app ne peut pas le montrer au modèle. */
  visuel: string | null;
  intention: Intention | null;
  langue?: Langue;
}

export function buildCommentPrompt(input: CommentPromptInput): string {
  const body = truncate(input.postBody);
  const langue = input.langue ?? detectLanguage(body);

  return [
    renderExamples(input.examples),
    `<auteur>${input.authorName ?? "inconnu"} | relation: ${input.relation}</auteur>`,
    `<langue>${langue}</langue>`,
    // Omise quand elle est vide, comme le demande le brief : une balise
    // `<intention></intention>` vide se lit comme une intention, pas comme une
    // absence.
    input.intention ? `<intention>${input.intention}</intention>` : null,
    "<post>",
    body === "" ? "(publication sans texte)" : body,
    input.visuel ? `[visuel : ${input.visuel}]` : null,
    "</post>",
    "Génère les 4 variantes.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export interface ReplyPromptInput {
  examples: SelectedExample[];
  /** Résumé ou début du post de Théo — le contexte de ce à quoi on répond. */
  ownPostBody: string;
  commenterName: string | null;
  commentBody: string;
}

/** Le post de Théo ne sert que de contexte : son début suffit. */
const MAX_OWN_POST_CHARS = 900;

export function buildReplyPrompt(input: ReplyPromptInput): string {
  const own = input.ownPostBody.trim();
  const context =
    own.length > MAX_OWN_POST_CHARS ? `${own.slice(0, MAX_OWN_POST_CHARS)}[..]` : own;

  return [
    "<mode>reponse</mode>",
    renderExamples(input.examples),
    `<mon_post>${context === "" ? "(publication sans texte)" : context}</mon_post>`,
    `<commentaire_recu auteur="${escapeAttribute(input.commenterName ?? "inconnu")}">${truncate(
      input.commentBody,
    )}</commentaire_recu>`,
    "Génère les 4 variantes.",
  ].join("\n");
}

/**
 * Le nom arrive dans un attribut XML : un guillemet dans un nom de famille
 * casserait la balise, et le modèle lirait la suite comme du contenu.
 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
