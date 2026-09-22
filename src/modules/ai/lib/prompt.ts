/**
 * Construction du prompt de génération (FR-006, FR-007).
 *
 * Séparé de l'appel réseau pour être testable : c'est ici que se joue le
 * respect du process de l'utilisateur, et c'est la partie qu'on voudra
 * inspecter quand une proposition sortira à côté.
 */

import { stripEditorialHeader, type ProcessKind } from "./process-files";

export interface CommentOnPostContext {
  kind: "comment_on_post";
  authorName: string | null;
  postBody: string;
  /** Décrit le média quand il n'est pas restituable, pour ne pas commenter à l'aveugle. */
  mediaNote: string | null;
}

export interface ReplyToCommentContext {
  kind: "reply_to_comment";
  ownPostBody: string;
  commenterName: string | null;
  commentBody: string;
  /** Fil des réponses déjà échangées sous ce commentaire, du plus ancien au plus récent. */
  thread: Array<{ author: string | null; body: string }>;
}

export type GenerationContext = CommentOnPostContext | ReplyToCommentContext;

export const SYSTEM_PREAMBLE = [
  "Tu rédiges des commentaires LinkedIn en français, au nom de l'utilisateur de cette application.",
  "Le process ci-dessous a été écrit par lui : il fait autorité sur le ton, la structure et les règles.",
  "En cas de contradiction entre ce préambule et le process, le process gagne.",
  "",
  "Contraintes techniques, non négociables :",
  "- Réponds UNIQUEMENT par le texte du commentaire, prêt à publier.",
  "- Aucun préambule, aucune explication, aucun guillemet autour du texte.",
  "- Aucune option, aucune variante : une seule proposition.",
  "- Aucun hashtag, aucun lien, sauf si le process l'exige explicitement.",
  "",
  "Le texte produit est une PROPOSITION : l'utilisateur la relit et la modifie avant publication.",
].join("\n");

export function buildSystemPrompt(processMarkdown: string): string {
  const body = stripEditorialHeader(processMarkdown);
  return [
    SYSTEM_PREAMBLE,
    "",
    "--- DÉBUT DU PROCESS DE L'UTILISATEUR ---",
    body === "" ? "(Process non encore rédigé : applique les contraintes ci-dessus et reste sobre.)" : body,
    "--- FIN DU PROCESS DE L'UTILISATEUR ---",
  ].join("\n");
}

const MAX_BODY_CHARS = 6000;

function truncate(value: string): string {
  return value.length > MAX_BODY_CHARS
    ? `${value.slice(0, MAX_BODY_CHARS)}\n[…contenu tronqué…]`
    : value;
}

export function buildUserPrompt(context: GenerationContext): string {
  if (context.kind === "comment_on_post") {
    return [
      `Auteur de la publication : ${context.authorName ?? "inconnu"}`,
      context.mediaNote ? `Média : ${context.mediaNote}` : null,
      "",
      "Publication :",
      '"""',
      truncate(context.postBody.trim() === "" ? "(publication sans texte)" : context.postBody),
      '"""',
      "",
      "Rédige le commentaire.",
    ]
      .filter((line) => line !== null)
      .join("\n");
  }

  const thread = context.thread
    .map((entry) => `${entry.author ?? "quelqu'un"} : ${entry.body}`)
    .join("\n");

  return [
    "Ta publication :",
    '"""',
    truncate(context.ownPostBody.trim() === "" ? "(publication sans texte)" : context.ownPostBody),
    '"""',
    "",
    `Commentaire de ${context.commenterName ?? "un lecteur"} :`,
    '"""',
    truncate(context.commentBody),
    '"""',
    thread === "" ? null : `\nÉchanges déjà tenus sous ce commentaire :\n${thread}`,
    "",
    "Rédige la réponse.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function processKindFor(context: GenerationContext): ProcessKind {
  return context.kind;
}

/**
 * Nettoie la sortie du modèle.
 *
 * Même avec des consignes strictes, une proposition revient parfois encadrée
 * de guillemets ou précédée d'un « Voici : ». On l'enlève ici plutôt que de
 * laisser l'utilisateur le faire à chaque génération.
 */
export function cleanGeneratedComment(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^(voici|voilà)\s*(le|la|une|ma)?\s*(commentaire|réponse|proposition)\s*:?\s*/i, "");
  text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
  text = text.trim();
  if (text.length > 1 && /^["'«“]/.test(text) && /["'»”]$/.test(text)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}
