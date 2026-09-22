"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { relativeTime } from "@/shared/lib/format";

/** Journal de tout ce qui est parti depuis l'app (FR-016, FR-023). */

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "en attente", className: "nc-badge--neutral" },
  sending: { label: "envoi…", className: "nc-badge--brand" },
  sent: { label: "envoyé", className: "nc-badge--ok" },
  cancelled: { label: "annulé", className: "nc-badge--neutral" },
  failed: { label: "échec", className: "nc-badge--alert" },
};

const ORIGIN_LABEL: Record<string, string> = {
  manual: "manuel",
  ai_edited: "IA éditée",
  ai_unchanged: "IA telle quelle",
};

export function Journal({
  entries,
}: {
  entries: Array<{
    id: string;
    kind: string;
    status: string;
    origin: string;
    body: string | null;
    createdAt: string;
    sentAt: string | null;
    error: string | null;
    targetUrl: string | null;
    targetExcerpt: string | null;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const visible = open ? entries : entries.slice(0, 5);

  return (
    <section className="nc-card nc-content-enter mb-3 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3">
        <h2 className="text-[15px] font-semibold">Journal</h2>
        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          {entries.length} action{entries.length > 1 ? "s" : ""}
        </span>
      </header>

      {entries.length === 0 ? (
        <p className="px-4 pb-5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          Rien n&apos;est encore parti depuis l&apos;app.
        </p>
      ) : (
        <>
          <ul className="divide-y border-t" style={{ borderColor: "var(--color-border-default)" }}>
            {visible.map((entry) => {
              const status = STATUS_LABEL[entry.status] ?? STATUS_LABEL.pending;
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`nc-badge ${status?.className}`}>{status?.label}</span>
                    <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      {ORIGIN_LABEL[entry.origin] ?? entry.origin} ·{" "}
                      {relativeTime(entry.sentAt ?? entry.createdAt)}
                    </span>
                    <div className="flex-1" />
                    {entry.targetUrl ? (
                      <a
                        href={entry.targetUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="shrink-0"
                        aria-label="Ouvrir la cible dans LinkedIn"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        <ExternalLink size={14} aria-hidden />
                      </a>
                    ) : null}
                  </div>
                  {entry.body ? (
                    <p className="mt-1.5 text-[13px] leading-[1.5]">{entry.body}</p>
                  ) : (
                    <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      Like
                    </p>
                  )}
                  {entry.targetExcerpt ? (
                    <p className="mt-1 truncate text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      Sur : {entry.targetExcerpt}
                    </p>
                  ) : null}
                  {entry.error ? (
                    <p className="mt-1 text-[12px]" style={{ color: "var(--color-brand)" }}>
                      {entry.error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {entries.length > 5 ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="w-full border-t py-2.5 text-[13px] font-medium"
              style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
            >
              {open ? "Réduire" : `Voir les ${entries.length} entrées`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
