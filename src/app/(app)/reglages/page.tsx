import { loadPolicy } from "@/modules/engagement/server/settings";
import { getProcessStatus, loadGenerationSettings } from "@/modules/ai/server/generate";
import { getSelfAccount } from "@/modules/lists/server/repository";
import { getCursors, getRecentSyncRuns } from "@/modules/ingestion/server/cursors";
import { readIngestionStart } from "@/modules/ingestion/server/start-date";
import { loadBrain } from "@/modules/ai/server/comment-brain";
import { corpusStatus } from "@/modules/ai/server/comment-examples-repository";
import { generationStats } from "@/modules/ai/server/comment-journal";
import { commentModel } from "@/modules/ai/server/comment-generation";
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
  const [policy, processes, generation, self, cursors, runs, pushCount, startDate] =
    await Promise.all([
      loadPolicy(),
      getProcessStatus(),
      loadGenerationSettings(),
      getSelfAccount(),
      getCursors(),
      getRecentSyncRuns(5),
      countSubscriptions(),
      readIngestionStart(),
    ]);

  // Le générateur peut tourner sans que sa migration soit appliquée : on
  // affiche alors « pas encore installé » plutôt que de faire tomber l'écran
  // des réglages, qui sert aussi à diagnostiquer ce genre de situation.
  const generator = await describeGenerator();

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
        ingestionStart={startDate?.toISOString() ?? null}
        generator={generator}
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
          remaining: run.accounts_remaining,
          accountsSynced: run.accounts_synced,
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

export interface GeneratorView {
  model: string;
  brainVersion: string;
  corpus: { total: number; embedded: number } | null;
  stats: {
    total: number;
    publiees: number;
    sansRetouche: number;
    distanceMoyenne: number | null;
    parSlot: Record<string, number>;
    parBadge: Record<string, number>;
    cacheRate: number | null;
  } | null;
}

async function describeGenerator(): Promise<GeneratorView> {
  const brain = await loadBrain().catch(() => ({ version: "introuvable" }));
  const [corpus, stats] = await Promise.all([
    corpusStatus().catch(() => null),
    generationStats().catch(() => null),
  ]);
  return { model: commentModel(), brainVersion: brain.version, corpus, stats };
}
