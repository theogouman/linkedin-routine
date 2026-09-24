"use client";

import type { ReactNode } from "react";

/**
 * transitions.dev · 09 — Icon swap.
 *
 * Les deux icônes occupent la même cellule de grille : aucun décalage de
 * layout pendant le fondu. Sert partout où un bouton change d'état sans
 * changer de place (liker, actualiser, publier).
 */
export function IconSwap({
  state,
  a,
  b,
  className,
}: {
  state: "a" | "b";
  a: ReactNode;
  b: ReactNode;
  className?: string;
}) {
  return (
    <span className={`t-icon-swap ${className ?? ""}`} data-state={state}>
      <span className="t-icon" data-icon="a">
        {a}
      </span>
      <span className="t-icon" data-icon="b">
        {b}
      </span>
    </span>
  );
}
