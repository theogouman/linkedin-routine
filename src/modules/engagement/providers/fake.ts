/**
 * Fournisseur d'écriture en mémoire.
 *
 * Indispensable au développement : sans lui, toucher à la file de publication
 * en local signifierait envoyer de vrais commentaires depuis le vrai compte.
 * Il sait aussi simuler les échecs qui déclenchent le coupe-circuit, seul
 * moyen de tester FR-018 sans provoquer une vraie restriction.
 */

import {
  WriteProviderError,
  type PublishCommentInput,
  type PublishLikeInput,
  type PublishReplyInput,
  type PublishResult,
  type WriteProvider,
} from "./types";

export interface FakeWriteCall {
  kind: "comment" | "reply" | "like";
  payload: PublishCommentInput | PublishReplyInput | PublishLikeInput;
}

export interface FakeWriteOptions {
  /** Erreur levée au prochain appel — sert à exercer le coupe-circuit. */
  failWith?: WriteProviderError | null;
  /** Nombre d'appels réussis avant que `failWith` ne s'applique. */
  failAfter?: number;
}

export class FakeWriteProvider implements WriteProvider {
  readonly name = "fake";
  readonly calls: FakeWriteCall[] = [];
  private options: FakeWriteOptions;

  constructor(options: FakeWriteOptions = {}) {
    this.options = options;
  }

  setOptions(options: FakeWriteOptions): void {
    this.options = options;
  }

  private record(kind: FakeWriteCall["kind"], payload: FakeWriteCall["payload"]): PublishResult {
    const failAfter = this.options.failAfter ?? 0;
    if (this.options.failWith && this.calls.length >= failAfter) {
      this.calls.push({ kind, payload });
      throw this.options.failWith;
    }
    this.calls.push({ kind, payload });
    const id = `fake-${kind}-${this.calls.length}`;
    return {
      providerId: id,
      url: `https://www.linkedin.com/feed/update/${id}`,
      raw: { id },
    };
  }

  async publishComment(input: PublishCommentInput): Promise<PublishResult> {
    return this.record("comment", input);
  }

  async publishReply(input: PublishReplyInput): Promise<PublishResult> {
    return this.record("reply", input);
  }

  async publishLike(input: PublishLikeInput): Promise<PublishResult> {
    return this.record("like", input);
  }
}
