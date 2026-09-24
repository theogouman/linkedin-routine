/**
 * Implémentation Apify de l'interface de récupération.
 *
 * Actors « no-cookie » : ils n'utilisent jamais le compte LinkedIn de
 * l'utilisateur (FR-021). On appelle `run-sync-get-dataset-items`, qui exécute
 * l'actor et renvoie directement le dataset — pas de polling à écrire, pas
 * d'état de run à gérer.
 *
 * Trois garde-fous de coût, parce que chaque résultat est facturé :
 *  — `maxPosts` plafonne dur le nombre d'items demandés ;
 *  — `postedLimit` pré-filtre côté actor pour ne pas payer ce qu'on jetterait ;
 *  — les partages sont exclus à l'entrée (`includeReposts: false`), pas après
 *    facturation.
 */

import { readEnv, requireEnv } from "@/shared/lib/env";
import {
  normalizeComments,
  normalizePost,
  selectNewComments,
  selectNewPosts,
} from "../lib/normalize";
import { toCommentPostedLimit, toPostedLimit } from "../lib/cursor";
import { matchProfiles, pickAvatarUrl, type RawProfile } from "../lib/profiles";
import type {
  AccountFetchOutcome,
  CommentsFetchOutcome,
  FetchCommentsRequest,
  FetchPostsRequest,
  FetchedProfile,
  IngestionProvider,
} from "./types";

const APIFY_BASE = "https://api.apify.com/v2";

/** Actors par défaut — surchargeables sans toucher au code (FR-020). */
const DEFAULT_POSTS_ACTOR = "harvestapi~linkedin-profile-posts";
const DEFAULT_COMMENTS_ACTOR = "harvestapi~linkedin-post-comments";
/**
 * Même famille d'actors « no-cookie » que les deux autres, facturé au profil
 * rendu. Un défaut est fourni, là où il n'y en avait pas : sans lui,
 * `fetchProfile` rendait `null` en silence et les comptes importés restaient
 * éternellement sans nom ni photo tant qu'ils ne publiaient pas.
 */
const DEFAULT_PROFILE_ACTOR = "harvestapi~linkedin-profile-scraper";

/**
 * Taille de lot d'enrichissement.
 *
 * Un run d'actor a un plafond de durée ; 100 profils s'y tiennent largement,
 * et découper laisse un échec de lot n'emporter que sa tranche.
 */
const PROFILE_BATCH_SIZE = 100;

export interface ApifyProviderOptions {
  token?: string;
  postsActor?: string;
  commentsActor?: string;
  profileActor?: string;
  /** Injectable pour les tests ; par défaut le `fetch` global. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Un profil non récupérable se reconnaît au contenu de l'item renvoyé par
 * l'actor, JAMAIS au statut HTTP ni au texte d'une erreur réseau.
 *
 * La distinction n'est pas cosmétique : « restricted » est un état durable qui
 * marque le compte dans la liste et le sort du cycle de récupération, alors
 * qu'un 503 dont le corps contient « service unavailable » est une panne de
 * dix minutes. Confondre les deux condamnerait un compte sain sur un incident
 * passager — et ferait manquer ses publications en silence (FR-022).
 */
const RESTRICTED_ITEM_PATTERNS =
  /\b(profile (not found|unavailable|is private)|no such profile|account (not found|closed|does not exist)|private profile|member not found)\b/i;

export class ApifyIngestionProvider implements IngestionProvider {
  readonly name = "apify";

