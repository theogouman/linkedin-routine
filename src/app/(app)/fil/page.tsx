import { Suspense } from "react";
import Link from "next/link";
import { getFeed } from "@/modules/feed/server/repository";
import { getLists } from "@/modules/lists/server/repository";
import { getLastSuccessfulSync } from "@/modules/ingestion/server/cursors";
import { getQueueState } from "@/modules/engagement/server/repository";
import { EmptyState } from "@/shared/components/EmptyState";
import { PageHeader } from "@/shared/components/PageHeader";
import { FeedList } from "./FeedList";
import { FeedShell, FeedSkeleton } from "./FeedShell";
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
 *
 * Les publications sont chargées DANS une frontière `Suspense` clé par le
 * filtre. C'est ce qui rend le changement de listes instantané : la barre de
 * filtres, l'en-tête et les bandeaux restent à l'écran, et seules les cartes
 * repassent par des squelettes le temps de la requête. Sans cette frontière,
 * la page entière attendait la base avant de se repeindre, et cocher une liste
 * donnait une seconde d'écran figé.
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

  // Ces trois lectures ne dépendent PAS du filtre : elles restent hors de la
  // frontière pour que la barre ne clignote pas à chaque changement.
  const [lists, lastSync, queueState] = await Promise.all([
    getLists(),
    getLastSuccessfulSync(),
    getQueueState(),
  ]);

  return (
    <>
      {/* Le compte dépend du filtre : il a sa propre frontière pour que
          l'en-tête ne disparaisse pas pendant que les cartes se chargent. */}
      <PageHeader
        title="Feed"
        subtitle={
          <Suspense fallback={<span className="nc-skel-bar inline-block h-[12px] w-16 align-middle" />}>
            <FeedCount selectedListIds={selectedListIds} scope={scope} />
          </Suspense>
        }
      />

      <SuspendedBanner
        reason={queueState.status === "suspended" ? queueState.suspended_reason : null}
        suspendedAt={queueState.status === "suspended" ? queueState.suspended_at : null}
        restrictedAccounts={lists.reduce((total, list) => total + list.restrictedCount, 0)}
      />

      <FeedShell
        toolbar={
          <FeedToolbar
            lists={lists.map((list) => ({
              id: list.id,
              name: list.name,
              count: list.accountCount,
            }))}
            selectedListIds={selectedListIds}
            scope={scope}
            lastSyncLabel={lastSync?.finished_at ? relativeTime(lastSync.finished_at) : "jamais"}
          />
        }
      >
        {/* La frontière sert au PREMIER chargement, où le flux HTML la rend
            utile ; la coquille cliente prend le relais sur les navigations
            suivantes, que le routeur n'échange qu'une fois la page prête. */}
        <Suspense
          key={`${scope}|${[...selectedListIds].sort().join(",")}`}
          fallback={<FeedSkeleton />}
        >
          <FeedBody
            selectedListIds={selectedListIds}
            scope={scope}
            lists={lists.map((list) => ({ id: list.id, name: list.name }))}
            hasLists={lists.length > 0}
          />
        </Suspense>
      </FeedShell>
    </>
  );
}

async function FeedCount({
  selectedListIds,
  scope,
}: {
  selectedListIds: string[];
  scope: "unprocessed" | "processed";
}) {
  const posts = await getFeed({ listIds: selectedListIds, scope, limit: 60 });
  if (scope === "processed") {
    return `${posts.length} publication${posts.length > 1 ? "s" : ""} déjà traitée${posts.length > 1 ? "s" : ""}`;
  }
  return posts.length === 0 ? "File vide" : `${posts.length} à traiter`;
}

async function FeedBody({
  selectedListIds,
  scope,
  lists,
  hasLists,
}: {
  selectedListIds: string[];
  scope: "unprocessed" | "processed";
  lists: Array<{ id: string; name: string }>;
  hasLists: boolean;
}) {
  const posts = await getFeed({ listIds: selectedListIds, scope, limit: 60 });

  // La pastille de liste n'a de sens que si le feed en mélange plusieurs : sur
  // une vue filtrée sur une seule liste, elle répéterait le filtre.
  const showListBadges = selectedListIds.length !== 1;

  if (posts.length === 0) {
    if (!hasLists) {
      return (
        <EmptyState
          title="Aucune liste"
          description="Crée une liste et colle les URLs des profils que tu veux suivre. Le feed ne montrera qu'eux."
          action={
            <Link href="/listes" className="nc-btn nc-btn--primary nc-btn--sm">
              Créer une liste
            </Link>
          }
        />
      );
    }
    return scope === "processed" ? (
      <EmptyState
        title="Rien de traité"
        description="Aucune publication commentée ou ignorée pour ce filtre."
      />
    ) : (
      <EmptyState
        title="File vide"
        description="Toutes les publications sont traitées. C'est le but — reviens à la prochaine actualisation."
      />
    );
  }

  return <FeedList posts={posts} lists={lists} showListBadges={showListBadges} />;
}
