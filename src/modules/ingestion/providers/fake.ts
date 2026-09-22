/**
 * Fournisseur de récupération en mémoire.
 *
 * Sert à deux choses : développer l'app sans compte Apify ni budget, et faire
 * tourner les tests d'intégration du fil et de l'inbox sans réseau. Il
 * implémente le même contrat, y compris les états `restricted` et `failed`,
 * pour que les chemins d'erreur soient réellement exercés.
 */

import { selectNewComments, selectNewPosts } from "../lib/normalize";
import type {
  AccountFetchOutcome,
  CommentsFetchOutcome,
  FetchCommentsRequest,
  FetchPostsRequest,
  FetchedComment,
  FetchedPost,
  FetchedProfile,
  IngestionProvider,
} from "./types";

export interface FakeProviderSeed {
  postsByProfile?: Record<string, FetchedPost[]>;
  commentsByPostUrl?: Record<string, FetchedComment[]>;
  profiles?: Record<string, FetchedProfile>;
  restrictedProfiles?: string[];
  failingProfiles?: string[];
}

export class FakeIngestionProvider implements IngestionProvider {
  readonly name = "fake";
  readonly calls: Array<{ kind: string; detail: string }> = [];

  constructor(private readonly seed: FakeProviderSeed = {}) {}

  async fetchPostsForProfile(
    request: FetchPostsRequest,
  ): Promise<AccountFetchOutcome> {
    this.calls.push({ kind: "posts", detail: request.profileUrl });
    if (this.seed.restrictedProfiles?.includes(request.profileUrl)) {
      return { state: "restricted", reason: "Profil restreint (simulation)." };
    }
    if (this.seed.failingProfiles?.includes(request.profileUrl)) {
      return { state: "failed", reason: "Panne du fournisseur (simulation)." };
    }
    const posts = this.seed.postsByProfile?.[request.profileUrl] ?? [];
    return {
      state: "ok",
      posts: selectNewPosts(posts, { since: request.since }).slice(0, request.maxPosts),
    };
  }

  async fetchCommentsForPosts(
    request: FetchCommentsRequest,
  ): Promise<CommentsFetchOutcome> {
    this.calls.push({ kind: "comments", detail: request.postUrls.join(",") });
    const comments = request.postUrls.flatMap(
      (url) => this.seed.commentsByPostUrl?.[url] ?? [],
    );
    return {
      state: "ok",
      comments: selectNewComments(comments, { since: request.since }),
    };
  }

  async fetchProfile(profileUrl: string): Promise<FetchedProfile | null> {
    this.calls.push({ kind: "profile", detail: profileUrl });
    return this.seed.profiles?.[profileUrl] ?? null;
  }
}
