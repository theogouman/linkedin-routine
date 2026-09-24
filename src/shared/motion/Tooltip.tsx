"use client";

import { useCallback, useRef, type ReactNode } from "react";

/**
 * transitions.dev · 17 — Tooltip open / close.
 *
 * Une seule bulle par groupe, partagée par tous les déclencheurs : elle voyage
 * de l'un à l'autre au lieu d'apparaître et disparaître. La géométrie est
 * posée sans transition quand la bulle est cachée, pour que seule l'apparition
 * joue au premier survol.
 */
export function TooltipGroup({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);

  const hide = useCallback(() => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.setAttribute("data-show", "false");
    tip.setAttribute("aria-hidden", "true");
  }, []);

  const place = useCallback((trigger: HTMLElement) => {
    const group = groupRef.current;
    const tip = tipRef.current;
    const text = textRef.current;
    if (!group || !tip || !text) return;

    const label = trigger.getAttribute("data-tooltip") ?? "";
    if (label === "") return;
    const showing = tip.getAttribute("data-show") === "true";
    text.textContent = label;

    const style = getComputedStyle(tip);
    const width = Math.ceil(
      text.scrollWidth +
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight),
    );
    const groupBox = group.getBoundingClientRect();
    const triggerBox = trigger.getBoundingClientRect();
    const x = triggerBox.left - groupBox.left + triggerBox.width / 2 - width / 2;

    if (!showing) {
      tip.style.transition = "none";
      tip.style.width = `${width}px`;
      tip.style.setProperty("--tt-x", `${x}px`);
      void tip.offsetWidth;
      tip.style.transition = "";
    } else {
      tip.style.width = `${width}px`;
      tip.style.setProperty("--tt-x", `${x}px`);
    }
    tip.setAttribute("data-show", "true");
    tip.setAttribute("aria-hidden", "false");
  }, []);

  const onTrigger = useCallback(
    (event: React.SyntheticEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-tooltip]",
      );
      if (target) place(target);
    },
    [place],
  );

  return (
    <div
      ref={groupRef}
      className={`t-tt-group ${className ?? ""}`}
      style={style}
      onPointerOver={onTrigger}
      onPointerLeave={hide}
      onFocus={onTrigger}
      onBlur={hide}
    >
      {/* aria-hidden : le libellé accessible reste sur le déclencheur
          (aria-label), la bulle n'est qu'un doublon visuel. */}
      <span ref={tipRef} className="t-tt text-[12px] font-medium" data-show="false" aria-hidden="true">
        <span ref={textRef} className="t-tt-text" />
      </span>
      {children}
    </div>
  );
}
