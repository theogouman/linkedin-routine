"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { motionEase, motionNumber } from "./tokens";

/**
 * transitions.dev · 11 — Avatar group hover.
 *
 * Le survol soulève l'élément pointé et, en atténuation, ses voisins. Le
 * `transition-timing-function` est écrit EN LIGNE avant de changer les
 * variables : le navigateur applique la courbe en vigueur à l'instant où la
 * propriété change, c'est ce qui donne une montée douce et un retour ressort
 * sans deux déclarations de transition concurrentes.
 */
export function AvatarGroup({
  items,
  className,
}: {
  items: ReactNode[];
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const setShifts = useCallback((activeIndex: number | null, phase: "in" | "out") => {
    const root = rootRef.current;
    if (!root) return;

    const lift = motionNumber("--avatar-lift", -4);
    const falloff = motionNumber("--avatar-falloff", 0.45);
    const scale = motionNumber("--avatar-scale", 1.05);
    const timing =
      phase === "out"
        ? motionEase("--avatar-ease-out", "cubic-bezier(0.34, 3.85, 0.64, 1)")
        : motionEase("--avatar-ease-in", "cubic-bezier(0.22, 1, 0.36, 1)");

    root.querySelectorAll<HTMLElement>(".t-avatar").forEach((element, index) => {
      element.style.transitionTimingFunction = timing;
      if (activeIndex === null) {
        element.style.setProperty("--shift", "0px");
        element.style.setProperty("--scale-active", "1");
        return;
      }
      const distance = Math.abs(index - activeIndex);
      element.style.setProperty("--shift", `${(lift * falloff ** distance).toFixed(3)}px`);
      element.style.setProperty("--scale-active", index === activeIndex ? String(scale) : "1");
    });
  }, []);

  return (
    <div
      ref={rootRef}
      className={`flex items-center ${className ?? ""}`}
      onMouseLeave={() => setShifts(null, "out")}
    >
      {items.map((node, index) => (
        <div
          key={index}
          className="t-avatar"
          style={{ marginLeft: index === 0 ? 0 : -10, zIndex: items.length - index }}
          onMouseEnter={() => setShifts(index, "in")}
        >
          {node}
        </div>
      ))}
    </div>
  );
}
