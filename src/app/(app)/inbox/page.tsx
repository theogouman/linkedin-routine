import { getInbox } from "@/modules/inbox/server/repository";
import { getSelfAccount } from "@/modules/lists/server/repository";
import { getQueueState } from "@/modules/engagement/server/repository";
import { EmptyState } from "@/shared/components/EmptyState";
import { PageHeader } from "@/shared/components/PageHeader";
import { SuspendedBanner } from "@/shared/components/SuspendedBanner";
import { InboxItem } from "./InboxItem";
import { InboxToolbar } from "./InboxToolbar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox — Routine" };

/**
 * Commentaires reçus sur ses propres publications (US-5, FR-008 → FR-010).
 *
 * Même logique d'inbox que le fil : par défaut, seuls les non traités.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tout?: string }>;
}) {
  const params = await searchParams;
  const showAll = params.tout === "1";

  const [comments, self, queueState] = await Promise.all([
    getInbox({ scope: showAll ? "all" : "unprocessed", limit: 150 }),
    getSelfAccount(),
    getQueueState(),
  ]);

  const remaining = comments.filter((comment) => comment.processed_at === null).length;

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={
          showAll
            ? `${comments.length} commentaire${comments.length > 1 ? "s" : ""}`
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

      {self === null ? (
        <EmptyState
          title="Compte LinkedIn non renseigné"
          description="Indique l'URL de ton profil dans les réglages pour que l'app récupère les commentaires reçus sur tes publications."
        />
      ) : (
        <>
          <InboxToolbar showAll={showAll} />
          {comments.length === 0 ? (
            <EmptyState
              title={showAll ? "Aucun commentaire" : "File vide"}
              description={
                showAll
                  ? "Aucun commentaire reçu sur tes publications des 30 derniers jours."
                  : "Tous les commentaires reçus ont eu une réponse ou ont été ignorés."
              }
            />
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {comments.map((comment, index) => (
                <li
                  key={comment.id}
                  className="nc-content-enter"
                  style={{ "--nc-enter-i": Math.min(index, 6) } as React.CSSProperties}
                >
                  <InboxItem comment={comment} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
