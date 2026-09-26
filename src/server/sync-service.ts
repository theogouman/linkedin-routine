import "server-only";

import {
  INITIAL_BACKFILL_DAYS,
  MAX_LOOKBACK_DAYS,
  RECEIVED_COMMENTS_WINDOW_DAYS,
  readIntEnv,
} from "@/shared/lib/env";
import { insertNewPosts, getOwnPostsSince } from "@/modules/feed/server/repository";
import { insertNewComments, mapProviderCommentIds } from "@/modules/inbox/server/repository";
import {
  getAccountsMissingProfile,
  getSyncableAccounts,
  setAccountFetchState,
  updateAccountProfile,
} from "@/modules/lists/server/repository";
import { getIngestionProvider } from "@/modules/ingestion/providers";
import {
  clearPostsCursors,
  finishSyncRun,
  readAllCursors,
  readCursor,
  recordCursorFailure,
  recordCursorSuccess,
  startSyncRun,
} from "@/modules/ingestion/server/cursors";
import {
  readIngestionStart,
  startOfToday,
  writeIngestionStart,
} from "@/modules/ingestion/server/start-date";
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

function buildPorts(): SyncPorts {
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
    readAllCursors,
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
          reactionCount: post.reactionCount,
          commentCount: post.commentCount,
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
        new Date(Date.now() - RECEIVED_COMMENTS_WINDOW_DAYS * 86_400_000),
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

/**
 * Budget d'un passage d'actualisation.
 *
 * Une fonction serverless a une durée plafonnée. À plusieurs centaines de
 * comptes interrogés à la suite, l'actualisation était tuée avant sa fin : le
 * travail déjà fait restait acquis — chaque curseur avance à son compte — mais
 * le journal gardait la ligne ouverte, et rien ne disait où l'on en était.
 * Trois passages consécutifs se sont terminés ainsi après l'import des 372
 * comptes, sans qu'aucune erreur ne soit visible nulle part.
 *
 * On s'arrête donc volontairement, et on dit combien il reste.
 */
const SYNC_WALL_CLOCK_MS = readIntEnv("SYNC_BUDGET_MS", 45_000);
/**
 * Le plafond de comptes est large parce que ce n'est pas lui qui protège : un
 * compte coûte environ une seconde et demie, quatre pistes en parallèle en
 * traitent donc bien plus de soixante dans le budget. C'est l'horloge qui
 * arrête le passage ; le plafond n'est là que pour borner un cas dégénéré où
 * chaque appel reviendrait instantanément.
 */
const SYNC_MAX_ACCOUNTS = readIntEnv("SYNC_MAX_ACCOUNTS_PER_RUN", 200);
const SYNC_CONCURRENCY = readIntEnv("SYNC_CONCURRENCY", 4);

export interface SyncBudget {
  /** Durée au bout de laquelle on n'entame plus de compte. */
  budgetMs?: number;
  /** Plafond de comptes pour ce passage. */
  maxAccounts?: number;
}

/**
 * Le budget dépend de QUI appelle, parce que la limite de durée en dépend.
 *
 * Une action déclenchée depuis l'écran tourne dans la fonction de page et doit
 * rendre la main vite — l'interface relance elle-même le tour suivant. La
 * vérification quotidienne, elle, est une route dédiée à 300 s : lui imposer le
 * budget de l'interface la condamnerait à ne jamais couvrir tous les comptes,
 * quel que soit le nombre de jours qui passent.
 */
export async function synchronize(
  scope: "all" | "posts" | "comments" = "all",
  budget: SyncBudget = {},
): Promise<SyncOutcome> {
  const startedAt = Date.now();
  const runId = await startSyncRun(scope);

  try {
    const startDate = await readIngestionStart();
    const now = new Date();
    const report = await runSync(getIngestionProvider(), buildPorts(), {
      now,
      startDate,
      // Seules les publications DU JOUR. Sans cette borne, une actualisation du
      // lundi matin rapatrie le samedi et le dimanche : deux jours que
      // l'utilisateur a délibérément sautés, et qu'il n'a aucune intention de
      // traiter. Le curseur, lui, ne sait que « depuis la dernière fois ».
      dayFloor: startOfToday(now),
      initialBackfillDays: INITIAL_BACKFILL_DAYS,
      maxLookbackDays: MAX_LOOKBACK_DAYS,
      receivedCommentsWindowDays: RECEIVED_COMMENTS_WINDOW_DAYS,
      maxPostsPerAccount: readIntEnv("MAX_POSTS_PER_ACCOUNT", 20),
      maxCommentsPerPost: readIntEnv("MAX_COMMENTS_PER_POST", 50),
      scope,
      maxAccountsPerRun: budget.maxAccounts ?? SYNC_MAX_ACCOUNTS,
      concurrency: SYNC_CONCURRENCY,
      deadline: new Date(startedAt + (budget.budgetMs ?? SYNC_WALL_CLOCK_MS)),
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
      remaining: report.accountsRemaining,
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

export interface EnrichmentOutcome {
  /** Comptes examinés pendant la passe. */
  attempted: number;
  /** Comptes pour lesquels le fournisseur a rendu un profil. */
  enriched: number;
  /** true quand il reste des comptes à traiter après ce lot. */
  more: boolean;
  message?: string;
}

/**
 * Récupération des photos et des noms de profil.
 *
 * Passe séparée de l'actualisation parce qu'elle répond à un autre besoin.
 * L'actualisation cherche des publications ; l'enrichissement cherche une
 * identité. Un créateur qui n'a rien publié depuis un mois n'apparaît dans
 * aucune fenêtre d'actualisation, mais il est bien dans une liste, et il doit
 * y avoir un visage.
 *
 * Plafonnée par lot, parce que chaque profil est facturé : amorcer plusieurs
 * centaines de comptes est une dépense ponctuelle qu'il vaut mieux voir
 * arriver en plusieurs fois qu'en une facture surprise.
 */
export async function enrichProfiles(limit = 100): Promise<EnrichmentOutcome> {
  const provider = getIngestionProvider();
  if (!provider.fetchProfiles) {
    return {
      attempted: 0,
      enriched: 0,
      more: false,
      message: `Le fournisseur « ${provider.name} » ne sait pas récupérer de profils.`,
    };
  }

  const accounts = await getAccountsMissingProfile(limit + 1);
  const batch = accounts.slice(0, limit);
  if (batch.length === 0) {
    return { attempted: 0, enriched: 0, more: false };
  }

  const profiles = await provider.fetchProfiles(batch.map((account) => account.profile_url));
  const byUrl = new Map(profiles.map((profile) => [profile.profileUrl, profile]));

  let enriched = 0;
  for (const account of batch) {
    const profile = byUrl.get(account.profile_url);
    if (!profile) continue;
    if (profile.name === null && profile.avatarUrl === null) continue;
    await updateAccountProfile(account.id, {
      name: profile.name,
      headline: profile.headline,
      avatarUrl: profile.avatarUrl,
    });
    enriched += 1;
  }

  return { attempted: batch.length, enriched, more: accounts.length > limit };
}

export interface RestartOutcome {
  /** Date de départ retenue, en ISO. */
  startDate: string;
  /** Curseurs effacés — autant de comptes qui seront réinterrogés. */
  cleared: number;
}

/**
 * Repart d'une date de départ : tous les comptes redeviennent « à amorcer »,
 * et plus rien d'antérieur à cette date ne sera jamais demandé.
 *
 * Aucune publication n'est supprimée. Celles déjà en base restent, et la
 * reprise ne peut pas les dupliquer — l'insertion est dédoublonnée par
 * identifiant fournisseur, et le statut « traité » d'un post survit.
 */
export async function restartIngestion(from?: Date): Promise<RestartOutcome> {
  const startDate = from ?? startOfToday();
  await writeIngestionStart(startDate);
  const cleared = await clearPostsCursors();
  return { startDate: startDate.toISOString(), cleared };
}
