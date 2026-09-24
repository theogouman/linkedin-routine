"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { refreshNow } from "@/app/actions";
import { MatrixLoader } from "@/shared/motion/MatrixLoader";
import { TooltipGroup } from "@/shared/motion/Tooltip";

/**
 * Filtre par liste + actualisation manuelle (FR-003, FR-004).
 *
 * Le segment glissant vient de transitions.dev (`t-tabs`), thémé avec les
 * tokens Notion Club. La pilule est positionnée en JS à partir des dimensions
 * mesurées : c'est ce qui la fait glisser au lieu de sauter.
 */
export function FeedToolbar({
  lists,
  activeListId,
  showAll,
  lastSyncLabel,
}: {
  lists: Array<{ id: string; name: string; count: number }>;
  activeListId: string | null;
  showAll: boolean;
  lastSyncLabel: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const barRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const firstRender = useRef(true);

  const tabs = [{ id: null, name: "Toutes" }, ...lists.map((l) => ({ id: l.id, name: l.name }))];
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeListId),
  );

  useLayoutEffect(() => {
    const bar = barRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    const target = bar.querySelectorAll<HTMLElement>("[role='tab']")[activeIndex];
    if (!target) return;

    const apply = () => {
      pill.style.width = `${target.offsetWidth}px`;
      pill.style.transform = `translateX(${target.offsetLeft - 3}px)`;
    };

    if (firstRender.current) {
      const saved = pill.style.transition;
      pill.style.transition = "none";
      apply();
      void pill.offsetWidth;
      pill.style.transition = saved;
      firstRender.current = false;
    } else {
      apply();
    }
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex, lists.length]);

  const select = (listId: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (listId) next.set("liste", listId);
    else next.delete("liste");
    router.push(`/fil?${next.toString()}`);
  };

  const toggleScope = () => {
    const next = new URLSearchParams(params.toString());
    if (showAll) next.delete("tout");
    else next.set("tout", "1");
    router.push(`/fil?${next.toString()}`);
  };

  const refresh = () => {
    startTransition(async () => {
      const result = await refreshNow("all");
      if (!result.ok) {
        toast.error(result.message ?? "Actualisation impossible.");
        return;
      }
      const parts: string[] = [];
      if (result.posts) parts.push(`${result.posts} publication${result.posts > 1 ? "s" : ""}`);
      if (result.comments) parts.push(`${result.comments} commentaire${result.comments > 1 ? "s" : ""}`);
      toast.success(parts.length ? `${parts.join(" · ")} récupéré(s).` : "Rien de nouveau.");
      if (result.message) toast.warning(result.message);
      router.refresh();
    });
  };

  return (
    <TooltipGroup className="nc-tt-row mb-1 items-center gap-2">
      <div ref={barRef} className="nc-scroll-x t-tabs min-w-0 flex-1" role="tablist">
        <span ref={pillRef} className="t-tabs-pill" aria-hidden />
        {tabs.map((tab) => (
          <button
            key={tab.id ?? "all"}
            type="button"
            role="tab"
            aria-selected={tab.id === activeListId}
            className="t-tab text-[13px] font-medium"
            onClick={() => select(tab.id)}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={toggleScope}
        className="nc-btn nc-btn--ghost nc-btn--sm shrink-0"
        data-tooltip={showAll ? "N'afficher que les non traitées" : "Afficher aussi les traitées"}
      >
        {showAll ? "À traiter" : "Tout"}
      </button>

      {/* transitions.dev · 31 — le loader matriciel remplace le spinner
          pendant l'actualisation : il tient dans le bouton sans en changer la
          taille, donc la barre ne bouge pas. */}
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="nc-icon-btn shrink-0"
        data-tooltip={`Dernière actualisation : ${lastSyncLabel}`}
        aria-label="Actualiser"
      >
        {pending ? (
          <MatrixLoader variant="orbit" />
        ) : (
          <RefreshCw size={16} aria-hidden />
        )}
      </button>
    </TooltipGroup>
  );
}
