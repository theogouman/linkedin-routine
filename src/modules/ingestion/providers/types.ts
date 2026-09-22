/**
 * Interface unique de récupération (FR-020).
 *
 * Tout le reste de l'app ne connaît QUE ce contrat. Le marché des fournisseurs
 * de données LinkedIn est instable — Proxycurl a fermé en 2025 après une
 * action en justice — donc remplacer un actor défaillant ou un fournisseur
 * disparu doit être une implémentation de plus, jamais une reprise du fil, de
 * l'inbox ou du schéma.
 *
 * Contrat implicite, valable pour toute implémentation :
 *  — la lecture n'utilise JAMAIS le compte LinkedIn de l'utilisateur (FR-021) ;
 *  — un profil non récupérable remonte `restricted`, pas une exception ;
 *  — les résultats peuvent être plus larges que la fenêtre demandée : c'est
 *    l'appelant qui filtre finement sur `publishedAt`.
 */

export type MediaKind = "none" | "image" | "video" | "document" | "article";

export interface MediaItem {
  type: "image" | "video" | "document" | "article";
  url: string | null;
  thumbnailUrl?: string | null;
  title?: string | null;
  /** true quand le média ne peut pas être restitué dans l'app (FR-004). */
  externalOnly: boolean;
}

export interface FetchedPost {
  providerPostId: string;
  postUrl: string | null;
  body: string;
  media: MediaItem[];
  mediaKind: MediaKind;
  isRepost: boolean;
  publishedAt: Date;
  author: {
    name: string | null;
    profileUrl: string | null;
    publicIdentifier: string | null;
    avatarUrl: string | null;
  };
}

export interface FetchedComment {
  providerCommentId: string;
  /** Identifiant fournisseur de la publication commentée. */
  providerPostId: string;
  /** Identifiant fournisseur du commentaire parent, si c'est une réponse. */
  parentProviderCommentId: string | null;
  depth: number;
  body: string;
  commentUrl: string | null;
  publishedAt: Date;
  author: {
    name: string | null;
    profileUrl: string | null;
    avatarUrl: string | null;
  };
}

export interface FetchedProfile {
  publicIdentifier: string | null;
  profileUrl: string;
  name: string | null;
  headline: string | null;
  avatarUrl: string | null;
}

export type AccountFetchOutcome =
  | { state: "ok"; posts: FetchedPost[] }
  /** Profil restreint ou introuvable : marqueur visuel dans la liste (FR-002). */
  | { state: "restricted"; reason: string }
  /** Panne transitoire : le curseur ne doit PAS avancer (FR-022). */
  | { state: "failed"; reason: string };

export interface FetchPostsRequest {
  profileUrl: string;
  since: Date;
  now: Date;
  /** Garde-fou de coût : plafond dur du nombre de posts demandés. */
  maxPosts: number;
}

export interface FetchCommentsRequest {
  /** URLs des publications de l'utilisateur dont on veut les commentaires. */
  postUrls: string[];
  since: Date;
  now: Date;
  maxCommentsPerPost: number;
}

export type CommentsFetchOutcome =
  | { state: "ok"; comments: FetchedComment[] }
  | { state: "failed"; reason: string };

export interface IngestionProvider {
  /** Nom court, affiché dans les réglages et les journaux d'actualisation. */
  readonly name: string;
  fetchPostsForProfile(request: FetchPostsRequest): Promise<AccountFetchOutcome>;
  fetchCommentsForPosts(request: FetchCommentsRequest): Promise<CommentsFetchOutcome>;
  /**
   * Enrichissement d'un profil (nom, photo) à l'ajout d'un compte.
   * Optionnel : quand le fournisseur ne l'offre pas, les métadonnées sont
   * déduites de la première publication récupérée.
   */
  fetchProfile?(profileUrl: string): Promise<FetchedProfile | null>;
}
