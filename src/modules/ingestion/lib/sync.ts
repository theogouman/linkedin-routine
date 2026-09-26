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
  /**
   * Lecture de TOUS les curseurs en une fois.
   *
   * Optionnelle pour que les tests puissent s'en passer, mais indispensable en
   * production : ordonner les comptes suppose de connaître leur curseur, et les
   * lire un par un coûtait un aller-retour réseau par compte. À 373 comptes,
   * ces lectures consommaient à elles seules la totalité du budget du passage —
   * la fonction s'arrêtait sur son échéance avant d'avoir interrogé un seul
   * profil. Trois actualisations de suite se sont terminées ainsi, « réussies »,
   * avec zéro compte traité.
   */
  readAllCursors?(): Promise<Map<string, CursorState>>;
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
  /**
   * Date de départ du corpus, propagée à chaque fenêtre de récupération.
   * `null` = pas de borne, comportement historique.
   */
  startDate?: Date | null;
  /**
   * Minuit du jour courant, en heure locale de l'app.
   *
   * Ne s'applique QU'AUX publications. Les commentaires reçus sous les posts de
   * l'utilisateur gardent leur fenêtre glissante : quelqu'un qui commente un
   * dimanche mérite une réponse le lundi, alors qu'un post du dimanche est du
   * bruit pour une routine qui ne tourne pas le week-end.
   */
  dayFloor?: Date | null;
  /** `posts` seul, `comments` seul, ou les deux. */
  scope?: "all" | "posts" | "comments";
  /**
   * Nombre maximum de comptes traités par passage.
   *
   * Une actualisation tourne dans une fonction serverless, dont la durée est
   * plafonnée. À plusieurs centaines de comptes interrogés l'un après
   * l'autre, elle est tuée AVANT sa fin : le travail déjà fait est conservé
   * (chaque curseur avance à son compte), mais le journal reste ouvert et
   * l'utilisateur n'apprend jamais où il en est. On borne donc explicitement,
   * et on dit combien il reste.
   */
  maxAccountsPerRun?: number;
  /**
   * Instant au-delà duquel on arrête d'entamer un nouveau compte.
   *
   * Complémentaire du plafond de comptes : un compte lent suffit à faire
   * dépasser un budget exprimé en nombre d'appels. C'est l'horloge qui a le
   * dernier mot, parce que c'est elle que la plateforme regarde.
   */
  deadline?: Date;
  /**
   * Comptes interrogés en parallèle.
   *
   * Les appels au fournisseur sont de l'attente réseau, pas du calcul : les
   * mener un par un laissait la fonction inactive l'essentiel du temps. Quatre
   * de front divisent le temps de passage d'autant, sans peser sur la base.
   */
  concurrency?: number;
}

export interface SyncReport {
  accountsSynced: number;
  accountsFailed: number;
  accountsRestricted: number;
  postsInserted: number;
  commentsInserted: number;
  errors: Array<{ scope: string; reason: string }>;
  truncated: string[];
  /** Comptes non traités par ce passage, à reprendre au suivant. */
  accountsRemaining: number;
  /** true quand le passage s'est arrêté sur son budget et non sur la fin. */
  partial: boolean;
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
    accountsRemaining: 0,
    partial: false,
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
  const all = await ports.listAccounts();

  // Les comptes jamais synchronisés passent en premier, puis les plus anciens.
  // Sans cet ordre, un passage borné rejouerait toujours les mêmes premiers
  // comptes et les derniers de la liste n'auraient jamais leur tour.
  const cursors = await readCursorsFor(ports, all);
  const ordered = [...all].sort((a, b) => {
    const left = cursors.get(a.id)?.lastSyncedAt?.getTime() ?? 0;
    const right = cursors.get(b.id)?.lastSyncedAt?.getTime() ?? 0;
    return left - right;
  });

  const budget = options.maxAccountsPerRun ?? Number.POSITIVE_INFINITY;
  const selected = ordered.slice(0, Math.max(0, budget));
  report.accountsRemaining = ordered.length - selected.length;
  if (report.accountsRemaining > 0) report.partial = true;

  let index = 0;
  let stopped = false;

  const runOne = async (account: SyncAccount): Promise<void> => {
    const key = postsCursorKey(account.id);
    const cursor = cursors.get(account.id) ?? (await ports.readCursor(key));
    const window = computeFetchWindow(cursor, {
      now: options.now,
      initialBackfillDays: options.initialBackfillDays,
      maxLookbackDays: options.maxLookbackDays,
      startDate: options.startDate ?? null,
      dayFloor: options.dayFloor ?? null,
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
      return;
    }

    if (outcome.state === "restricted") {
      report.accountsRestricted += 1;
      await ports.setAccountState(account.id, "restricted", outcome.reason);
      await ports.recordCursorFailure(key, outcome.reason);
      return;
    }

    const inserted = await ports.savePosts(account, outcome.posts);
    report.postsInserted += inserted;
    report.accountsSynced += 1;

    const first = outcome.posts[0];
    if (first) {
      await ports.setAccountState(account.id, "ok", null);
      // Rafraîchi à CHAQUE passe réussie, pas seulement quand il manque.
      // Les URLs d'avatars LinkedIn sont signées et expirent : figer la
      // première vue ferait disparaître les photos au bout de quelques
      // semaines, sans que rien ne signale pourquoi.
      if (first.author.avatarUrl !== null || !account.hasProfileMetadata) {
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
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      if (stopped) return;
      // L'horloge est consultée AVANT d'entamer un compte, jamais au milieu :
      // un compte à moitié traité laisserait son curseur dans un état qui ne
      // correspond à rien.
      if (options.deadline && Date.now() >= options.deadline.getTime()) {
        stopped = true;
        return;
      }
      const account = selected[index];
      if (!account) return;
      index += 1;
      await runOne(account);
    }
  };

  const lanes = Math.max(1, Math.min(options.concurrency ?? 1, selected.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));

  if (stopped) {
    report.partial = true;
    report.accountsRemaining += selected.length - index;
  }
}

/**
 * Curseurs de tous les comptes, en une lecture quand le port le permet.
 *
 * Un compte absent de la table n'a simplement jamais été synchronisé : on rend
 * l'état vierge sans repartir en base, sans quoi le gain serait annulé au
 * premier amorçage — c'est précisément le cas où aucun curseur n'existe.
 */
async function readCursorsFor(
  ports: SyncPorts,
  accounts: SyncAccount[],
): Promise<Map<string, CursorState>> {
  const cursors = new Map<string, CursorState>();
  const bulk = ports.readAllCursors ? await ports.readAllCursors() : null;
  for (const account of accounts) {
    const key = postsCursorKey(account.id);
    cursors.set(
      account.id,
      bulk ? bulk.get(key) ?? { lastSyncedAt: null } : await ports.readCursor(key),
    );
  }
  return cursors;
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
    startDate: options.startDate ?? null,
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
