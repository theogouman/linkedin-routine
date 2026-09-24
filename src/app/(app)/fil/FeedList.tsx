"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import type { FeedPost } from "@/modules/feed/server/repository";
import { InlineToast } from "@/shared/motion/InlineToast";
import { PostCard } from "./PostCard";
import { removeCreatorAction, restoreCreatorAction } from "@/app/actions";

/**
 * Le feed, côté client.
 *
 * Il existe pour une raison précise : « Supprimer le créateur » n'est pas une
 * action de carte. Elle retire TOUTES les publications de ce créateur, et elle
 * doit rester annulable cinq secondes — deux choses qu'une carte, qui ne
 * connaît qu'elle-même et disparaît en premier, ne peut pas porter.
 */
const UNDO_MS = 5000;

interface PendingRemoval {
  accountId: string;
  name: string;
  listIds: string[];
}

export function FeedList({
  posts,
  lists,
  showListBadges,
}: {
  posts: FeedPost[];
  lists: Array<{ id: string; name: string }>;
  showListBadges: boolean;
}) {
  const router = useRouter();
  const [hiddenAccounts, setHiddenAccounts] = useState<string[]>([]);
  const [removal, setRemoval] = useState<PendingRemoval | null>(null);
  const [, startTransition] = useTransition();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const remove = (accountId: string | null) => {
    if (accountId === null) return;
    const name =
      posts.find((post) => post.account_id === accountId)?.author_name ?? "Ce créateur";

    // Masquage immédiat, suppression réelle dans la foulée : le bandeau n'est
    // pas un délai avant d'agir, c'est une annulation après coup. Attendre
    // cinq secondes pour écrire laisserait un état incohérent si l'onglet se
    // ferme entre-temps.
    setHiddenAccounts((current) => [...current, accountId]);

    startTransition(async () => {
      const result = await removeCreatorAction(accountId);
      if (!result.ok) {
        setHiddenAccounts((current) => current.filter((id) => id !== accountId));
        toast.error(result.message ?? "Suppression impossible.");
        return;
      }
      setRemoval({ accountId, name, listIds: result.previousListIds ?? [] });
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setRemoval(null);
        router.refresh();
      }, UNDO_MS);
    });
  };

  const undo = () => {
    const pendingRemoval = removal;
    if (!pendingRemoval) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    setRemoval(null);
    setHiddenAccounts((current) =>
      current.filter((id) => id !== pendingRemoval.accountId),
    );
    startTransition(async () => {
      const result = await restoreCreatorAction(
        pendingRemoval.accountId,
        pendingRemoval.listIds,
      );
      if (!result.ok) {
        toast.error(result.message ?? "Restauration impossible.");
        return;
      }
      toast.success(`${pendingRemoval.name} est de retour dans ses listes.`);
      router.refresh();
    });
  };

  const visible = posts.filter(
    (post) => post.account_id === null || !hiddenAccounts.includes(post.account_id),
  );

  return (
    <>
      <ul className="mt-4 flex flex-col gap-3">
        {visible.map((post, index) => (
          <li
            key={post.id}
            className="nc-content-enter"
            style={{ "--nc-enter-i": Math.min(index, 6) } as React.CSSProperties}
          >
            <PostCard
              post={post}
              lists={lists}
              showListBadges={showListBadges}
              onRemoved={remove}
            />
          </li>
        ))}
      </ul>

      {/* transitions.dev · 22 — le bandeau monte depuis le bas et s'efface de
          lui-même. Cinq secondes : le temps de réaliser qu'on s'est trompé,
          pas le temps d'oublier qu'on peut revenir. */}
      <div className="nc-undo-slot">
        <InlineToast shown={removal !== null}>
          <div className="nc-undo-banner">
            <span className="min-w-0 flex-1 truncate">
              {removal?.name} retiré de {removal?.listIds.length ?? 0} liste
              {(removal?.listIds.length ?? 0) > 1 ? "s" : ""}.
            </span>
            <button type="button" onClick={undo} className="nc-undo-action">
              <Undo2 size={14} aria-hidden />
              Annuler
            </button>
          </div>
        </InlineToast>
      </div>
    </>
  );
}
