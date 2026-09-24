"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motionMs } from "./tokens";
import { Portal } from "./Portal";

/**
 * transitions.dev · 05 — Menu dropdown.
 *
 * Le menu grandit depuis son déclencheur : `transform-origin` suit l'ancrage,
 * donc un menu ouvert en bas à droite ne semble pas venir d'ailleurs.
 *
 * Le panneau est monté sous `<body>` et positionné à partir du rectangle du
 * déclencheur. En position absolue dans son parent, il était découpé par le
 * premier ancêtre en `overflow: hidden` — une carte de liste repliée, par
 * exemple, dont c'est justement le rôle de masquer ce qui dépasse. Le menu
 * s'ouvrait alors À L'INTÉRIEUR de la carte fermée, invisible.
 *
 * `.is-closing` est retirée après la durée de fermeture — c'est le piège que
 * le skill signale : sans ce nettoyage, la prochaine ouverture repart de
 * l'échelle de fermeture au lieu de l'échelle de repos, et le menu saute.
 */
const MARGIN = 6;
const VIEWPORT_PADDING = 8;

export function Dropdown({
  trigger,
  children,
  origin = "top-right",
  align = "right",
  label,
  width = 200,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  origin?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  align?: "left" | "right";
  label: string;
  /** Largeur du panneau, nécessaire pour l'aligner avant de le mesurer. */
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [closing, setClosing] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    setEverOpened(true);
    setOpen((current) => !current);
  }, []);

  const place = useCallback(() => {
    const anchor = anchorRef.current?.previousElementSibling ?? anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 0;

    // Bascule vers le haut quand le bas de l'écran ne laisse pas la place :
    // un menu ouvert sous le pouce, en bas d'un téléphone, sortirait sinon de
    // la fenêtre et on ne verrait que sa première ligne.
    const below = rect.bottom + MARGIN;
    const flip = panelHeight > 0 && below + panelHeight > window.innerHeight - VIEWPORT_PADDING;
    const top = flip ? Math.max(VIEWPORT_PADDING, rect.top - MARGIN - panelHeight) : below;

    const rawLeft = align === "right" ? rect.right - width : rect.left;
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, rawLeft),
      window.innerWidth - width - VIEWPORT_PADDING,
    );
    setBox({ top, left });
  }, [align, width]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Deux passes : la première pose le panneau, la seconde le replace une
    // fois sa hauteur réelle connue (elle décide du basculement vers le haut).
    const frame = window.requestAnimationFrame(place);
    return () => window.cancelAnimationFrame(frame);
  }, [open, place]);

  useEffect(() => {
    if (open || !everOpened) return;
    const frame = window.requestAnimationFrame(() => setClosing(true));
    const timer = window.setTimeout(
      () => setClosing(false),
      motionMs("--dropdown-close-dur", 150),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open, everOpened]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-dropdown-root]") || target.closest("[data-dropdown-panel]")) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Le panneau étant hors du flux, un défilement le laisserait derrière son
    // déclencheur : on referme plutôt que de le faire courir après.
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <span data-dropdown-root className="relative inline-flex">
      {trigger({ open, toggle })}
      <span ref={anchorRef} aria-hidden />
      {open || closing ? (
        <Portal>
          <div
            ref={panelRef}
            data-dropdown-panel
            className={`t-dropdown nc-card fixed z-[70] overflow-hidden p-1 ${open ? "is-open" : ""} ${closing ? "is-closing" : ""}`}
            data-origin={origin}
            style={{ top: box?.top ?? -9999, left: box?.left ?? -9999, width }}
            role="menu"
            aria-label={label}
            aria-hidden={!open}
          >
            {children(close)}
          </div>
        </Portal>
      ) : null}
    </span>
  );
}
