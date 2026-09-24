"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, ExternalLink, ImageDown, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { Avatar } from "@/shared/components/Avatar";
import { Accordion } from "@/shared/motion/Accordion";
import { AvatarGroup } from "@/shared/motion/AvatarGroup";
import { ClearableInput } from "@/shared/motion/ClearableInput";
import { Dropdown } from "@/shared/motion/Dropdown";
import { LearnMoreLink } from "@/shared/motion/LearnMoreLink";
import { MatrixLoader } from "@/shared/motion/MatrixLoader";
import { Modal } from "@/shared/motion/Modal";
import { PlusMorph } from "@/shared/motion/PlusMorph";
import { ErrorMessage, useShake } from "@/shared/motion/ShakeInput";
import { TooltipGroup } from "@/shared/motion/Tooltip";
import {
  addAccountsAction,
  createListAction,
  deleteListAction,
  fetchProfilePhotosAction,
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
 *
 * transitions.dev employé ici :
 *  · 21 (Accordion) + 01 (Card resize) — l'ouverture d'une liste ;
 *  · 20 (Plus to menu morph) — le bouton « créer » devient le formulaire ;
 *  · 11 (Avatar group hover) — la pile de visages d'une liste repliée ;
 *  · 05 (Menu dropdown) + 06 (Modal) — renommer / supprimer, à la place de
 *    `window.prompt` et `window.confirm`, qui affichent le nom d'hôte en PWA
 *    installée et cassent net l'illusion d'application ;
 *  · 13 (Input clear) — l'effacement du champ de nom ;
 *  · 12 (Error shake) — un nom vide ou en doublon ;
 *  · 31 (Matrix loader) — la récupération des photos en cours ;
 *  · 24 (Learn more hover) — les liens qui sortent vers LinkedIn.
 */
export function ListsManager({
  lists,
  accounts,
  missingProfile,
}: {
  lists: ListSummary[];
  accounts: AccountSummary[];
  missingProfile: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [openListId, setOpenListId] = useState<string | null>(lists[0]?.id ?? null);
  const [bulkInput, setBulkInput] = useState("");
  const [rejected, setRejected] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<ListSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<ListSummary | null>(null);
  const [fetchingPhotos, setFetchingPhotos] = useState(false);

  const createShake = useShake();
  const renameShake = useShake();

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
    if (name === "") {
      createShake.shake("Donne un nom à la liste.");
      return;
    }
    startTransition(async () => {
      const result = await createListAction(name);
      if (!result.ok) {
        createShake.shake(result.message ?? "Création impossible.");
        return;
      }
      setNewListName("");
      setCreating(false);
      toast.success(`Liste « ${name} » créée.`);
      router.refresh();
    });
  };

  const renameList = () => {
    const list = renaming;
    const name = renameValue.trim();
    if (!list) return;
    if (name === "" || name === list.name) {
      renameShake.shake("Choisis un nom différent et non vide.");
      return;
    }
    startTransition(async () => {
      const result = await renameListAction(list.id, name);
      if (!result.ok) {
        renameShake.shake(result.message ?? "Renommage impossible.");
        return;
      }
      setRenaming(null);
      toast.success("Liste renommée.");
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

  const fetchPhotos = () => {
    setFetchingPhotos(true);
    startTransition(async () => {
      const result = await fetchProfilePhotosAction();
      setFetchingPhotos(false);
      if (!result.ok) {
        toast.error(result.message ?? "Récupération impossible.");
        return;
      }
      const enriched = result.enriched ?? 0;
      toast.success(
        enriched === 0
          ? "Aucun profil récupéré — réessaie plus tard."
          : `${enriched} profil${enriched > 1 ? "s" : ""} récupéré${enriched > 1 ? "s" : ""}${result.more ? ", il en reste — relance pour le lot suivant." : "."}`,
      );
      router.refresh();
    });
  };

  return (
    <TooltipGroup className="nc-tt-block">
      <div className="flex flex-col gap-3">
        <div className="nc-content-enter flex items-center gap-2">
          <PlusMorph
            open={creating}
            onOpen={() => setCreating(true)}
            openWidth="100%"
            openHeight={52}
            label="Créer une liste"
          >
            <div className={`flex h-full items-center gap-2 p-1.5 ${createShake.wrapClassName}`}>
              <ClearableInput
                value={newListName}
                onChange={setNewListName}
                onEnter={createNewList}
                placeholder="Nom de la nouvelle liste"
                className={`h-[36px] py-0 ${createShake.inputClassName}`}
              />
              <button
                type="button"
                onClick={createNewList}
                disabled={pending}
                className="nc-btn nc-btn--primary nc-btn--sm shrink-0"
              >
                Créer
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewListName("");
                }}
                className="nc-icon-btn shrink-0"
                aria-label="Annuler"
                data-tooltip="Annuler"
              >
                <X size={15} aria-hidden />
              </button>
            </div>
          </PlusMorph>

          <div className="flex-1" />

          {missingProfile > 0 ? (
            <button
              type="button"
              onClick={fetchPhotos}
              disabled={pending || fetchingPhotos}
              className="nc-btn nc-btn--ghost nc-btn--sm shrink-0"
              data-tooltip={`${missingProfile} compte${missingProfile > 1 ? "s" : ""} sans photo ni nom`}
            >
              {fetchingPhotos ? (
                <MatrixLoader variant="orbit" />
              ) : (
                <ImageDown size={15} aria-hidden />
              )}
              {fetchingPhotos ? "Récupération…" : `Photos (${missingProfile})`}
            </button>
          ) : null}
        </div>

        {lists.map((list) => {
          const open = openListId === list.id;
          const members = accounts.filter((account) => account.listIds.includes(list.id));

          return (
            <Accordion
              key={list.id}
              className="nc-card nc-content-enter t-resize overflow-hidden"
              open={open}
              onToggle={() => setOpenListId(open ? null : list.id)}
              title={list.name}
              meta={`${list.accountCount} compte${list.accountCount > 1 ? "s" : ""}${
                list.restrictedCount > 0
                  ? ` · ${list.restrictedCount} non récupérable${list.restrictedCount > 1 ? "s" : ""}`
                  : ""
              }`}
              headerExtra={
                <div className="flex shrink-0 items-center gap-2">
                  {/* La pile de visages n'a de sens que liste repliée : ouverte,
                      les mêmes comptes sont listés juste en dessous. */}
                  {!open && members.length > 0 ? (
                    <AvatarGroup
                      className="hidden sm:flex"
                      items={members.slice(0, 5).map((account) => (
                        <Avatar
                          key={account.id}
                          src={account.avatarUrl}
                          name={account.name ?? account.publicIdentifier}
                          size={26}
                        />
                      ))}
                    />
                  ) : null}

                  <Dropdown
                    label={`Actions sur ${list.name}`}
                    origin="top-right"
                    trigger={({ toggle, open: menuOpen }) => (
                      <button
                        type="button"
                        className="nc-icon-btn"
                        onClick={toggle}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-label={`Actions sur ${list.name}`}
                        data-tooltip="Renommer ou supprimer"
                      >
                        <MoreHorizontal size={16} aria-hidden />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          className="nc-menu-item"
                          onClick={() => {
                            close();
                            setRenameValue(list.name);
                            setRenaming(list);
                          }}
                        >
                          <Pencil size={14} aria-hidden />
                          Renommer
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="nc-menu-item nc-menu-item--danger"
                          onClick={() => {
                            close();
                            setDeleting(list);
                          }}
                        >
                          <Trash2 size={14} aria-hidden />
                          Supprimer
                        </button>
                      </>
                    )}
                  </Dropdown>
                </div>
              }
            >
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
                        <Avatar
                          src={account.avatarUrl}
                          name={account.name ?? account.publicIdentifier}
                          size={34}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium">
                            {account.name ?? account.publicIdentifier ?? account.profileUrl}
                          </p>
                          <p
                            className="mt-0.5 flex items-center gap-1.5 text-[12px]"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            <span className={`nc-badge ${state.className}`}>{state.label}</span>
                            <span>
                              {account.postCount} publication{account.postCount > 1 ? "s" : ""}
                            </span>
                          </p>
                          {account.fetchState === "restricted" && account.fetchError ? (
                            <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                              {account.fetchError.slice(0, 120)}
                            </p>
                          ) : null}
                        </div>
                        <LearnMoreLink
                          href={account.profileUrl}
                          className="nc-icon-btn"
                          icon={<ExternalLink size={14} aria-hidden />}
                        >
                          <span className="sr-only">Ouvrir le profil</span>
                        </LearnMoreLink>
                        <button
                          type="button"
                          className="nc-icon-btn"
                          disabled={pending}
                          onClick={() => run(() => removeAccountAction(list.id, account.id), "Compte retiré.")}
                          aria-label="Retirer de la liste"
                          data-tooltip="Retirer de la liste"
                        >
                          <X size={15} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Accordion>
          );
        })}
      </div>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Renommer la liste"
        footer={
          <>
            <button type="button" className="nc-btn nc-btn--ghost nc-btn--sm" onClick={() => setRenaming(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="nc-btn nc-btn--primary nc-btn--sm"
              disabled={pending}
              onClick={renameList}
            >
              Renommer
            </button>
          </>
        }
      >
        <div className={renameShake.wrapClassName}>
          <ClearableInput
            value={renameValue}
            onChange={setRenameValue}
            onEnter={renameList}
            placeholder="Nom de la liste"
            className={renameShake.inputClassName}
          />
          <ErrorMessage>{renameShake.error}</ErrorMessage>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Supprimer « ${deleting?.name ?? ""} » ?`}
        footer={
          <>
            <button type="button" className="nc-btn nc-btn--ghost nc-btn--sm" onClick={() => setDeleting(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="nc-btn nc-btn--brand nc-btn--sm"
              disabled={pending}
              onClick={() => {
                const list = deleting;
                if (!list) return;
                setDeleting(null);
                run(() => deleteListAction(list.id), "Liste supprimée.");
              }}
            >
              Supprimer
            </button>
          </>
        }
      >
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          Les publications déjà récupérées restent en base ; seuls les rattachements disparaissent.
        </p>
      </Modal>
    </TooltipGroup>
  );
}
