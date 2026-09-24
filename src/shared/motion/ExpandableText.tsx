"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * transitions.dev · 01 — Card resize, appliqué au corps d'une publication.
 *
 * Le texte est tronqué à une hauteur fixe et se déplie en tweenant la hauteur.
 * La hauteur cible est MESURÉE avant l'ouverture puis relâchée à `auto` une
 * fois la transition finie : la laisser figée casserait la mise en page au
 * redimensionnement de la fenêtre, et animer vers `auto` ne tween pas.
 *
 * Le bouton n'apparaît que si le texte dépasse réellement. Un « Voir plus »
 * sous trois lignes est un mensonge, et l'utilisateur apprend vite à ne plus
 * le lire.
 */
const COLLAPSED_PX = 200;

export function ExpandableText({
  children,
  className,
  moreLabel = "Voir plus",
  lessLabel = "Voir moins",
}: {
  children: React.ReactNode;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => setOverflows(body.scrollHeight > COLLAPSED_PX + 24);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const body = bodyRef.current;
    if (!body) return;
    if (!open) {
      setHeight(body.scrollHeight);
      setOpen(true);
      return;
    }
    // Fermeture : on repart de la hauteur réelle, sinon la transition démarre
    // depuis `auto` et saute directement à l'état replié.
    setHeight(body.scrollHeight);
    window.requestAnimationFrame(() => {
      setHeight(COLLAPSED_PX);
      setOpen(false);
    });
  };

  const collapsed = overflows && !open;

  return (
    <div className={className}>
      <div
        className="t-resize relative overflow-hidden"
        style={{ height: overflows ? (open ? height : COLLAPSED_PX) : undefined }}
        onTransitionEnd={(event) => {
          if (event.propertyName === "height" && open) setHeight(undefined);
        }}
      >
        <div ref={bodyRef}>{children}</div>
        {/* Dégradé de coupe : sans lui, le texte est sectionné net au milieu
            d'une ligne et on ne voit pas qu'il continue. */}
        <span className="nc-fade-out" aria-hidden data-shown={collapsed} />
      </div>

      {overflows ? (
        <button
          type="button"
          onClick={toggle}
          className="mt-1 text-[13px] font-medium"
          style={{ color: "var(--color-text-secondary)" }}
          aria-expanded={open}
        >
          {open ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  );
}
