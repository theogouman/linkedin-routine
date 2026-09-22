"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { resumeQueueAction } from "@/app/actions";
import { relativeTime } from "@/shared/lib/format";

/**
 * Bandeau de coupe-circuit (FR-018).
 *
 * Présent sur tous les écrans d'engagement, et pas seulement dans les
 * réglages : une file suspendue change le sens de chaque geste — commenter ne
 * publiera rien — et l'utilisateur doit le savoir avant d'écrire, pas après.
 */
export function SuspendedBanner({
  reason,
  suspendedAt,
}: {
  reason: string | null;
  suspendedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const resume = () => {
    startTransition(async () => {
      const result = await resumeQueueAction();
      if (result.ok) toast.success(result.message ?? "File reprise.");
      else toast.error(result.message ?? "Reprise impossible.");
    });
  };

  return (
    <div
      className="nc-content-enter mb-4 rounded-[16px] border p-4"
      style={{
        background: "var(--nc-status-noshown-bg)",
        borderColor: "rgba(153, 27, 27, 0.25)",
      }}
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: "#991b1b" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: "#991b1b" }}>
            File de publication suspendue
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "#7f1d1d" }}>
            {reason ?? "Un signal de restriction a été détecté."}
            {suspendedAt ? ` Suspendue ${relativeTime(suspendedAt)}.` : ""} Rien ne
            partira tant que tu n&apos;auras pas repris la file à la main, et jamais
            avant 72 h.
          </p>
          <button
            type="button"
            onClick={resume}
            disabled={pending}
            className="nc-btn nc-btn--ghost nc-btn--sm mt-3"
            style={{ background: "#fff" }}
          >
            {pending ? "Vérification…" : "Tenter la reprise"}
          </button>
        </div>
      </div>
    </div>
  );
}
