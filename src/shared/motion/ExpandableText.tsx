"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { anchorToTop } from "@/shared/lib/scroll";

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
  anchorRef,
}: {
  children: React.ReactNode;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
  /**
   * Élément à ramener en vue au repli — la carte entière, pas seulement le
   * texte : refermer un post doit rendre son auteur et sa date, pas atterrir au
   * milieu du paragraphe restant.
   */
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
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
      // Le haut de la carte ne bouge pas au repli : sa position est donc déjà
      // la bonne cible, et corriger le défilement maintenant se déroule en
      // même temps que la hauteur diminue, au lieu de sauter à la fin.
      const anchor = anchorRef?.current ?? rootRef.current;
      if (anchor) anchorToTop(anchor);
    });
  };

  const collapsed = overflows && !open;

  return (
    <div className={className} ref={rootRef}>
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

      {/* Pleine largeur et haut de 40 px : le libellé faisait cinquante pixels
          de large, et le manquer au pouce coûtait un aller-retour. La zone
          déborde d'une marge négative pour rattraper le retrait de la carte
          sans décaler le texte. */}
      {overflows ? (
        <button
          type="button"
          onClick={toggle}
          className="-mx-4 flex h-10 w-[calc(100%+2rem)] items-center px-4 text-[13px] font-medium"
          style={{ color: "var(--color-text-secondary)" }}
          aria-expanded={open}
        >
          {open ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  );
}
