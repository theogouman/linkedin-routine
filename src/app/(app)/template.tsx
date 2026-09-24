"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { activeNavRoute, NAV_ROUTES } from "@/shared/components/nav-routes";

/**
 * transitions.dev · 08 — Page side-by-side, appliqué au changement de route.
 *
 * Deux écrans de l'App Router ne coexistent jamais dans le DOM : on garde donc
 * la moitié « entrante » du snippet, qui est celle qu'on voit, et on lui donne
 * son sens de glissement à partir de l'ordre des onglets. Aller vers la droite
 * dans la barre fait entrer l'écran par la droite : c'est ce qui fait qu'une
 * navigation se lit comme un déplacement et non comme un rechargement.
 *
 * `template.tsx` plutôt que `layout.tsx` : un template est remonté à chaque
 * navigation, ce qui rejoue l'animation. Un layout, lui, est réutilisé.
 */
/**
 * Onglet quitté, mémorisé hors de React.
 *
 * Un `useRef` ne conviendrait pas : le template est REMONTÉ à chaque
 * navigation, donc son état local naît vide au moment précis où on a besoin de
 * savoir d'où l'on vient. Une variable de module survit au démontage, et il
 * n'y a jamais qu'un template monté à la fois.
 */
let previousIndex: number | null = null;

export default function AppTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const active = activeNavRoute(pathname);
  const index = active === null ? -1 : NAV_ROUTES.indexOf(active);
  const from =
    previousIndex === null || index < 0 || previousIndex === index
      ? 0
      : index > previousIndex
        ? 1
        : -1;
  // L'écriture est faite APRÈS le rendu : mémoriser pendant le rendu serait un
  // effet de bord, et un double rendu en mode strict fausserait le sens.
  useEffect(() => {
    if (index >= 0) previousIndex = index;
  }, [index]);

  return (
    <div
      className="t-route"
      style={
        {
          "--t-page-from-x": `calc(var(--page-slide-distance) * ${from})`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
