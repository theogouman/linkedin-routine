import "server-only";

import { insertNewPosts, getOwnPostsSince } from "@/modules/feed/server/repository";
import { insertNewComments, mapProviderCommentIds } from "@/modules/inbox/server/repository";
import {
  getSyncableAccounts,
  setAccountFetchState,
  updateAccountProfile,
} from "@/modules/lists/server/repository";
import { getIngestionProvider } from "@/modules/ingestion/providers";
import { loadSyncSettings } from "@/modules/ingestion/server/settings";
import type { SyncSettings } from "@/modules/ingestion/lib/settings";
import {
  finishSyncRun,
  readCursor,
  recordCursorFailure,
  recordCursorSuccess,
  startSyncRun,
} from "@/modules/ingestion/server/cursors";
import {
  runSync,
  type SyncPorts,
  type SyncReport,
} from "@/modules/ingestion/lib/sync";

/**
 * Composition de l'actualisation.
 *
 * Les modules métier ne se connaissent pas entre eux (règle d'isolation) :
 * c'est ici, et seulement ici, que le fil, l'inbox, les listes et la couche de
 * récupération sont branchés ensemble.
 */

function buildPorts(settings: SyncSettings): SyncPorts {
  return {
    listAccounts: async () => {
      const accounts = await getSyncableAccounts();
      return accounts.map((account) => ({
        id: account.id,
        profileUrl: account.profile_url,
        isSelf: account.is_self,
        hasProfileMetadata: account.name !== null && account.avatar_url !== null,
      }));
    },

    readCursor,
    recordCursorSuccess,
    recordCursorFailure,

    savePosts: async (account, posts) =>
      insertNewPosts(
        posts.map((post) => ({
          providerPostId: post.providerPostId,
          accountId: account.id,
          authorName: post.author.name,
          authorAvatarUrl: post.author.avatarUrl,
          authorProfileUrl: post.author.profileUrl,
          body: post.body,
          media: post.media,
          mediaKind: post.mediaKind,
          isRepost: post.isRepost,
          postUrl: post.postUrl,
          publishedAt: post.publishedAt,
          isOwn: account.isSelf,
        })),
      ),

    setAccountState: (accountId, state, error) =>
      setAccountFetchState(accountId, state, error),

    enrichAccount: (accountId, profile) =>
      updateAccountProfile(accountId, {
        name: profile.name,
        headline: profile.headline,
        avatarUrl: profile.avatarUrl,
      }),

    listOwnPosts: async (since) => {
      const posts = await getOwnPostsSince(since);
      return posts.map((post) => ({
        id: post.id,
        providerPostId: post.provider_post_id,
        postUrl: post.post_url,
      }));
    },

    saveComments: async (comments) => {
      if (comments.length === 0) return 0;

      // Les commentaires sont rattachés à nos publications par identifiant
      // fournisseur ; un commentaire dont le post n'est pas en base est
      // ignoré plutôt que de créer une publication fantôme.
      const ownPosts = await getOwnPostsSince(
        new Date(Date.now() - settings.receivedCommentsWindowDays * 86_400_000),
      );
      const postIdByProviderId = new Map(
        ownPosts.map((post) => [post.provider_post_id, post.id]),
      );

      // Deux passes : les racines d'abord, pour que les réponses trouvent leur
      // parent déjà inséré et puissent le référencer.
      const byDepth = [...comments].sort((a, b) => a.depth - b.depth);
      let inserted = 0;

      for (const depth of [...new Set(byDepth.map((c) => c.depth))]) {
        const batch = byDepth.filter((comment) => comment.depth === depth);
        const parentIds = await mapProviderCommentIds(
          batch
            .map((comment) => comment.parentProviderCommentId)
            .filter((id): id is string => id !== null),
        );

        inserted += await insertNewComments(
          batch
            .map((comment) => {
              const postId = postIdByProviderId.get(comment.providerPostId);
              if (!postId) return null;
              return {
                providerCommentId: comment.providerCommentId,
                postId,
                parentCommentId: comment.parentProviderCommentId
                  ? parentIds.get(comment.parentProviderCommentId) ?? null
                  : null,
                depth: comment.depth,
                authorName: comment.author.name,
                authorProfileUrl: comment.author.profileUrl,
                authorAvatarUrl: comment.author.avatarUrl,
                body: comment.body,
                commentUrl: comment.commentUrl,
                publishedAt: comment.publishedAt,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null),
        );
      }

      return inserted;
    },
  };
}

export interface SyncOutcome extends SyncReport {
  runId: string;
  durationMs: number;
}

export async function synchronize(
  scope: "all" | "posts" | "comments" = "all",
): Promise<SyncOutcome> {
  const startedAt = Date.now();
  // Lus une fois par passage : toutes les fenêtres d'une même actualisation
  // doivent raisonner sur les mêmes bornes, même si le réglage change pendant.
  const settings = await loadSyncSettings();
  const runId = await startSyncRun(scope);

  try {
    const report = await runSync(getIngestionProvider(), buildPorts(settings), {
      now: new Date(),
      ...settings,
      scope,
    });

    await finishSyncRun(runId, {
      // Une actualisation est « ok » si elle s'est déroulée, même avec des
      // comptes en échec : ceux-ci sont comptés à part et réessayés au tour
      // suivant, curseur intact.
      ok: true,
      accountsSynced: report.accountsSynced,
      accountsFailed: report.accountsFailed,
      postsInserted: report.postsInserted,
      commentsInserted: report.commentsInserted,
      error: report.errors.length
        ? report.errors.map((e) => `${e.scope} : ${e.reason}`).join(" | ")
        : null,
    });

    return { ...report, runId, durationMs: Date.now() - startedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncRun(runId, {
      ok: false,
      accountsSynced: 0,
      accountsFailed: 0,
      postsInserted: 0,
      commentsInserted: 0,
      error: message,
    });
    throw error;
  }
}
