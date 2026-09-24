"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  GearIcon,
  InboxIcon,
  ListIcon,
  NewsIcon,
  TimelineIcon,
} from "./NotionIcons";
import { activeNavRoute, NAV_ROUTES } from "./nav-routes";
import { scrollAppToTop } from "@/shared/lib/scroll";

/**
 * Navigation principale : une pilule flottante, en bas sur mobile, en haut sur
 * desktop.
 *
 * Une seule barre, un seul rendu. La version précédente en dessinait deux — une
 * pilule basse et un bandeau pleine largeur — ce qui doublait la liste des
 * onglets et changeait la nature de l'objet selon la taille de l'écran. Ici,
 * seule la position bascule ; la CSS s'en charge, le composant l'ignore.
 *
 * transitions.dev · 16 (Tabs sliding) — la pilule active est positionnée
 * impérativement à partir des dimensions mesurées de l'onglet. C'est le seul
 * moyen de la faire GLISSER : un fond CSS posé sur l'onglet actif sauterait.
 *
 * transitions.dev · 03 (Notification badge) — la pastille de compteur glisse
 * en diagonale et éclot indépendamment de l'onglet, qui ne bouge pas.
 */

const TABS = [
  { href: NAV_ROUTES[0], label: "Feed", icon: NewsIcon, slot: "posts" as const },
  { href: NAV_ROUTES[1], label: "Inbox", icon: InboxIcon, slot: "comments" as const },
  { href: NAV_ROUTES[2], label: "File", icon: TimelineIcon, slot: "queue" as const },
  { href: NAV_ROUTES[3], label: "Listes", icon: ListIcon, slot: null },
  { href: NAV_ROUTES[4], label: "Réglages", icon: GearIcon, slot: null },
];

export interface NavBadgeSlots {
  posts: ReactNode;
  comments: ReactNode;
  queue: ReactNode;
}

export function AppNav({ badges }: { badges: NavBadgeSlots }) {
  const pathname = usePathname();
  const active = activeNavRoute(pathname);
  const activeIndex = TABS.findIndex((tab) => tab.href === active);

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

    // La densité des onglets change au point de rupture : la pilule doit
    // remesurer, sinon sa largeur reste celle de l'autre disposition.
    const onResize = () => move();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeIndex, pathname]);

  return (
    <nav ref={containerRef} className="nc-nav-pill-bar" aria-label="Navigation principale">
      <span ref={pillRef} className="nc-nav-pill" aria-hidden />
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-nav-item
            data-active={isActive}
            className="nc-nav-item"
            aria-current={isActive ? "page" : undefined}
            prefetch
            onClick={(event) => {
              // Cliquer l'onglet de l'écran courant remonte en haut plutôt que
              // de re-naviguer vers la même route, qui ne ferait rien.
              if (!isActive) return;
              event.preventDefault();
              scrollAppToTop();
            }}
          >
            {/* L'épaisseur de trait ne varie plus avec l'état : les icônes
                Notion sont dessinées à 1,5 et la graisser déforme les formes
                pleines (l'engrenage, la coche). C'est la couleur et la pilule
                qui disent l'onglet actif. */}
            <Icon size={19} />
            <span>{tab.label}</span>
            {tab.slot ? badges[tab.slot] : null}
          </Link>
        );
      })}
    </nav>
  );
}
