"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Inbox, List, Newspaper, Send, SlidersHorizontal } from "lucide-react";
import { activeNavRoute, NAV_ROUTES } from "./nav-routes";

/**
 * Navigation principale — barre haute sur desktop, barre flottante basse sur
 * mobile.
 *
 * Un seul composant rend les deux : dupliquer la liste d'onglets garantirait
 * qu'un jour l'une des deux oublie un écran. Ce qui change entre les deux
 * n'est que la position, la densité et l'orientation de l'étiquette.
 *
 * transitions.dev · 16 (Tabs sliding) — la pilule active est positionnée
 * impérativement à partir des dimensions mesurées de l'onglet. C'est le seul
 * moyen de la faire GLISSER : un fond CSS posé sur l'onglet actif sauterait.
 *
 * transitions.dev · 03 (Notification badge) — la pastille de compteur glisse
 * en diagonale et éclot indépendamment de l'onglet, qui ne bouge pas.
 */

const TABS = [
  { href: NAV_ROUTES[0], label: "Fil", icon: Newspaper, slot: "posts" as const },
  { href: NAV_ROUTES[1], label: "Inbox", icon: Inbox, slot: "comments" as const },
  { href: NAV_ROUTES[2], label: "File", icon: Send, slot: "queue" as const },
  { href: NAV_ROUTES[3], label: "Listes", icon: List, slot: null },
  { href: NAV_ROUTES[4], label: "Réglages", icon: SlidersHorizontal, slot: null },
];

export interface NavBadgeSlots {
  posts: ReactNode;
  comments: ReactNode;
  queue: ReactNode;
}

function useSlidingPill(activeIndex: number, pathname: string) {
  const containerRef = useRef<HTMLElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const previousIndex = useRef<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const pill = pillRef.current;
    if (!container || !pill || activeIndex < 0) return;

    const target = container.querySelectorAll<HTMLElement>("[data-nav-item]")[activeIndex];
    if (!target) return;

    const move = () => {
      pill.style.width = `${target.offsetWidth}px`;
      pill.style.transform = `translateX(${target.offsetLeft}px)`;
    };

    // Au premier rendu la pilule doit apparaître déjà en place : on coupe la
    // transition, on force un reflow, puis on la rétablit — sinon elle glisse
    // depuis le bord gauche à chaque chargement de page.
    if (previousIndex.current === null) {
      const saved = pill.style.transition;
      pill.style.transition = "none";
      move();
      void pill.offsetWidth;
      pill.style.transition = saved;
    } else {
      move();
    }
    previousIndex.current = activeIndex;

    // Les deux barres coexistent dans le DOM, l'une masquée en `display: none`
    // — donc de largeur nulle. Au franchissement du point de rupture, celle qui
    // apparaît doit remesurer, sinon sa pilule reste collée à gauche.
    const onResize = () => move();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeIndex, pathname]);

  return { containerRef, pillRef };
}

function NavItems({
  badges,
  active,
  variant,
}: {
  badges: NavBadgeSlots;
  active: string | null;
  variant: "top" | "bottom";
}) {
  return (
    <>
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-nav-item
            data-active={isActive}
            className={variant === "top" ? "nc-nav-item nc-nav-item--top" : "nc-nav-item"}
            aria-current={isActive ? "page" : undefined}
            prefetch
          >
            <Icon size={variant === "top" ? 16 : 19} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
            <span>{tab.label}</span>
            {tab.slot ? badges[tab.slot] : null}
          </Link>
        );
      })}
    </>
  );
}

export function AppNav({ badges }: { badges: NavBadgeSlots }) {
  const pathname = usePathname();
  const active = activeNavRoute(pathname);
  const activeIndex = TABS.findIndex((tab) => tab.href === active);

  const { containerRef: bottomNav, pillRef: bottomPill } = useSlidingPill(activeIndex, pathname);
  const { containerRef: topNav, pillRef: topPill } = useSlidingPill(activeIndex, pathname);

  return (
    <>
      {/* Desktop : la barre est en haut, collante, pleine largeur. */}
      <header className="nc-top-nav" aria-label="Navigation principale">
        {/* Même gouttière que le contenu : le mot-marque doit s'aligner sur la
            colonne de lecture, pas flotter à côté. */}
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4">
          <span className="text-[15px] font-semibold tracking-tight">Routine</span>
          <nav ref={topNav} className="nc-top-nav-tabs relative ml-auto flex items-center gap-1">
            <span ref={topPill} className="nc-nav-pill" aria-hidden />
            <NavItems badges={badges} active={active} variant="top" />
          </nav>
        </div>
      </header>

      {/* Mobile : barre flottante basse, au pouce. */}
      <nav ref={bottomNav} className="nc-bottom-nav" aria-label="Navigation principale">
        <span ref={bottomPill} className="nc-nav-pill" aria-hidden />
        <NavItems badges={badges} active={active} variant="bottom" />
      </nav>
    </>
  );
}
