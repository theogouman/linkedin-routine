/**
 * Orchestration d'une actualisation (FR-003, FR-008, FR-022).
 *
 * Écrite contre des *ports* plutôt que contre la base : c'est ce qui permet de
 * tester l'invariant central — « le curseur n'avance jamais sur un échec » —
 * sans Postgres et sans dépenser un crédit de scraping. La couche
 * d'orchestration de l'app fournit l'implémentation réelle des ports.
 */

import type {
  FetchedComment,
  FetchedPost,
  IngestionProvider,
} from "../providers/types";
import {
  computeFetchWindow,
  computeReceivedCommentsWindow,
  type CursorState,
} from "./cursor";

export interface SyncAccount {
  id: string;
  profileUrl: string;
  isSelf: boolean;
  /** Les métadonnées manquantes déclenchent un enrichissement opportuniste. */
  hasProfileMetadata: boolean;
}

export interface OwnPostRef {
  id: string;
  providerPostId: string;
  postUrl: string | null;
}

export interface SyncPorts {
  listAccounts(): Promise<SyncAccount[]>;
  readCursor(key: string): Promise<CursorState>;
  recordCursorSuccess(key: string, syncedAt: Date): Promise<void>;
  recordCursorFailure(key: string, reason: string): Promise<void>;
  savePosts(
    account: SyncAccount,
    posts: FetchedPost[],
  ): Promise<number>;
  setAccountState(
    accountId: string,
    state: "pending" | "ok" | "restricted",
    error: string | null,
  ): Promise<void>;
  enrichAccount(
    accountId: string,
    profile: { name: string | null; headline: string | null; avatarUrl: string | null },
  ): Promise<void>;
  listOwnPosts(since: Date): Promise<OwnPostRef[]>;
  saveComments(comments: FetchedComment[]): Promise<number>;
}

export interface SyncOptions {
  now: Date;
  initialBackfillDays: number;
  maxLookbackDays: number;
  receivedCommentsWindowDays: number;
  maxPostsPerAccount: number;
  maxCommentsPerPost: number;
  /** `posts` seul, `comments` seul, ou les deux. */
  scope?: "all" | "posts" | "comments";
}

export interface SyncReport {
  accountsSynced: number;
  accountsFailed: number;
  accountsRestricted: number;
  postsInserted: number;
  commentsInserted: number;
  errors: Array<{ scope: string; reason: string }>;
  truncated: string[];
}

export function postsCursorKey(accountId: string): string {
  return `posts:${accountId}`;
}

export const RECEIVED_COMMENTS_CURSOR_KEY = "own_comments";

export async function runSync(
  provider: IngestionProvider,
  ports: SyncPorts,
  options: SyncOptions,
): Promise<SyncReport> {
  const scope = options.scope ?? "all";
  const report: SyncReport = {
    accountsSynced: 0,
    accountsFailed: 0,
    accountsRestricted: 0,
    postsInserted: 0,
    commentsInserted: 0,
    errors: [],
    truncated: [],
  };

  if (scope !== "comments") {
    await syncPosts(provider, ports, options, report);
  }
  if (scope !== "posts") {
    await syncReceivedComments(provider, ports, options, report);
  }
  return report;
}

async function syncPosts(
  provider: IngestionProvider,
  ports: SyncPorts,
  options: SyncOptions,
  report: SyncReport,
): Promise<void> {
  const accounts = await ports.listAccounts();

  for (const account of accounts) {
    const key = postsCursorKey(account.id);
    const cursor = await ports.readCursor(key);
    const window = computeFetchWindow(cursor, {
      now: options.now,
      initialBackfillDays: options.initialBackfillDays,
      maxLookbackDays: options.maxLookbackDays,
    });
    if (window.truncated) report.truncated.push(account.profileUrl);

    const outcome = await provider.fetchPostsForProfile({
      profileUrl: account.profileUrl,
      since: window.since,
      now: options.now,
      maxPosts: options.maxPostsPerAccount,
    });

    if (outcome.state === "failed") {
      // Le curseur reste où il est : la prochaine actualisation reprendra la
      // même fenêtre. C'est la garantie qu'aucune publication n'est manquée
      // en silence à cause d'une panne du fournisseur (FR-022).
      report.accountsFailed += 1;
      report.errors.push({ scope: account.profileUrl, reason: outcome.reason });
      await ports.recordCursorFailure(key, outcome.reason);
      continue;
    }

    if (outcome.state === "restricted") {
      report.accountsRestricted += 1;
      await ports.setAccountState(account.id, "restricted", outcome.reason);
      await ports.recordCursorFailure(key, outcome.reason);
      continue;
    }

    const inserted = await ports.savePosts(account, outcome.posts);
    report.postsInserted += inserted;
    report.accountsSynced += 1;

    const first = outcome.posts[0];
    if (first) {
      await ports.setAccountState(account.id, "ok", null);
      if (!account.hasProfileMetadata) {
        await ports.enrichAccount(account.id, {
          name: first.author.name,
          headline: null,
          avatarUrl: first.author.avatarUrl,
        });
      }
    } else if (!account.hasProfileMetadata && provider.fetchProfile) {
      // Aucun post sur la fenêtre : on ne conclut PAS que le compte est
      // restreint — un créateur peut simplement ne rien avoir publié. On tente
      // seulement de compléter son identité pour qu'il ne reste pas anonyme
      // dans la liste.
      const profile = await provider.fetchProfile(account.profileUrl);
      if (profile) {
        await ports.enrichAccount(account.id, {
          name: profile.name,
          headline: profile.headline,
          avatarUrl: profile.avatarUrl,
        });
      }
    }

    await ports.recordCursorSuccess(key, options.now);
  }
}

async function syncReceivedComments(
  provider: IngestionProvider,
  ports: SyncPorts,
  options: SyncOptions,
  report: SyncReport,
): Promise<void> {
  const cursor = await ports.readCursor(RECEIVED_COMMENTS_CURSOR_KEY);
  const window = computeReceivedCommentsWindow(cursor, {
    now: options.now,
    initialBackfillDays: options.initialBackfillDays,
    maxLookbackDays: options.maxLookbackDays,
    windowDays: options.receivedCommentsWindowDays,
  });

  // On n'interroge que les publications encore dans la fenêtre glissante :
  // un commentaire déposé sur un post de 40 jours est hors périmètre (FR-008).
  const slidingStart = new Date(
    options.now.getTime() - options.receivedCommentsWindowDays * 86_400_000,
  );
  const ownPosts = await ports.listOwnPosts(slidingStart);
  const urls = ownPosts
    .map((post) => post.postUrl)
    .filter((url): url is string => typeof url === "string" && url !== "");

  if (urls.length === 0) {
    await ports.recordCursorSuccess(RECEIVED_COMMENTS_CURSOR_KEY, options.now);
    return;
  }

  const outcome = await provider.fetchCommentsForPosts({
    postUrls: urls,
    since: window.since,
    now: options.now,
    maxCommentsPerPost: options.maxCommentsPerPost,
  });

  if (outcome.state === "failed") {
    report.errors.push({ scope: "commentaires reçus", reason: outcome.reason });
    await ports.recordCursorFailure(RECEIVED_COMMENTS_CURSOR_KEY, outcome.reason);
    return;
  }

  report.commentsInserted += await ports.saveComments(outcome.comments);
  await ports.recordCursorSuccess(RECEIVED_COMMENTS_CURSOR_KEY, options.now);
}
