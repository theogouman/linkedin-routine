"use client";

import { useEffect, useRef, useState } from "react";
import { REACTIONS, reaction as lookup, type ReactionType } from "@/shared/lib/reactions";
import { ReactionIcon } from "@/shared/components/ReactionIcon";
import { motionMs } from "./tokens";

/**
 * transitions.dev · 20 — Plus to menu morph, appliqué aux réactions.
 *
 * Le bouton rond DEVIENT la barre de réactions qu'il ouvre, au lieu de faire
 * apparaître un popover à côté. C'est ce que fait LinkedIn, et le geste dit la
 * bonne chose : les six réactions sont le même bouton, déplié.
 *
 * Ouverture au survol sur pointeur fin, et à l'appui long sur tactile — un
 * `hover` n'existe pas sous un pouce, et laisser le menu inaccessible sur
 * téléphone reviendrait à ne l'avoir fait que pour le desktop.
 *
 * La fermeture est temporisée : sans ce délai, traverser l'espace de deux
 * pixels entre le bouton et la barre referme le menu au moment précis où on va
 * choisir.
 */
const CLOSE_DELAY_MS = 220;
const LONG_PRESS_MS = 350;

export function ReactionPicker({
  current,
  disabled,
  onPick,
  label,
}: {
  /** Réaction déjà posée, ou null. */
  current: ReactionType | null;
  disabled?: boolean;
  onPick: (type: ReactionType) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const pressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  const fine = () =>
    typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true;

  const pick = (type: ReactionType) => {
    setOpen(false);
    cancelClose();
    onPick(type);
  };

  const active = current === null ? null : lookup(current);
  // Six pastilles de 34 px, 4 px d'écart, 5 px de marge : la largeur ouverte
  // est calculée et non codée en dur, pour rester juste si le jeu change.
  const openWidth = REACTIONS.length * 34 + (REACTIONS.length - 1) * 4 + 10;

  return (
    <div
      ref={rootRef}
      className="relative inline-flex"
      onPointerEnter={() => {
        if (!disabled && fine()) {
          cancelClose();
          setOpen(true);
        }
      }}
      onPointerLeave={() => {
        if (fine()) scheduleClose();
      }}
    >
      <div
        className="t-morph nc-reaction-morph"
        data-open={open}
        style={
          {
            "--morph-open-w": `${openWidth}px`,
            "--morph-open-h": "44px",
            background: open ? "var(--color-surface-card)" : "transparent",
            border: open ? "1px solid var(--color-border-default)" : "1px solid transparent",
            boxShadow: open ? "var(--nc-shadow-3)" : "none",
          } as React.CSSProperties
        }
      >
        <button
          type="button"
          className="t-morph-plus"
          disabled={disabled}
          aria-label={active ? `${label} — ${active.label}` : label}
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerDown={() => {
            if (fine() || disabled) return;
            // Appui long au doigt : ouvre la barre. Le clic qui suit le relâché
            // est neutralisé, sinon on poserait un « J'aime » en ouvrant.
            pressTimer.current = window.setTimeout(() => {
              suppressClick.current = true;
              setOpen(true);
            }, LONG_PRESS_MS);
          }}
          onPointerUp={() => {
            if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
          }}
          onPointerCancel={() => {
            if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
          }}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            if (open) {
              setOpen(false);
              return;
            }
            // Clic direct : la réaction par défaut, comme sur LinkedIn.
            pick(current ?? "like");
          }}
        >
          {active ? (
            <ReactionIcon type={active.type} size={24} filled />
          ) : (
            <ReactionIcon type="like" size={24} />
          )}
        </button>

        <div className="t-morph-menu flex items-center gap-1 px-[5px]" role="menu" aria-label={label}>
          {REACTIONS.map((entry) => (
            <button
              key={entry.type}
              type="button"
              role="menuitem"
              className="nc-reaction-choice"
              aria-label={entry.label}
              title={entry.label}
              disabled={disabled}
              onClick={() => pick(entry.type)}
            >
              <ReactionIcon type={entry.type} size={34} filled={current === entry.type} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Durée de la morphose, pour synchroniser un rendu qui en dépendrait. */
export function reactionMorphMs(): number {
  return motionMs("--morph-open-dur", 350);
}
