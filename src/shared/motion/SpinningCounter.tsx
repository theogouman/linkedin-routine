"use client";

import { useEffect, useRef } from "react";
import { motionEase, motionMs, motionNumber, prefersReducedMotion } from "./tokens";

/**
 * transitions.dev · 26 — Spinning counter.
 *
 * Des rouleaux de machine à sous, une colonne par chiffre, décalés. Réservé
 * aux compteurs de consommation des plafonds : c'est le seul nombre de l'app
 * dont la variation mérite d'être regardée.
 *
 * Le flou de vitesse du snippet original passe par un `feGaussianBlur`
 * directionnel. On le rend en `blur()` CSS ramené à zéro en fin de course :
 * le flou CSS bave aussi horizontalement, mais sur des chiffres de 13 px la
 * différence est invisible et cela évite un filtre SVG par colonne.
 */
export function SpinningCounter({
  value,
  cell = 18,
  className,
}: {
  value: number;
  cell?: number;
  className?: string;
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const previous = useRef<string | null>(null);
  const digits = String(Math.max(0, Math.round(value)));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const strips = Array.from(root.querySelectorAll<HTMLElement>(".t-reel-strip"));
    const land = (strip: HTMLElement, digit: number) => {
      strip.style.transform = `translateY(-${digit * cell}px)`;
    };

    if (previous.current === digits || prefersReducedMotion()) {
      strips.forEach((strip, index) => {
        strip.style.transition = "none";
        land(strip, Number(digits[index] ?? 0));
      });
      previous.current = digits;
      return;
    }

    const duration = motionMs("--reel-dur", 1400);
    const stagger = motionMs("--reel-stagger", 90);
    const ease = motionEase("--reel-ease", "cubic-bezier(0.16, 1, 0.3, 1)");
    const blur = motionNumber("--reel-spin-blur", 3);
    const timers: number[] = [];

    strips.forEach((strip, index) => {
      const digit = Number(digits[index] ?? 0);
      strip.style.transition = "none";
      strip.style.transform = "translateY(0px)";
      void strip.offsetHeight;
      strip.style.transition = `transform ${duration}ms ${ease} ${index * stagger}ms, filter ${duration}ms ${ease} ${index * stagger}ms`;
      strip.style.filter = `blur(${blur}px)`;
      // Le rouleau fait deux tours complets avant de se poser : sans les tours,
      // un 3 → 4 glisse d'un cran et ne se lit pas comme un compteur.
      strip.style.transform = `translateY(-${(20 + digit) * cell}px)`;
      timers.push(
        window.setTimeout(() => {
          strip.style.filter = "blur(0px)";
          strip.style.transition = "none";
          land(strip, digit);
        }, duration + index * stagger),
      );
    });

    previous.current = digits;
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [digits, cell]);

  return (
    <span
      ref={rootRef}
      className={`t-reel ${className ?? ""}`}
      style={{ ["--reel-cell" as string]: `${cell}px` } as React.CSSProperties}
      aria-label={digits}
    >
      {digits.split("").map((_, column) => (
        <span key={column} className="t-reel-col" aria-hidden>
          <span className="t-reel-strip">
            {/* Trois tours de 0-9 : deux consommés par l'élan, le dernier
                porte le chiffre d'arrivée. */}
            {Array.from({ length: 30 }, (_, index) => (
              <span key={index} className="t-reel-digit">
                {index % 10}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
