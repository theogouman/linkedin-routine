"use client";

import type { ReactNode } from "react";

/**
 * transitions.dev · 21 — Accordion expand.
 *
 * La hauteur est animée par `grid-template-rows: 0fr → 1fr` : aucune mesure
 * JS, donc un panneau de n'importe quelle taille s'ouvre proprement. Le
 * chevron est retourné en `scaleY(-1)` plutôt que morphé — l'interpolation de
 * `d:` est réservée à Chromium et saute sur l'iPhone, qui est la cible.
 */
export function Accordion({
  open,
  onToggle,
  title,
  meta,
  children,
  headerExtra,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  headerExtra?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`t-acc ${className ?? ""}`} data-open={open}>
      <header className="flex items-center gap-2 p-4">
        <button
          type="button"
          className="t-acc-head flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="t-acc-chevron shrink-0" style={{ color: "var(--color-text-muted)" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 6.5L8 10.5L12 6.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{title}</span>
            {meta ? (
              <span
                className="mt-0.5 block text-[12px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {meta}
              </span>
            ) : null}
          </span>
        </button>
        {headerExtra}
      </header>

      <div className="t-acc-panel">
        {/* Le padding vit sur l'élément intérieur : sur la piste `0fr`, il
            laisserait une bande résiduelle et le panneau ne fermerait jamais. */}
        <div className="t-acc-panel-inner">{children}</div>
      </div>
    </section>
  );
}
