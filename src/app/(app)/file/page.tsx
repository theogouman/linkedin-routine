import {
  getJournal,
  getPendingActions,
  getQueueState,
  getSchedulingHistory,
} from "@/modules/engagement/server/repository";
import {
  countToday,
  effectiveCaps,
  rampFactor,
} from "@/modules/engagement/lib/policy";
import { loadPolicy, loadRampState } from "@/modules/engagement/server/settings";
import { getProcessStatus } from "@/modules/ai/server/generate";
import { getSelfAccount } from "@/modules/lists/server/repository";
import { getCursors, getRecentSyncRuns } from "@/modules/ingestion/server/cursors";
import { loadSyncSettings } from "@/modules/ingestion/server/settings";
import { countSubscriptions } from "@/modules/notifications/server/push";
import { readEnv } from "@/shared/lib/env";
import { PageHeader } from "@/shared/components/PageHeader";
import { SuspendedBanner } from "@/shared/components/SuspendedBanner";
import { QueueList } from "./QueueList";
import { Journal } from "./Journal";
import { SettingsPanel } from "./SettingsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "File — Routine" };

/**
 * File d'envoi, journal et réglages (FR-016 → FR-019, FR-014).
 *
 * Tout ce qui décide du rythme du compte est réuni sur un seul écran :
 * l'utilisateur doit pouvoir répondre en dix secondes à « qu'est-ce qui va
 * partir, quand, et combien me reste-t-il aujourd'hui ».
 */
export default async function QueuePage() {
  const now = new Date();

  const [
    pendingActions,
    journal,
    queueState,
    policy,
    ramp,
    processes,
    self,
    cursors,
    runs,
    pushCount,
    syncSettings,
  ] = await Promise.all([
    getPendingActions(),
    getJournal(60),
    getQueueState(),
    loadPolicy(),
    loadRampState(),
    getProcessStatus(),
    getSelfAccount(),
    getCursors(),
    getRecentSyncRuns(5),
    countSubscriptions(),
    loadSyncSettings(),
  ]);

  const history = await getSchedulingHistory(new Date(now.getTime() - 3 * 86_400_000));
  const caps = effectiveCaps(policy, ramp, now);
  const used = countToday(policy, history, now);
  const factor = rampFactor(policy, ramp, now);

  const failedCursors = cursors.filter((cursor) => cursor.consecutive_failures > 0);

  return (
    <>
      <PageHeader
        title="File"
        subtitle={`${pendingActions.length} action${pendingActions.length > 1 ? "s" : ""} en attente · ${Math.round(factor * 100)} % des plafonds`}
      />

      {queueState.status === "suspended" ? (
        <SuspendedBanner
          reason={queueState.suspended_reason}
          suspendedAt={queueState.suspended_at}
        />
      ) : null}

      <QueueList
        actions={pendingActions.map((action) => ({
          id: action.id,
          kind: action.kind,
          body: action.body,
          scheduledFor: action.scheduled_for,
          origin: action.origin,
        }))}
        caps={caps}
        used={used}
        timezone={policy.timezone}
      />

      <Journal
        entries={journal.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          status: entry.status,
          origin: entry.origin,
          body: entry.body,
          createdAt: entry.created_at,
          sentAt: entry.sent_at,
          error: entry.error,
          targetUrl: entry.postUrl,
          targetExcerpt: entry.commentExcerpt ?? entry.postExcerpt,
        }))}
      />

      <SettingsPanel
        policy={{
          caps: policy.caps,
          delayMinutes: policy.delayMinutes,
          maxCommentsPerHour: policy.maxCommentsPerHour,
          window: policy.window,
          timezone: policy.timezone,
        }}
        syncSettings={syncSettings}
        selfProfileUrl={self?.profile_url ?? null}
        processes={processes}
        vapidPublicKey={readEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY") ?? null}
        pushSubscriptions={pushCount}
        syncRuns={runs.map((run) => ({
          id: run.id,
          scope: run.scope,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          ok: run.ok,
          postsInserted: run.posts_inserted,
          commentsInserted: run.comments_inserted,
          error: run.error,
        }))}
        failedCursors={failedCursors.map((cursor) => ({
          key: cursor.key,
          failures: cursor.consecutive_failures,
          error: cursor.last_error,
        }))}
      />
    </>
  );
}
