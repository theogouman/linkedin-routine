"use client";

import type { ReactNode } from "react";
import { TextsReveal } from "@/shared/motion/TextsReveal";

/**
 * transitions.dev · 18 — Texts reveal.
 *
 * Un état vide est un moment de lecture, pas un message d'erreur : la montée
 * décalée donne le rythme d'une phrase, titre puis explication.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="nc-card px-6 py-10 text-center">
      <TextsReveal
        lines={[
          <p key="title" className="text-base font-medium">
            {title}
          </p>,
          <p
            key="description"
            className="mx-auto mt-1.5 max-w-xs text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {description}
          </p>,
        ]}
      />
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
