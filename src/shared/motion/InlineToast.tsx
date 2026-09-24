"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * transitions.dev · 22 — Toast open / close.
 *
 * Appliqué aux bandeaux de confirmation qui vivent DANS une carte (« en file,
 * rien ne part avant l'heure prévue »), pas aux toasts flottants : ceux-là
 * sont rendus par sonner, qui porte déjà sa propre orchestration d'entrée et
 * de sortie et qu'il serait absurde de doubler.
 */
export function InlineToast({
  shown,
  children,
  className,
}: {
  shown: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!shown) return null;
  // Le corps est un composant à part pour être REMONTÉ à chaque apparition :
  // son état d'entrée repart ainsi de zéro sans avoir à le réinitialiser.
  return <Rising className={className}>{children}</Rising>;
}

function Rising({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return <div className={`t-toast ${open ? "is-open" : ""} ${className ?? ""}`}>{children}</div>;
}
