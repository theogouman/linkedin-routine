"use client";

import type { ReactNode } from "react";
import { TextsReveal } from "@/shared/motion/TextsReveal";
import { TextSwap } from "@/shared/motion/TextSwap";

/**
 * En-tête d'écran.
 *
 * transitions.dev · 18 (Texts reveal) — le titre monte, la ligne de service
 * suit avec un décalage : l'œil se pose sur « Fil » avant de lire « 12 à
 * traiter ».
 *
 * transitions.dev · 04 (Text states swap) — quand ce compte change sans que la
 * page soit rechargée (on vient de traiter une publication), la ligne est
 * échangée en place plutôt que remplacée d'un coup. C'est la même information
 * qui évolue, pas une nouvelle qui arrive.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <TextsReveal
          lines={[
            <h1 key="title" className="text-[22px] font-semibold tracking-tight">
              {title}
            </h1>,
            subtitle !== undefined ? (
              <span
                key="subtitle"
                className="mt-0.5 block text-[13px]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {typeof subtitle === "string" ? <TextSwap>{subtitle}</TextSwap> : subtitle}
              </span>
            ) : undefined,
          ]}
        />
      </div>
      {action}
    </header>
  );
}
