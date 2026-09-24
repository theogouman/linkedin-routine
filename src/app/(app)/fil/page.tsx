import Link from "next/link";
import { getFeed } from "@/modules/feed/server/repository";
import { getLists } from "@/modules/lists/server/repository";
import { getLastSuccessfulSync } from "@/modules/ingestion/server/cursors";
import { getQueueState } from "@/modules/engagement/server/repository";
import { EmptyState } from "@/shared/components/EmptyState";
import { PageHeader } from "@/shared/components/PageHeader";
import { FeedList } from "./FeedList";
import { FeedToolbar } from "./FeedToolbar";
import { SuspendedBanner } from "@/shared/components/SuspendedBanner";
import { relativeTime } from "@/shared/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feed — Routine" };

/**
 * Le feed (US-2, FR-004).
 *
 * Antichronologique strict, filtrable par listes, sans aucun contenu
 * algorithmique. Par défaut il ne montre que les publications à commenter :
 * c'est une file à vider, pas un flux à parcourir.
 */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ liste?: string; vue?: string }>;
}) {
  const params = await searchParams;
  const selectedListIds = (params.liste ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  const scope = params.vue === "traite" ? "processed" : "unprocessed";

  const [posts, lists, lastSync, queueState] = await Promise.all([
    getFeed({ listIds: selectedListIds, scope, limit: 60 }),
    getLists(),
    getLastSuccessfulSync(),
    getQueueState(),
  ]);

  // La pastille de liste n'a de sens que si le feed en mélange plusieurs :
  // sur une vue filtrée sur une seule liste, elle répéterait le filtre.
  const showListBadges = selectedListIds.length !== 1;

  return (
    <>
      <PageHeader
        title="Feed"
        subtitle={
          scope === "processed"
            ? `${posts.length} publication${posts.length > 1 ? "s" : ""} déjà traitée${posts.length > 1 ? "s" : ""}`
            : posts.length === 0
              ? "File vide"
              : `${posts.length} à traiter`
        }
      />

      <SuspendedBanner
        reason={queueState.status === "suspended" ? queueState.suspended_reason : null}
        suspendedAt={queueState.status === "suspended" ? queueState.suspended_at : null}
        restrictedAccounts={lists.reduce((total, list) => total + list.restrictedCount, 0)}
      />

      <FeedToolbar
        lists={lists.map((list) => ({ id: list.id, name: list.name, count: list.accountCount }))}
        selectedListIds={selectedListIds}
        scope={scope}
        lastSyncLabel={lastSync?.finished_at ? relativeTime(lastSync.finished_at) : "jamais"}
      />

      {posts.length === 0 ? (
        lists.length === 0 ? (
          <EmptyState
            title="Aucune liste"
            description="Crée une liste et colle les URLs des profils que tu veux suivre. Le feed ne montrera qu'eux."
            action={
              <Link href="/listes" className="nc-btn nc-btn--primary nc-btn--sm">
                Créer une liste
              </Link>
            }
          />
        ) : scope === "processed" ? (
          <EmptyState
            title="Rien de traité"
            description="Aucune publication commentée ou ignorée pour ce filtre."
          />
        ) : (
          <EmptyState
            title="File vide"
            description="Toutes les publications sont traitées. C'est le but — reviens à la prochaine actualisation."
          />
        )
      ) : (
        <FeedList
          posts={posts}
          lists={lists.map((list) => ({ id: list.id, name: list.name }))}
          showListBadges={showListBadges}
        />
      )}
    </>
  );
}
