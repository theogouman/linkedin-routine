import Link from "next/link";
import { getFeed } from "@/modules/feed/server/repository";
import { getLists } from "@/modules/lists/server/repository";
import { getLastSuccessfulSync } from "@/modules/ingestion/server/cursors";
import { getQueueState } from "@/modules/engagement/server/repository";
import { EmptyState } from "@/shared/components/EmptyState";
import { PageHeader } from "@/shared/components/PageHeader";
import { PostCard } from "./PostCard";
import { FeedToolbar } from "./FeedToolbar";
import { SuspendedBanner } from "@/shared/components/SuspendedBanner";
import { relativeTime } from "@/shared/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fil — Routine" };

/**
 * Le fil (US-2, FR-004).
 *
 * Antichronologique strict, filtrable par liste, sans aucun contenu
 * algorithmique. Par défaut il ne montre que les publications non traitées :
 * c'est une file à vider, pas un flux à parcourir.
 */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ liste?: string; tout?: string }>;
}) {
  const params = await searchParams;
  const listId = params.liste;
  const showAll = params.tout === "1";

  const [posts, lists, lastSync, queueState] = await Promise.all([
    getFeed({ listId, scope: showAll ? "all" : "unprocessed", limit: 60 }),
    getLists(),
    getLastSuccessfulSync(),
    getQueueState(),
  ]);

  const remaining = posts.filter((post) => post.processed_at === null).length;

  return (
    <>
      <PageHeader
        title="Fil"
        subtitle={
          showAll
            ? `${posts.length} publication${posts.length > 1 ? "s" : ""} affichée${posts.length > 1 ? "s" : ""}`
            : remaining === 0
              ? "File vide"
              : `${remaining} à traiter`
        }
      />

      {queueState.status === "suspended" ? (
        <SuspendedBanner
          reason={queueState.suspended_reason}
          suspendedAt={queueState.suspended_at}
        />
      ) : null}

      <FeedToolbar
        lists={lists.map((list) => ({ id: list.id, name: list.name, count: list.accountCount }))}
        activeListId={listId ?? null}
        showAll={showAll}
        lastSyncLabel={
          lastSync?.finished_at ? relativeTime(lastSync.finished_at) : "jamais"
        }
      />

      {posts.length === 0 ? (
        lists.length === 0 ? (
          <EmptyState
            title="Aucune liste"
            description="Crée une liste et colle les URLs des profils que tu veux suivre. Le fil ne montrera qu'eux."
            action={
              <Link href="/listes" className="nc-btn nc-btn--primary nc-btn--sm">
                Créer une liste
              </Link>
            }
          />
        ) : showAll ? (
          <EmptyState
            title="Rien à afficher"
            description="Aucune publication récupérée pour ce filtre. Actualise, ou vérifie que tes comptes publient."
          />
        ) : (
          <EmptyState
            title="File vide"
            description="Toutes les publications sont traitées. C'est le but — reviens à la prochaine actualisation."
            action={
              <Link href="/fil?tout=1" className="nc-btn nc-btn--ghost nc-btn--sm">
                Revoir les publications traitées
              </Link>
            }
          />
        )
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {posts.map((post, index) => (
            <li
              key={post.id}
              className="nc-content-enter"
              style={{ "--nc-enter-i": Math.min(index, 6) } as React.CSSProperties}
            >
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
