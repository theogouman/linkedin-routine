"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { Avatar } from "@/shared/components/Avatar";
import {
  addAccountsAction,
  createListAction,
  deleteListAction,
  removeAccountAction,
  renameListAction,
} from "@/app/actions";

export interface ListSummary {
  id: string;
  name: string;
  accountCount: number;
  restrictedCount: number;
}

export interface AccountSummary {
  id: string;
  name: string | null;
  profileUrl: string;
  publicIdentifier: string | null;
  avatarUrl: string | null;
  fetchState: "pending" | "ok" | "restricted";
  fetchError: string | null;
  postCount: number;
  listIds: string[];
}

const STATE_LABEL: Record<AccountSummary["fetchState"], { label: string; className: string }> = {
  pending: { label: "en attente", className: "nc-badge--neutral" },
  ok: { label: "actif", className: "nc-badge--ok" },
  restricted: { label: "non récupérable", className: "nc-badge--alert" },
};

/**
 * Gestion des listes et des comptes (FR-001, FR-002).
 *
 * Tout tient sur un écran : créer, renommer, supprimer une liste, y coller un
 * paquet d'URLs, retirer un compte. Le collage en masse est l'usage normal —
 * on constitue une liste de cinquante créateurs en une fois, pas un par un.
 */
export function ListsManager({
  lists,
  accounts,
}: {
  lists: ListSummary[];
  accounts: AccountSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newListName, setNewListName] = useState("");
  const [openListId, setOpenListId] = useState<string | null>(lists[0]?.id ?? null);
  const [bulkInput, setBulkInput] = useState("");
  const [rejected, setRejected] = useState<string[]>([]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "Action impossible.");
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  };

  const createNewList = () => {
    const name = newListName.trim();
    if (name === "") return;
    startTransition(async () => {
      const result = await createListAction(name);
      if (!result.ok) {
        toast.error(result.message ?? "Création impossible.");
        return;
      }
      setNewListName("");
      toast.success(`Liste « ${name} » créée.`);
      router.refresh();
    });
  };

  const addAccounts = (listId: string) => {
    const raw = bulkInput.trim();
    if (raw === "") return;
    startTransition(async () => {
      const result = await addAccountsAction(listId, raw);
      if (!result.ok) {
        toast.error(result.message ?? "Ajout impossible.");
        return;
      }
      setBulkInput("");
      setRejected(result.rejected ?? []);
      const added = result.added ?? 0;
      const already = result.alreadyPresent ?? 0;
      toast.success(
        added === 0
          ? "Aucun nouveau compte — tout était déjà dans la liste."
          : `${added} compte${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}${already > 0 ? `, ${already} déjà présent${already > 1 ? "s" : ""}` : ""}.`,
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="nc-card nc-content-enter flex items-center gap-2 p-3">
        <input
          value={newListName}
          onChange={(event) => setNewListName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") createNewList();
          }}
          placeholder="Nom d'une nouvelle liste"
          className="nc-input"
        />
        <button
          type="button"
          onClick={createNewList}
          disabled={pending || newListName.trim() === ""}
          className="nc-btn nc-btn--primary nc-btn--sm shrink-0"
        >
          <Plus size={15} aria-hidden />
          Créer
        </button>
      </div>

      {lists.map((list, index) => {
        const open = openListId === list.id;
        const members = accounts.filter((account) => account.listIds.includes(list.id));

        return (
          <section
            key={list.id}
            className="nc-card nc-content-enter overflow-hidden"
            style={{ "--nc-enter-i": Math.min(index + 1, 6) } as React.CSSProperties}
          >
            <header className="flex items-center gap-2 p-4">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setOpenListId(open ? null : list.id)}
                aria-expanded={open}
              >
                <p className="truncate text-[15px] font-semibold">{list.name}</p>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  {list.accountCount} compte{list.accountCount > 1 ? "s" : ""}
                  {list.restrictedCount > 0 ? ` · ${list.restrictedCount} non récupérable${list.restrictedCount > 1 ? "s" : ""}` : ""}
                </p>
              </button>

              <button
                type="button"
                className="nc-icon-btn"
                disabled={pending}
                onClick={() => {
                  const name = window.prompt("Nouveau nom de la liste", list.name);
                  if (name && name.trim() !== "" && name !== list.name) {
                    run(() => renameListAction(list.id, name), "Liste renommée.");
                  }
                }}
                aria-label={`Renommer ${list.name}`}
                title="Renommer"
              >
                <span className="text-[13px] font-semibold">Aa</span>
              </button>

              <button
                type="button"
                className="nc-icon-btn"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Supprimer « ${list.name} » ? Les publications déjà récupérées restent en base, seuls les rattachements disparaissent.`,
                    )
                  ) {
                    run(() => deleteListAction(list.id), "Liste supprimée.");
                  }
                }}
                aria-label={`Supprimer ${list.name}`}
                title="Supprimer la liste"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </header>

            {open ? (
              <div className="border-t px-4 py-3" style={{ borderColor: "var(--color-border-default)" }}>
                <label className="text-[13px] font-medium" htmlFor={`bulk-${list.id}`}>
                  Ajouter des comptes
                </label>
                <textarea
                  id={`bulk-${list.id}`}
                  value={bulkInput}
                  onChange={(event) => setBulkInput(event.target.value)}
                  placeholder={"https://www.linkedin.com/in/prenom-nom\nUne URL par ligne, ou collées d'un coup"}
                  rows={3}
                  className="nc-input mt-1.5 resize-none"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addAccounts(list.id)}
                    disabled={pending || bulkInput.trim() === ""}
                    className="nc-btn nc-btn--primary nc-btn--sm"
                  >
                    Ajouter
                  </button>
                  <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                    URLs ou identifiants, séparés par des sauts de ligne, virgules ou espaces.
                  </p>
                </div>

                {rejected.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1">
                    {rejected.map((entry) => (
                      <li
                        key={entry}
                        className="flex items-start gap-1.5 text-[12px]"
                        style={{ color: "var(--color-brand)" }}
                      >
                        <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
                        <span className="break-all">{entry}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <ul className="mt-4 flex flex-col divide-y" style={{ borderColor: "var(--color-border-default)" }}>
                  {members.length === 0 ? (
                    <li className="py-3 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                      Liste vide.
                    </li>
                  ) : null}
                  {members.map((account) => {
                    const state = STATE_LABEL[account.fetchState];
                    return (
                      <li key={account.id} className="flex items-center gap-3 py-2.5">
                        <Avatar src={account.avatarUrl} name={account.name ?? account.publicIdentifier} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium">
                            {account.name ?? account.publicIdentifier ?? account.profileUrl}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                            <span className={`nc-badge ${state.className}`}>{state.label}</span>
                            <span>{account.postCount} publication{account.postCount > 1 ? "s" : ""}</span>
                          </p>
                          {account.fetchState === "restricted" && account.fetchError ? (
                            <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                              {account.fetchError.slice(0, 120)}
                            </p>
                          ) : null}
                        </div>
                        <a
                          href={account.profileUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="nc-icon-btn"
                          aria-label="Ouvrir le profil"
                        >
                          <ExternalLink size={14} aria-hidden />
                        </a>
                        <button
                          type="button"
                          className="nc-icon-btn"
                          disabled={pending}
                          onClick={() => run(() => removeAccountAction(list.id, account.id), "Compte retiré.")}
                          aria-label="Retirer de la liste"
                        >
                          <X size={15} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
