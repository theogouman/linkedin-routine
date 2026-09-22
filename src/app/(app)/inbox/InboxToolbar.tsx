"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { refreshNow } from "@/app/actions";

export function InboxToolbar({ showAll }: { showAll: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      const result = await refreshNow("comments");
      if (!result.ok) {
        toast.error(result.message ?? "Actualisation impossible.");
        return;
      }
      toast.success(
        result.comments
          ? `${result.comments} commentaire${result.comments > 1 ? "s" : ""} récupéré(s).`
          : "Rien de nouveau.",
      );
      router.refresh();
    });
  };

  return (
    <div className="mb-1 flex items-center gap-2">
      <button
        type="button"
        onClick={() => router.push(showAll ? "/inbox" : "/inbox?tout=1")}
        className="nc-btn nc-btn--ghost nc-btn--sm"
      >
        {showAll ? "À traiter" : "Tout"}
      </button>
      <div className="flex-1" />
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="nc-icon-btn"
        aria-label="Actualiser les commentaires reçus"
      >
        <RefreshCw size={16} className={pending ? "animate-spin" : undefined} aria-hidden />
      </button>
    </div>
  );
}
