import { getAccounts, getLists } from "@/modules/lists/server/repository";
import { PageHeader } from "@/shared/components/PageHeader";
import { EmptyState } from "@/shared/components/EmptyState";
import { ListsManager } from "./ListsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Listes — Routine" };

/** Curation des comptes suivis (US-1, FR-001, FR-002). */
export default async function ListsPage() {
  const [lists, accounts] = await Promise.all([getLists(), getAccounts()]);

  const restricted = accounts.filter((account) => account.fetch_state === "restricted").length;

  return (
    <>
      <PageHeader
        title="Listes"
        subtitle={
          lists.length === 0
            ? "Aucune liste"
            : `${lists.length} liste${lists.length > 1 ? "s" : ""} · ${accounts.length} compte${accounts.length > 1 ? "s" : ""}${restricted > 0 ? ` · ${restricted} non récupérable${restricted > 1 ? "s" : ""}` : ""}`
        }
      />

      <ListsManager
        lists={lists.map((list) => ({
          id: list.id,
          name: list.name,
          accountCount: list.accountCount,
          restrictedCount: list.restrictedCount,
        }))}
        accounts={accounts.map((account) => ({
          id: account.id,
          name: account.name,
          profileUrl: account.profile_url,
          publicIdentifier: account.public_identifier,
          avatarUrl: account.avatar_url,
          fetchState: account.fetch_state,
          fetchError: account.fetch_error,
          postCount: account.postCount,
          listIds: account.listIds,
        }))}
      />

      {lists.length === 0 ? (
        <EmptyState
          title="Commence par une liste"
          description="Une liste définit ton périmètre d'attention : ce qui n'y est pas n'apparaîtra jamais dans le fil."
        />
      ) : null}
    </>
  );
}