  /**
   * Les identifiants sont résolus au PREMIER APPEL, pas à la construction.
   *
   * Construire un fournisseur n'est pas l'utiliser : l'ordonnanceur instancie
   * la couche de récupération à chaque passage, y compris quand il n'y a aucun
   * compte à interroger. Exiger le jeton dès le constructeur faisait échouer
   * ces passages à vide tant que le compte n'était pas provisionné — une
   * erreur toutes les cinq minutes pour un travail qui n'avait rien à faire.
   */
  private resolvedToken: string | null;
  private readonly explicitToken: string | undefined;
  private readonly postsActor: string;
  private readonly commentsActor: string;
  private readonly profileActor: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ApifyProviderOptions = {}) {
    this.explicitToken = options.token;
    this.resolvedToken = options.token ?? null;
    this.postsActor =
      options.postsActor ?? readEnv("APIFY_POSTS_ACTOR") ?? DEFAULT_POSTS_ACTOR;
    this.commentsActor =
      options.commentsActor ?? readEnv("APIFY_COMMENTS_ACTOR") ?? DEFAULT_COMMENTS_ACTOR;
    this.profileActor =
      options.profileActor ?? readEnv("APIFY_PROFILE_ACTOR") ?? DEFAULT_PROFILE_ACTOR;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  private token(): string {
    if (this.resolvedToken === null) {
      this.resolvedToken = this.explicitToken ?? requireEnv("APIFY_TOKEN");
    }
    return this.resolvedToken;
  }

  private async runActor(actor: string, input: unknown): Promise<unknown[]> {
    const url = `${APIFY_BASE}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(this.token())}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new ApifyError(
          `Apify ${actor} a répondu ${response.status}`,
          response.status,
          text,
        );
      }
      const parsed: unknown = text === "" ? [] : JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchPostsForProfile(
    request: FetchPostsRequest,
  ): Promise<AccountFetchOutcome> {
    try {
      const items = await this.runActor(this.postsActor, {
        targetUrls: [request.profileUrl],
        maxPosts: request.maxPosts,
        postedLimit: toPostedLimit(request.since, request.now),
        // Les partages sont hors périmètre (FR-004) : on les exclut à l'entrée
        // pour ne pas les payer, la normalisation refiltre par sécurité.
        includeReposts: false,
        includeQuotePosts: false,
        scrapeReactions: false,
        scrapeComments: false,
      });

      // Un actor qui ne trouve rien renvoie parfois un item d'erreur plutôt
      // qu'un dataset vide : on le lit avant de conclure « aucun post ».
      const restricted = items.find((item) => isRestrictedMarker(item));
      if (restricted) {
        return { state: "restricted", reason: describeItem(restricted) };
      }

      const posts = items
        .map((item) => normalizePost(item))
        .filter((post): post is NonNullable<typeof post> => post !== null);

      return {
        state: "ok",
        posts: selectNewPosts(posts, { since: request.since }),
      };
    } catch (error) {
      // Toute erreur de transport est transitoire par défaut. Le curseur ne
      // bougera pas et l'actualisation suivante réessaiera.
      return { state: "failed", reason: errorMessage(error) };
    }
  }

  async fetchCommentsForPosts(
    request: FetchCommentsRequest,
  ): Promise<CommentsFetchOutcome> {
    if (request.postUrls.length === 0) return { state: "ok", comments: [] };
    try {
      const items = await this.runActor(this.commentsActor, {
        posts: request.postUrls,
        maxItems: request.maxCommentsPerPost * request.postUrls.length,
        postedLimit: toCommentPostedLimit(request.since, request.now),
        // FR-008 : « à tous les niveaux d'imbrication ».
        scrapeReplies: true,
      });
      const comments = normalizeComments(items);
      return {
        state: "ok",
        comments: selectNewComments(comments, { since: request.since }),
      };
    } catch (error) {
      return { state: "failed", reason: errorMessage(error) };
    }
  }

  async fetchProfile(profileUrl: string): Promise<FetchedProfile | null> {
    const profiles = await this.fetchProfiles([profileUrl]);
    return profiles[0] ?? null;
  }

  /**
   * Enrichissement en lot.
   *
   * Un lot qui échoue n'emporte pas les autres : on renvoie ce qui a abouti.
   * L'enrichissement est un confort — un compte sans photo reste parfaitement
   * utilisable, alors qu'une exception ici bloquerait l'écran des listes.
   */
  async fetchProfiles(profileUrls: string[]): Promise<FetchedProfile[]> {
    if (profileUrls.length === 0) return [];

    const collected: RawProfile[] = [];
    for (let index = 0; index < profileUrls.length; index += PROFILE_BATCH_SIZE) {
      const batch = profileUrls.slice(index, index + PROFILE_BATCH_SIZE);
      try {
        const items = await this.runActor(this.profileActor, {
          urls: batch,
          queries: batch,
        });
        for (const item of items) {
          if (typeof item !== "object" || item === null) continue;
          const raw = item as Record<string, unknown>;
          const query = raw.originalQuery as Record<string, unknown> | undefined;
          collected.push({
            publicIdentifier:
              stringOrNull(raw.publicIdentifier) ??
              stringOrNull(query?.publicIdentifier),
            profileUrl:
              stringOrNull(raw.linkedinUrl) ??
              stringOrNull(raw.profileUrl) ??
              stringOrNull(query?.url),
            name:
              stringOrNull(raw.name) ??
              joinNames(stringOrNull(raw.firstName), stringOrNull(raw.lastName)),
            headline: stringOrNull(raw.headline) ?? stringOrNull(raw.position),
            avatarUrl:
              pickAvatarUrl(raw.photo) ??
              pickAvatarUrl(raw.profilePicture) ??
              pickAvatarUrl(raw.avatar) ??
              pickAvatarUrl(raw.pictureUrl),
          });
        }
      } catch {
        continue;
      }
    }

    // L'appariement est fait ici et pas par position : l'actor rend les
    // profils dans le désordre et omet ceux qu'il n'a pas trouvés.
    return matchProfiles(profileUrls, collected).map((profile) => ({
      profileUrl: profile.requestedUrl,
      publicIdentifier: profile.publicIdentifier,
      name: profile.name,
      headline: profile.headline,
      avatarUrl: profile.avatarUrl,
    }));
  }
}

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function joinNames(first: string | null, last: string | null): string | null {
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined === "" ? null : joined;
}

/**
 * Un item de dataset sans `id` mais porteur d'un message décrivant un profil
 * inaccessible. On exige le motif explicite : un item d'erreur générique
 * (quota, timeout interne de l'actor) reste un échec transitoire.
 */
function isRestrictedMarker(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const raw = item as Record<string, unknown>;
  if (raw.id !== undefined) return false;
  return RESTRICTED_ITEM_PATTERNS.test(JSON.stringify(raw));
}

function describeItem(item: unknown): string {
  if (typeof item !== "object" || item === null) return String(item);
  const raw = item as Record<string, unknown>;
  return (
    stringOrNull(raw.error) ??
    stringOrNull(raw.message) ??
    JSON.stringify(raw).slice(0, 300)
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApifyError) {
    return `${error.message} — ${error.body.slice(0, 300)}`;
  }
  if (error instanceof Error) {
    return error.name === "AbortError"
      ? "Délai dépassé lors de l'appel au fournisseur de récupération."
      : error.message;
  }
  return String(error);
}
