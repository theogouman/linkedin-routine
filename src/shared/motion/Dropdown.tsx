"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motionMs } from "./tokens";

/**
 * transitions.dev · 05 — Menu dropdown.
 *
 * Le menu grandit depuis son déclencheur : `transform-origin` suit l'ancrage,
 * donc un menu ouvert en bas à droite ne semble pas venir d'ailleurs.
 *
 * `.is-closing` est retirée après la durée de fermeture — c'est le piège que
 * le skill signale : sans ce nettoyage, la prochaine ouverture repart de
 * l'échelle de fermeture au lieu de l'échelle de repos, et le menu saute.
 *
 * L'état de fermeture est tenu par un effet et non par un minuteur rangé dans
 * une ref : la fonction `close` est passée aux enfants pendant le rendu, et
 * une fonction qui touche une ref ne peut pas l'être.
 */
export function Dropdown({
  trigger,
  children,
  origin = "top-right",
  align = "right",
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  origin?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  align?: "left" | "right";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    setEverOpened(true);
    setOpen((current) => !current);
  }, []);

  useEffect(() => {
    // `everOpened` évite que le menu ne naisse en état « fermeture » et ne
    // joue son animation de sortie au chargement de la page.
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
      if (!(event.target as HTMLElement).closest("[data-dropdown-root]")) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div data-dropdown-root className="relative inline-flex">
      {trigger({ open, toggle })}
      <div
        className={`t-dropdown nc-card absolute top-[calc(100%+6px)] z-40 min-w-[190px] overflow-hidden p-1 ${open ? "is-open" : ""} ${closing ? "is-closing" : ""}`}
        data-origin={origin}
        style={align === "right" ? { right: 0 } : { left: 0 }}
        role="menu"
        aria-label={label}
        aria-hidden={!open}
      >
        {children(close)}
      </div>
    </div>
  );
}
