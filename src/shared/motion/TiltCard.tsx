"use client";

import { useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "./tokens";

/**
 * transitions.dev · 19 — Card hover tilt.
 *
 * Réservé au pointeur fin (souris). `touch-action: none` ferait qu'un doigt
 * incline la carte au lieu de faire défiler la page : sur une app dont
 * l'usage principal est le pouce dans le métro, c'est inacceptable. Le
 * composant ne s'arme donc que si le pointeur est précis.
 */
const MAX_DEGREES = 6;

export function TiltCard({
  children,
  className,
  glare = true,
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  glare?: boolean;
  /** Coupe l'inclinaison sans démonter la carte (saisie en cours, par ex.). */
  disabled?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState(false);
  const [tilting, setTilting] = useState(false);

  const fine = () =>
    !disabled &&
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: fine)").matches === true &&
    !prefersReducedMotion();

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card || !fine()) return;
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    card.style.setProperty("--tilt-ry", `${((x - 0.5) * 2 * MAX_DEGREES).toFixed(2)}deg`);
    card.style.setProperty("--tilt-rx", `${((0.5 - y) * 2 * MAX_DEGREES).toFixed(2)}deg`);
    card.style.setProperty("--tilt-gx", `${(x * 100).toFixed(1)}%`);
    card.style.setProperty("--tilt-gy", `${(y * 100).toFixed(1)}%`);
    if (!tilting) setTilting(true);
  };

  const reset = () => {
    const card = cardRef.current;
    setHover(false);
    setTilting(false);
    card?.style.setProperty("--tilt-rx", "0deg");
    card?.style.setProperty("--tilt-ry", "0deg");
  };

  return (
    <div
      className={`t-tilt ${hover ? "is-hover" : ""}`}
      style={{ touchAction: "auto" }}
      onPointerEnter={() => fine() && setHover(true)}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      {/* `border-radius` vient de la carte appelante : le snippet en pose un
          par défaut, qu'on laisse la DA écraser plutôt que de le supprimer. */}
      <div ref={cardRef} className={`t-tilt-card ${tilting ? "is-tilting" : ""} ${className ?? ""}`}>
        {children}
        {glare ? <span className="t-tilt-glare" aria-hidden /> : null}
      </div>
    </div>
  );
}
