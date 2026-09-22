/**
 * Traduction des charges utiles de l'actor HarvestAPI vers le domaine.
 *
 * Isolée du client HTTP pour être testable sur des échantillons figés : c'est
 * la couche qui casse en premier quand un fournisseur change sa sortie, et
 * c'est celle qu'on veut pouvoir vérifier sans appel réseau ni crédit dépensé.
 *
 * Principe de tolérance : un champ manquant dégrade le résultat, il ne le fait
 * pas échouer. Un post sans texte mais avec une image reste un post ; un post
 * sans identifiant, en revanche, est inexploitable et donc rejeté.
 */

import type {
  FetchedComment,
  FetchedPost,
  MediaItem,
  MediaKind,
} from "../providers/types";

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Les actors renvoient tantôt un timestamp epoch, tantôt une date ISO, selon
 * le chemin du champ. On accepte les deux et on refuse silencieusement le
 * reste : une date invalide ferait remonter un post à 1970 en tête de fil.
 */
export function parseTimestamp(source: unknown): Date | null {
  const record = asRecord(source);
  if (record) {
    const fromTimestamp = record.timestamp;
    if (typeof fromTimestamp === "number" && Number.isFinite(fromTimestamp)) {
      const date = new Date(fromTimestamp);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const fromDate = asString(record.date);
    if (fromDate) return parseTimestamp(fromDate);
    return null;
  }
  if (typeof source === "number" && Number.isFinite(source)) {
    const date = new Date(source);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = asString(source);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Un post partagé se reconnaît à trois marqueurs indépendants : la présence
 * d'un bloc `repost`, d'un `repostedBy`, ou d'un `type` explicite. On les teste
 * tous — le filtre d'entrée de l'actor exclut déjà les partages, ceci est la
 * seconde barrière qui garantit FR-004 même si le fournisseur change d'avis.
 */
export function isRepost(raw: Json): boolean {
  if (asRecord(raw.repost) !== null) return true;
  if (asRecord(raw.repostedBy) !== null) return true;
  const type = asString(raw.type)?.toLowerCase();
  return type === "repost" || type === "reshare" || type === "quote";
}

/**
 * Détermine le média principal et s'il est restituable dans l'app.
 *
 * Vidéos et carrousels documents ne le sont pas : LinkedIn sert des flux
 * signés et expirants. Pour ceux-là, l'app affiche le lien d'ouverture
 * directe plutôt qu'un lecteur cassé (FR-004).
 */
export function extractMedia(raw: Json): { media: MediaItem[]; kind: MediaKind } {
  const media: MediaItem[] = [];

  const video = asRecord(raw.postVideo);
  if (video) {
    media.push({
      type: "video",
      url: asString(video.videoUrl),
      thumbnailUrl: asString(video.thumbnailUrl),
      externalOnly: true,
    });
  }

  const document = asRecord(raw.document);
  if (document) {
    const coverPages = asArray(document.coverPages);
    const firstCover = asRecord(coverPages[0]);
    const coverUrl = firstCover ? asString(asArray(firstCover.imageUrls)[0]) : null;
    media.push({
      type: "document",
      url: asString(document.transcribedDocumentUrl) ?? asString(document.manifestUrl),
      thumbnailUrl: coverUrl,
      title: asString(document.title),
      externalOnly: true,
    });
  }

  for (const entry of asArray(raw.postImages)) {
    const image = asRecord(entry);
    const url = image ? asString(image.url) : null;
    if (url) media.push({ type: "image", url, externalOnly: false });
  }

  const article = asRecord(raw.article);
  if (article) {
    const image = asRecord(article.image);
    media.push({
      type: "article",
      url: asString(article.link),
      thumbnailUrl: image ? asString(image.url) : null,
      title: asString(article.title),
      externalOnly: false,
    });
  }

  const first = media[0];
  return { media, kind: first ? first.type : "none" };
}

function buildProfileUrl(publicIdentifier: string | null): string | null {
  return publicIdentifier
    ? `https://www.linkedin.com/in/${encodeURIComponent(publicIdentifier.toLowerCase())}`
    : null;
}

export function normalizePost(input: unknown): FetchedPost | null {
  const raw = asRecord(input);
  if (!raw) return null;

  const providerPostId =
    asString(raw.id) ?? asString(raw.entityId) ?? asString(raw.shareUrn);
  if (!providerPostId) return null;

  const publishedAt = parseTimestamp(raw.postedAt) ?? parseTimestamp(raw.createdAt);
  if (!publishedAt) return null;

  const author = asRecord(raw.author) ?? {};
  const avatar = asRecord(author.avatar);
  const social = asRecord(raw.socialContent);
  const { media, kind } = extractMedia(raw);
  const publicIdentifier = asString(author.publicIdentifier);

  return {
    providerPostId,
    postUrl:
      asString(raw.linkedinUrl) ??
      (social ? asString(social.shareUrl) : null) ??
      asString(raw.shareLinkedinUrl),
    body: asString(raw.content) ?? "",
    media,
    mediaKind: kind,
    isRepost: isRepost(raw),
    publishedAt,
    author: {
      name: asString(author.name),
      profileUrl: asString(author.linkedinUrl) ?? buildProfileUrl(publicIdentifier),
      publicIdentifier: publicIdentifier?.toLowerCase() ?? null,
      avatarUrl: avatar ? asString(avatar.url) : null,
    },
  };
}

/**
 * Aplatit l'arbre des commentaires.
 *
 * L'actor imbrique les réponses dans `replies`, à profondeur variable. On
 * parcourt récursivement pour garantir FR-008 (« à tous les niveaux
 * d'imbrication ») et on conserve `depth` pour l'indentation à l'affichage.
 */
export function normalizeComments(
  input: unknown,
  context: { providerPostId?: string } = {},
): FetchedComment[] {
  const collected: FetchedComment[] = [];

  const walk = (value: unknown, parentId: string | null, depth: number): void => {
    const raw = asRecord(value);
    if (!raw) return;

    const providerCommentId = asString(raw.id);
    const publishedAt =
      parseTimestamp(raw.createdAtTimestamp) ?? parseTimestamp(raw.createdAt);
    const providerPostId =
      asString(raw.postId) ?? context.providerPostId ?? null;

    if (providerCommentId && publishedAt && providerPostId) {
      const actor = asRecord(raw.actor) ?? {};
      const picture = asRecord(actor.picture);
      collected.push({
        providerCommentId,
        providerPostId,
        parentProviderCommentId: parentId,
        depth,
        body: asString(raw.commentary) ?? "",
        commentUrl: asString(raw.linkedinUrl),
        publishedAt,
        author: {
          name: asString(actor.name),
          profileUrl: asString(actor.linkedinUrl),
          avatarUrl: asString(actor.pictureUrl) ?? (picture ? asString(picture.url) : null),
        },
      });
    }

    for (const reply of asArray(raw.replies)) {
      walk(reply, providerCommentId, depth + 1);
    }
  };

  for (const entry of asArray(input)) walk(entry, null, 0);
  if (!Array.isArray(input)) walk(input, null, 0);
  return collected;
}

/**
 * Filtre et déduplique un lot de publications.
 *
 * Trois responsabilités, toutes exigées par la spec : exclure les partages
 * (FR-004), ne garder que ce qui est postérieur au curseur (FR-003), et
 * n'émettre chaque publication qu'une fois même si deux chemins de
 * récupération l'ont ramenée (cas limite « doublons »).
 */
export function selectNewPosts(
  posts: FetchedPost[],
  options: { since: Date; excludeReposts?: boolean },
): FetchedPost[] {
  const excludeReposts = options.excludeReposts ?? true;
  const seen = new Set<string>();
  const result: FetchedPost[] = [];

  for (const post of posts) {
    if (excludeReposts && post.isRepost) continue;
    if (post.publishedAt.getTime() < options.since.getTime()) continue;
    if (seen.has(post.providerPostId)) continue;
    seen.add(post.providerPostId);
    result.push(post);
  }

  return result.sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
}

/** Même travail pour les commentaires reçus, en conservant l'ordre parent→enfant. */
export function selectNewComments(
  comments: FetchedComment[],
  options: { since: Date },
): FetchedComment[] {
  const seen = new Set<string>();
  return comments
    .filter((comment) => {
      if (comment.publishedAt.getTime() < options.since.getTime()) return false;
      if (seen.has(comment.providerCommentId)) return false;
      seen.add(comment.providerCommentId);
      return true;
    })
    .sort((a, b) => a.depth - b.depth || a.publishedAt.getTime() - b.publishedAt.getTime());
}
