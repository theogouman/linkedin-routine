"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "./tokens";

/**
 * animate-text · `scale-down-fade` (pixel-point/animate-text).
 *
 * Reprise exacte de la spec : entrée 520 ms depuis `opacity 0 / y 8 / scale
 * 1.04`, sortie 380 ms vers `opacity 0 / y -8 / scale 0.94`, courbes
 * `cubic-bezier(0.22, 1, 0.36, 1)` et `cubic-bezier(0.64, 0, 0.78, 0)`,
 * micro-délai de 20 ms entre les deux.
 *
 * Les facteurs de parité du site sont appliqués — durées × 0,72 et course
 * verticale × 0,58 — parce que la spec les désigne explicitement comme
 * affectant « matériellement » le rythme perçu : sans eux l'animation est
 * correcte sur le papier et molle à l'écran.
 *
 * Cible `whole` : le libellé entier est une seule unité animée, pas un
 * découpage par mot. La spec le dit, et découper « À commenter » en deux
 * ferait un effet de machine à écrire là où il faut un basculement.
 */
const SPEED = 0.72;
const Y_TRAVEL = 0.58;

const ENTER = {
  duration: Math.round(520 * SPEED),
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  fromY: 8 * Y_TRAVEL,
  fromScale: 1.04,
};
const EXIT = {
  duration: Math.round(380 * SPEED),
  easing: "cubic-bezier(0.64, 0, 0.78, 0)",
  toY: -8 * Y_TRAVEL,
  toScale: 0.94,
};
const MICRO_DELAY = 20;

export function ScaleDownFade({
  /** Change de valeur = déclenche la bascule. */
  swapKey,
  children,
  className,
}: {
  swapKey: string;
  children: ReactNode;
  className?: string;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState({ key: swapKey, node: children });
  const busy = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || swapKey === shown.key) return;

    if (prefersReducedMotion()) {
      const frame = window.requestAnimationFrame(() =>
        setShown({ key: swapKey, node: children }),
      );
      return () => window.cancelAnimationFrame(frame);
    }

    let cancelled = false;
    busy.current = true;

    const exit = host.animate(
      [
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
        {
          opacity: 0,
          transform: `translate3d(0, ${EXIT.toY}px, 0) scale(${EXIT.toScale})`,
        },
      ],
      { duration: EXIT.duration, easing: EXIT.easing, fill: "forwards" },
    );

    void exit.finished
      .then(() => new Promise((resolve) => window.setTimeout(resolve, MICRO_DELAY)))
      .then(() => {
        if (cancelled) return;
        setShown({ key: swapKey, node: children });
        host.animate(
          [
            {
              opacity: 0,
              transform: `translate3d(0, ${ENTER.fromY}px, 0) scale(${ENTER.fromScale})`,
            },
            { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
          ],
          { duration: ENTER.duration, easing: ENTER.easing, fill: "forwards" },
        );
        busy.current = false;
      })
      .catch(() => {
        busy.current = false;
      });

    return () => {
      cancelled = true;
      exit.cancel();
    };
  }, [swapKey, shown.key, children]);

  return (
    <span
      ref={hostRef}
      className={`inline-flex items-center gap-1.5 ${className ?? ""}`}
      style={{ transformOrigin: "50% 55%", backfaceVisibility: "hidden", willChange: "transform, opacity" }}
    >
      {shown.node}
    </span>
  );
}
