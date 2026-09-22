"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Heart, MessageSquare, Reply, X } from "lucide-react";
import { cancelQueuedAction } from "@/app/actions";
import { scheduledLabel } from "@/shared/lib/format";

/**
 * File d'envoi visible et annulable (FR-017).
 *
 * L'utilisateur doit voir ce qui va partir AVANT que ça parte : c'est la
 * contrepartie d'un envoi différé. Une file invisible serait vécue comme une
 * perte de contrôle sur son propre compte.
 */

const ICONS = { comment: MessageSquare, reply: Reply, like: Heart };
const LABELS = { comment: "Commentaire", reply: "Réponse", like: "Like" };

export function QueueList({
  actions,
  caps,
  used,
  timezone,
}: {
  actions: Array<{
    id: string;
    kind: "comment" | "reply" | "like";
    body: string | null;
    scheduledFor: string;
    origin: string;
  }>;
  caps: { comments: number; likes: number; total: number; factor: number };
  used: { comments: number; likes: number; total: number };
  timezone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const cancel = (id: string) => {
    startTransition(async () => {
      const result = await cancelQueuedAction(id);
      if (result.ok) toast.success("Action annulée — rien ne partira.");
      else toast.error(result.message ?? "Annulation impossible.");
      router.refresh();
    });
  };

  return (
    <section className="nc-card nc-content-enter mb-3 overflow-hidden">
      <div className="grid grid-cols-3 border-b" style={{ borderColor: "var(--color-border-default)" }}>
        <Gauge label="Commentaires" used={used.comments} cap={caps.comments} />
        <Gauge label="Likes" used={used.likes} cap={caps.likes} />
        <Gauge label="Total" used={used.total} cap={caps.total} />
      </div>

      {actions.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          Rien en attente.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--color-border-default)" }}>
          {actions.map((action) => {
            const Icon = ICONS[action.kind];
            return (
              <li key={action.id} className="flex items-start gap-3 px-4 py-3">
                <Icon size={16} className="mt-1 shrink-0" style={{ color: "var(--color-text-muted)" }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {LABELS[action.kind]} · envoi {scheduledLabel(action.scheduledFor, new Date(), timezone)}
                    {action.origin !== "manual" ? (
                      <span className="nc-badge nc-badge--neutral ml-2">IA</span>
                    ) : null}
                  </p>
                  {action.body ? (
                    <p className="mt-1 line-clamp-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      {action.body}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="nc-icon-btn shrink-0"
                  disabled={pending}
                  onClick={() => cancel(action.id)}
                  aria-label="Annuler cet envoi"
                  title="Annuler"
                >
                  <X size={15} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Gauge({ label, used, cap }: { label: string; used: number; cap: number }) {
  const ratio = cap === 0 ? 0 : Math.min(1, used / cap);
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
        {used}
        <span style={{ color: "var(--color-text-muted)" }}> / {cap}</span>
      </p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: "var(--color-surface-raised)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${ratio * 100}%`,
            background: ratio >= 1 ? "var(--color-brand)" : "var(--color-text-secondary)",
          }}
        />
      </div>
    </div>
  );
}
