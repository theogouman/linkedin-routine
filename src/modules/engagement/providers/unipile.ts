/**
 * Implémentation Unipile de l'écriture.
 *
 * Unipile est le SEUL point où le compte LinkedIn de l'utilisateur est engagé.
 * Toute la lecture passe ailleurs, par des fournisseurs no-cookie : le compte
 * ne porte donc aucune empreinte d'automatisation en consultation, seulement
 * des actions que l'utilisateur a validées une à une.
 *
 * Les chemins d'API sont des constantes en tête de fichier plutôt que des
 * littéraux disséminés : Unipile fait évoluer ses routes, et c'est le seul
 * endroit à corriger le jour où elles bougent. Les valeurs sont surchargeables
 * par variable d'environnement pour ne pas exiger un déploiement.
 */

import { readEnv, requireEnv } from "@/shared/lib/env";
import {
  WriteProviderError,
  type PublishCommentInput,
  type PublishLikeInput,
  type PublishReplyInput,
  type PublishResult,
  type WriteProvider,
} from "./types";

/** Routes par défaut de l'API Unipile v1 (`/api/v1` inclus dans le DSN). */
const ROUTES = {
  comment: "/posts/{postId}/comments",
  reaction: "/posts/reaction",
};

export interface UnipileOptions {
  /** DSN complet fourni par Unipile, ex. `https://api3.unipile.com:13031/api/v1`. */
  dsn?: string;
  apiKey?: string;
  /** Identifiant du compte LinkedIn connecté — un seul (FR-012). */
  accountId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class UnipileWriteProvider implements WriteProvider {
  readonly name = "unipile";

  /**
   * Identifiants résolus au premier envoi, pas à la construction — même raison
   * que côté récupération : la purge de file instancie ce fournisseur à chaque
   * passage, y compris quand la file est vide. Exiger le DSN dès le
   * constructeur faisait échouer ces passages à vide tant que le compte
   * n'était pas provisionné.
   */
  private credentials: { dsn: string; apiKey: string; accountId: string } | null;
  private readonly options: UnipileOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: UnipileOptions = {}) {
    this.options = options;
    this.credentials =
      options.dsn && options.apiKey && options.accountId
        ? {
            dsn: options.dsn.replace(/\/+$/, ""),
            apiKey: options.apiKey,
            accountId: options.accountId,
          }
        : null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private resolve(): { dsn: string; apiKey: string; accountId: string } {
    if (this.credentials === null) {
      this.credentials = {
        dsn: (this.options.dsn ?? requireEnv("UNIPILE_DSN")).replace(/\/+$/, ""),
        apiKey: this.options.apiKey ?? requireEnv("UNIPILE_API_KEY"),
        accountId: this.options.accountId ?? requireEnv("UNIPILE_ACCOUNT_ID"),
      };
    }
    return this.credentials;
  }

  private route(key: keyof typeof ROUTES): string {
    const override = readEnv(`UNIPILE_ROUTE_${key.toUpperCase()}`);
    return override ?? ROUTES[key];
  }

  private async request(path: string, body: unknown): Promise<unknown> {
    const { dsn, apiKey } = this.resolve();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${dsn}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text === "" ? null : JSON.parse(text);
      } catch {
        parsed = text;
      }

      if (!response.ok) {
        throw new WriteProviderError(
          `Unipile a répondu ${response.status} sur ${path}`,
          response.status,
          extractCode(parsed),
          parsed,
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof WriteProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        // Un timeout est ambigu : l'action est peut-être partie. On le remonte
        // sans le traiter comme un signal de restriction, et l'appelant ne
        // réessaiera pas automatiquement (risque de double publication).
        throw new WriteProviderError(
          "Délai dépassé côté fournisseur d'écriture — statut d'envoi incertain.",
          undefined,
          "timeout",
        );
      }
      throw new WriteProviderError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async publishComment(input: PublishCommentInput): Promise<PublishResult> {
    const path = this.route("comment").replace(
      "{postId}",
      encodeURIComponent(input.providerPostId),
    );
    const raw = await this.request(path, {
      account_id: this.resolve().accountId,
      text: input.text,
      ...(input.media ? { attachment: input.media.url } : {}),
    });
    return toResult(raw);
  }

  async publishReply(input: PublishReplyInput): Promise<PublishResult> {
    const path = this.route("comment").replace(
      "{postId}",
      encodeURIComponent(input.providerPostId),
    );
    const raw = await this.request(path, {
      account_id: this.resolve().accountId,
      text: input.text,
      comment_id: input.providerCommentId,
      ...(input.media ? { attachment: input.media.url } : {}),
    });
    return toResult(raw);
  }

  async publishLike(input: PublishLikeInput): Promise<PublishResult> {
    const raw = await this.request(this.route("reaction"), {
      account_id: this.resolve().accountId,
      post_id: input.providerPostId,
      ...(input.targetType === "comment" && input.providerCommentId
        ? { comment_id: input.providerCommentId }
        : {}),
      reaction_type: "like",
    });
    return toResult(raw);
  }
}

function extractCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const raw = body as Record<string, unknown>;
  const candidate = raw.type ?? raw.code ?? raw.error;
  return typeof candidate === "string" ? candidate : undefined;
}

function toResult(raw: unknown): PublishResult {
  if (typeof raw !== "object" || raw === null) {
    return { providerId: null, url: null, raw };
  }
  const record = raw as Record<string, unknown>;
  const id = record.id ?? record.comment_id ?? record.object;
  const url = record.url ?? record.link ?? record.permalink;
  return {
    providerId: typeof id === "string" ? id : null,
    url: typeof url === "string" ? url : null,
    raw,
  };
}
