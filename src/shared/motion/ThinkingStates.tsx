"use client";

import { useEffect, useRef } from "react";
import { motionMs, prefersReducedMotion } from "./tokens";

/**
 * transitions.dev · 28 — Thinking states.
 *
 * Une ligne d'état qui chatoie pendant qu'elle tient, puis cède la place à la
 * suivante. Branché sur la génération assistée : « je lis le process », « je
 * rédige », « je relis » dit quelque chose de vrai sur ce qui se passe, là où
 * un « Génération… » figé ne dit rien.
 *
 * Le `sizer` caché tient la largeur de la boîte : les deux lignes sont en
 * position absolue et animent simultanément par-dessus.
 */
export function ThinkingStates({
  states,
  className,
}: {
  states: string[];
  className?: string;
}) {
  const boxRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const first = states[0];
    if (!box || first === undefined || states.length < 2) return;
    if (prefersReducedMotion()) return;

    let live = box.querySelector<HTMLSpanElement>(".t-think-text");
    if (!live) return;
    let index = 0;
    let cancelled = false;
    const timers = new Set<number>();

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!cancelled) fn();
      }, ms);
      timers.add(id);
    };

    const cycle = () => {
      later(() => {
        const swap = motionMs("--think-swap", 150);
        const gap = motionMs("--think-gap", 50);
        const leaving = live;
        index = (index + 1) % states.length;
        const label = states[index] ?? "";

        leaving?.classList.add("is-exit");

        const next = document.createElement("span");
        next.className = "t-think-text is-enter-start";
        next.textContent = label;
        next.setAttribute("data-text", label);
        box.appendChild(next);
        live = next;

        const release = () => {
          void next.offsetWidth;
          next.classList.remove("is-enter-start");
        };
        if (gap > 0) later(release, gap);
        else release();

        later(() => {
          leaving?.remove();
          cycle();
        }, swap + gap);
      }, motionMs("--think-hold", 2000));
    };

    cycle();
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [states]);

  const longest = states.reduce((a, b) => (b.length > a.length ? b : a), states[0] ?? "");
  const first = states[0] ?? "";

  return (
    <span ref={boxRef} className={`t-think ${className ?? ""}`}>
      <span className="t-think-sizer">{longest}</span>
      <span className="t-think-text" data-text={first}>
        {first}
      </span>
    </span>
  );
}
