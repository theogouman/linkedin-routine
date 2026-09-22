/**
 * Interface d'écriture — la seule surface qui touche au compte LinkedIn de
 * l'utilisateur (FR-005, FR-009, FR-013).
 *
 * Symétrique de l'interface de récupération : un fournisseur d'écriture est
 * remplaçable sans toucher à la file, aux plafonds ni au coupe-circuit. Les
 * échecs remontent en `WriteProviderError` afin que `detectRestriction` puisse
 * lire le statut et le corps bruts — c'est là que se joue le coupe-circuit.
 */

export interface CommentMedia {
  /** URL publique ou data-URL de l'image / du GIF joint (FR-005). */
  url: string;
  mimeType?: string;
}

export interface PublishCommentInput {
  /** Identifiant fournisseur de la publication commentée. */
  providerPostId: string;
  text: string;
  media?: CommentMedia | null;
}

export interface PublishReplyInput {
  providerPostId: string;
  /** Commentaire auquel on répond — la réponse se place à son niveau. */
  providerCommentId: string;
  text: string;
  media?: CommentMedia | null;
}

export interface PublishLikeInput {
  targetType: "post" | "comment";
  providerPostId: string;
  providerCommentId?: string | null;
}

export interface PublishResult {
  /** Identifiant renvoyé par le fournisseur, conservé au journal. */
  providerId: string | null;
  /** URL du commentaire publié, quand le fournisseur la donne. */
  url: string | null;
  raw: unknown;
}

export interface WriteProvider {
  readonly name: string;
  publishComment(input: PublishCommentInput): Promise<PublishResult>;
  publishReply(input: PublishReplyInput): Promise<PublishResult>;
  publishLike(input: PublishLikeInput): Promise<PublishResult>;
}

/**
 * Échec d'écriture, conservé sous forme brute.
 *
 * `status` et `body` ne sont pas décoratifs : ce sont eux que le coupe-circuit
 * inspecte pour distinguer un 429 ou un checkpoint 2FA d'une publication
 * simplement supprimée entre la mise en file et l'envoi.
 */
export class WriteProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "WriteProviderError";
  }
}
