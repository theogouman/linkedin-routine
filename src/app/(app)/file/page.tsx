import {
  getJournal,
  getPendingActions,
  getQueueState,
  getSchedulingHistory,
} from "@/modules/engagement/server/repository";
import { countToday, effectiveCaps, rampFactor } from "@/modules/engagement/lib/policy";
import { loadPolicy, loadRampState } from "@/modules/engagement/server/settings";
import { PageHeader } from "@/shared/components/PageHeader";
import { SuspendedBanner } from "@/shared/components/SuspendedBanner";
import { QueueList } from "./QueueList";
import { Journal } from "./Journal";

export const dynamic = "force-dynamic";
export const metadata = { title: "File — Routine" };

/**
 * File d'envoi et journal (FR-016, FR-014).
 *
 * L'écran répond à une seule question : « qu'est-ce qui va partir, quand, et
 * combien me reste-t-il aujourd'hui ». Les réglages, qui répondaient à une
 * question tout autre, ont leur écran à eux (/reglages).
 */
export default async function QueuePage() {
  const now = new Date();

  const [pendingActions, journal, queueState, policy, ramp] = await Promise.all([
    getPendingActions(),
    getJournal(60),
    getQueueState(),
    loadPolicy(),
    loadRampState(),
  ]);

  const history = await getSchedulingHistory(new Date(now.getTime() - 3 * 86_400_000));
  const caps = effectiveCaps(policy, ramp, now);
  const used = countToday(policy, history, now);
  const factor = rampFactor(policy, ramp, now);

  return (
    <>
      <PageHeader
        title="File"
        subtitle={`${pendingActions.length} action${pendingActions.length > 1 ? "s" : ""} en attente · ${Math.round(factor * 100)} % des plafonds`}
      />

      <SuspendedBanner
        reason={queueState.status === "suspended" ? queueState.suspended_reason : null}
        suspendedAt={queueState.status === "suspended" ? queueState.suspended_at : null}
      />

      <QueueList
        actions={pendingActions.map((action) => ({
          id: action.id,
          kind: action.kind,
          body: action.body,
          scheduledFor: action.scheduled_for,
          origin: action.origin,
          status: action.status,
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
    </>
  );
}
