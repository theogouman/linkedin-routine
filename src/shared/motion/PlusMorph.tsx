"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * transitions.dev · 20 — Plus to menu morph.
 *
 * Le bouton rond devient la surface qu'il ouvre, au lieu de faire apparaître
 * un panneau à côté de lui. Employé pour « créer une liste » : le geste dit
 * que le formulaire EST le bouton, déplié.
 *
 * Les dimensions ouvertes du snippet (183 × 172) sont celles de sa démo ; on
 * les passe en variables pour coller au formulaire réel, le reste du snippet
 * est intact.
 */
export function PlusMorph({
  open,
  onOpen,
  openWidth,
  openHeight,
  children,
  label,
  className,
}: {
  open: boolean;
  onOpen: () => void;
  openWidth: number | string;
  openHeight: number;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Le focus attend que la morphose soit jouée : le donner tout de suite fait
  // remonter le clavier de l'iPhone par-dessus un bouton encore en train de
  // devenir un formulaire.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>("input, textarea")?.focus();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div
      ref={ref}
      className={`t-morph ${className ?? ""}`}
      data-open={open}
      style={
        {
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-border-default)",
          "--morph-open-w": typeof openWidth === "number" ? `${openWidth}px` : openWidth,
          "--morph-open-h": `${openHeight}px`,
        } as React.CSSProperties
      }
    >
      <button type="button" className="t-morph-plus" onClick={onOpen} aria-label={label}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path
            d="M9 3.75V14.25M3.75 9H14.25"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="t-morph-menu" aria-hidden={!open}>
        {children}
      </div>
    </div>
  );
}
