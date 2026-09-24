"use client";

import { useMemo } from "react";
import { motionMs } from "./tokens";

/**
 * transitions.dev · 31 — Matrix dot loader.
 *
 * Une matrice 4×4 qui pulse. Sert d'indicateur d'actualisation en cours : plus
 * discret qu'un spinner, et il tient dans la barre sans pousser le contenu.
 */
const CORNERS = [0, 3, 12, 15];
const RING = [1, 2, 7, 11, 14, 13, 8, 4];
const INNER = [5, 6, 9, 10];
const TWINKLE = [7, 2, 11, 5, 14, 9, 0, 12, 3, 15, 6, 10, 13, 1, 8, 4];

export type MatrixVariant = "scan" | "twinkle" | "orbit" | "pulse";

export function MatrixLoader({
  variant = "scan",
  rounded = true,
  className,
}: {
  variant?: MatrixVariant;
  rounded?: boolean;
  className?: string;
}) {
  const dots = useMemo(() => {
    const cycle = motionMs("--matrix-cycle", 1200);
    return Array.from({ length: 16 }, (_, index) => {
      if (rounded && CORNERS.includes(index)) return { gap: true, delay: 0, still: false };
      if (variant === "scan") return { gap: false, delay: Math.round((index % 4) * (cycle / 10)), still: false };
      if (variant === "twinkle") {
        return { gap: false, delay: Math.round((TWINKLE[index] ?? 0) * (cycle / 16)), still: false };
      }
      if (variant === "orbit") {
        const position = RING.indexOf(index);
        return position === -1
          ? { gap: false, delay: 0, still: true }
          : { gap: false, delay: Math.round(position * (cycle / 8)), still: false };
      }
      const ring = INNER.includes(index) ? 0 : 1;
      return { gap: false, delay: Math.round(ring * (cycle * 0.16)), still: false };
    });
  }, [variant, rounded]);

  return (
    <span className={`t-matrix ${className ?? ""}`} role="status" aria-label="Actualisation en cours">
      {dots.map((dot, index) => (
        <i
          key={index}
          className={dot.gap ? "is-gap" : undefined}
          style={
            dot.still
              ? { animation: "none" }
              : ({ ["--d" as string]: String(dot.delay) } as React.CSSProperties)
          }
        />
      ))}
    </span>
  );
}
