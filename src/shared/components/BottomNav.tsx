"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { Inbox, List, Newspaper, Send } from "lucide-react";

/**
 * Barre de navigation flottante (DA Notion Club).
 *
 * La pilule active est positionnée impérativement à partir des dimensions
 * mesurées de l'onglet : c'est le seul moyen de la faire GLISSER d'un onglet à
 * l'autre. Un fond CSS posé sur l'onglet actif sauterait.
 */

const TABS = [
  { href: "/fil", label: "Fil", icon: Newspaper, badge: "posts" as const },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: "comments" as const },
  { href: "/file", label: "File", icon: Send, badge: "queue" as const },
  { href: "/listes", label: "Listes", icon: List, badge: null },
];

export interface NavCounts {
  posts: number;
  comments: number;
  queue: number;
}

export function BottomNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const previousIndex = useRef<number | null>(null);

  const activeIndex = TABS.findIndex((tab) => pathname.startsWith(tab.href));

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

    // Au premier rendu, la pilule doit apparaître déjà en place : on coupe la
    // transition puis on force un reflow avant de la rétablir, sinon elle
    // glisse depuis le bord gauche à chaque chargement de page.
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
  }, [activeIndex, pathname]);

  return (
    <nav ref={containerRef} className="nc-bottom-nav" aria-label="Navigation principale">
      <span ref={pillRef} className="nc-nav-pill" aria-hidden />
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = pathname.startsWith(tab.href);
        const count = tab.badge ? counts[tab.badge] : 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-nav-item
            data-active={active}
            className="nc-nav-item"
            aria-current={active ? "page" : undefined}
          >
            <Icon size={19} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
            <span>{tab.label}</span>
            {count > 0 ? (
              <span className="nc-nav-count" aria-label={`${count} à traiter`}>
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
