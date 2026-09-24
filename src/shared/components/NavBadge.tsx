"use client";

import { NumberPop } from "@/shared/motion/NumberPop";

/**
 * transitions.dev · 03 (Notification badge) + 02 (Number pop-in).
 *
 * La pastille glisse en diagonale et éclot quand elle apparaît ; le chiffre
 * re-rentre quand il change. Les deux transitions sont empilées parce qu'elles
 * répondent à deux événements différents : « il y a maintenant quelque chose à
 * traiter » et « il y en a un de plus ».
 *
 * Rendu avec `data-open="false"` quand le compte est nul, jamais démonté : une
 * pastille retirée du DOM ne peut pas jouer sa fermeture.
 */
export function NavBadge({ count }: { count: number }) {
  return (
    <span className="t-badge" data-open={count > 0} aria-hidden>
      <span className="t-badge-dot nc-nav-count">
        {count > 99 ? "99+" : <NumberPop value={count} />}
      </span>
    </span>
  );
}
