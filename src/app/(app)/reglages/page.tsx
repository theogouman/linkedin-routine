import { loadPolicy } from "@/modules/engagement/server/settings";
import { getProcessStatus, loadGenerationSettings } from "@/modules/ai/server/generate";
import { getSelfAccount } from "@/modules/lists/server/repository";
import { getCursors, getRecentSyncRuns } from "@/modules/ingestion/server/cursors";
import { countSubscriptions } from "@/modules/notifications/server/push";
import { readEnv } from "@/shared/lib/env";
import { PageHeader } from "@/shared/components/PageHeader";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réglages — Routine" };

/**
 * Réglages (FR-017 → FR-019, diagnostics).
 *
 * Écran à part entière, atteignable depuis la barre de navigation. Ils
 * vivaient auparavant dans un repli de l'écran « File » : deux écrans très
 * différents — ce qui va partir aujourd'hui, et comment le compte se comporte
 * en général — partageaient la même page, et le second poussait le premier
 * sous la ligne de flottaison.
 */
export default async function SettingsPage() {
  const [policy, processes, generation, self, cursors, runs, pushCount] = await Promise.all([
    loadPolicy(),
    getProcessStatus(),
    loadGenerationSettings(),
    getSelfAccount(),
    getCursors(),
    getRecentSyncRuns(5),
    countSubscriptions(),
  ]);

  const failedCursors = cursors.filter((cursor) => cursor.consecutive_failures > 0);

  return (
    <>
      <PageHeader
        title="Réglages"
        subtitle={`Plafonds, fenêtre d'émission, compte et diagnostics · ${policy.timezone}`}
      />

      <SettingsForm
        policy={{
          caps: policy.caps,
          delayMinutes: policy.delayMinutes,
          maxCommentsPerHour: policy.maxCommentsPerHour,
          window: policy.window,
          timezone: policy.timezone,
        }}
        selfProfileUrl={self?.profile_url ?? null}
        processes={processes}
        generation={generation}
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
