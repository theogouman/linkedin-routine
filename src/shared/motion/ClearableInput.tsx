"use client";

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { motionEase, motionNumber, prefersReducedMotion } from "./tokens";

/**
 * transitions.dev · 13 — Input clear with dissolve.
 *
 * À l'effacement, le texte s'envole vers le bas en se floutant, le placeholder
 * descend à sa place, et une traînée lumineuse suit chaque mot. L'enveloppe
 * montée / pic / descente de la traînée ne s'exprime pas en `@keyframes` :
 * l'animation est écrite image par image, c'est assumé par le snippet.
 *
 * Le champ, le miroir, le placeholder et le calque de traînée sont empilés
 * aux mêmes coordonnées ; le miroir prend les glyphes à sa charge pendant
 * l'effacement pour que le texte ne se dédouble pas.
 */
function bezier(raw: string): (t: number) => number {
  const match = raw.match(/cubic-bezier\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) return (t) => t;
  const [x1, y1, x2, y2] = match.slice(1).map(Number) as [number, number, number, number];
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i += 1) {
      const dx = ((ax * s + bx) * s + cx) * s - t;
      const d = (3 * ax * s + 2 * bx) * s + cx;
      if (Math.abs(dx) < 1e-6 || d === 0) break;
      s -= dx / d;
    }
    return ((ay * s + by) * s + cy) * s;
  };
}

export function ClearableInput({
  value,
  onChange,
  onEnter,
  placeholder,
  className,
  ...rest
}: {
  value: string;
  onChange: (next: string) => void;
  onEnter?: () => void;
  placeholder: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "placeholder">) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const clearing = useRef(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  // Le miroir porte les glyphes dès qu'il y a une valeur : la CSS rend alors
  // le champ transparent, et le texte ne se dédouble pas au moment d'effacer.
  useEffect(() => {
    if (clearing.current) return;
    const mirror = mirrorRef.current;
    if (mirror) mirror.textContent = value.replace(/ /g, "\u00a0");
  }, [value]);

  const buildGlow = useCallback((text: string): string => {
    const wrap = wrapRef.current;
    const input = inputRef.current;
    if (!wrap || !input) return "";
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return "";
    const style = getComputedStyle(input);
    context.font = style.font;
    const dark = document.documentElement.classList.contains("dark");
    const rgb = dark ? "255,255,255" : "0,0,0";
    const width = wrap.clientWidth || 280;
    const padLeft = Number.parseFloat(style.paddingLeft) || 12;
    const spread = motionNumber("--glow-spread", 1.5);
    const layers: string[] = [];
    let x = 0;
    text.split(/(\s+)/).forEach((segment) => {
      const segmentWidth = context.measureText(segment).width;
      if (segment.trim()) {
        const centre = padLeft + x + segmentWidth / 2;
        const half = Math.max(segmentWidth * 0.45, 8) * spread;
        (
          [
            [0, 0.8, 7, 0.22],
            [half * 0.45, 0.55, 8, 0.18],
            [-half * 0.4, 0.65, 6, 0.16],
            [half * 0.15, 0.9, 5, 0.14],
          ] as Array<[number, number, number, number]>
        ).forEach(([dx, widthMultiplier, height, alpha]) => {
          const lx = (((centre + dx) / width) * 100).toFixed(2);
          layers.push(
            `radial-gradient(ellipse ${Math.max(half * widthMultiplier, 2).toFixed(1)}px ${height}px at ${lx}% 100%, rgba(${rgb},${alpha}), transparent)`,
          );
        });
      }
      x += segmentWidth;
    });
    return layers.join(", ");
  }, []);

  const clear = useCallback(() => {
    const wrap = wrapRef.current;
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    const ghost = placeholderRef.current;
    const glow = glowRef.current;
    if (!wrap || !input || !mirror || !ghost || !glow) return;
    if (clearing.current || input.value === "") return;

    if (prefersReducedMotion()) {
      onChange("");
      return;
    }

    clearing.current = true;
    const keepFocus = document.activeElement === input;
    const text = input.value.replace(/ /g, " ");
    mirror.textContent = text;

    const total = motionNumber("--clear-dur", 1000);
    const outDur = motionNumber("--clear-out-dur", 400);
    const inDur = motionNumber("--clear-in-dur", 400);
    const outFly = motionNumber("--clear-out-fly", 12);
    const inFly = motionNumber("--clear-in-fly", 12);
    const blur = motionNumber("--clear-blur", 2);
    const delay = motionNumber("--glow-delay", 50);
    const peakAt = motionNumber("--glow-peak-at", 0.15);
    const glowOpacity = motionNumber("--glow-opacity", 0.42);
    const easeOut = bezier(motionEase("--clear-out-ease", "cubic-bezier(0.22, 1, 0.36, 1)"));
    const easeIn = bezier(motionEase("--clear-in-ease", "cubic-bezier(0.22, 1, 0.36, 1)"));

    onChange("");
    wrap.classList.remove("has-value");
    wrap.classList.add("is-clearing");
    glow.style.background = buildGlow(text);
    glow.style.opacity = "0";
    ghost.style.transform = `translateY(-${inFly}px)`;
    ghost.style.opacity = "0.9";
    ghost.style.filter = `blur(${blur}px)`;

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const eo = easeOut(Math.min(1, elapsed / outDur));
      mirror.style.transform = `translateY(${(eo * outFly).toFixed(1)}px)`;
      mirror.style.opacity = (1 - eo).toFixed(3);
      mirror.style.filter = `blur(${(eo * blur).toFixed(1)}px)`;

      const ei = easeIn(Math.min(1, elapsed / inDur));
      ghost.style.transform = `translateY(${(-inFly + ei * inFly).toFixed(1)}px)`;
      ghost.style.opacity = (0.9 + ei * 0.1).toFixed(3);
      ghost.style.filter = `blur(${(blur - ei * blur).toFixed(1)}px)`;

      let g = 0;
      if (elapsed > delay) {
        const progress = Math.min(1, (elapsed - delay) / Math.max(1, total - delay));
        g = progress < peakAt ? progress / peakAt : 1 - (progress - peakAt) / (1 - peakAt);
      }
      glow.style.opacity = (g * glowOpacity).toFixed(3);

      if (elapsed < total) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      wrap.classList.remove("is-clearing");
      mirror.style.cssText = "";
      ghost.style.cssText = "";
      mirror.textContent = "";
      glow.style.opacity = "0";
      glow.style.background = "";
      clearing.current = false;
      if (keepFocus) requestAnimationFrame(() => input.focus({ preventScroll: true }));
    };
    frame.current = requestAnimationFrame(tick);
  }, [buildGlow, onChange]);

  const hasValue = value.length > 0;

  return (
    <div
      ref={wrapRef}
      className={`t-clear nc-input flex items-center ${hasValue ? "has-value" : ""} ${className ?? ""}`}
    >
      <input
        {...rest}
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter?.();
        }}
        className="min-w-0 flex-1 bg-transparent outline-none"
      />
      <div ref={mirrorRef} className="t-clear-mirror px-4" aria-hidden />
      <div
        ref={placeholderRef}
        className="t-clear-placeholder px-4"
        style={{ color: "var(--color-text-muted)" }}
        aria-hidden
      >
        {placeholder}
      </div>
      <div ref={glowRef} className="t-clear-glow" aria-hidden />
      {hasValue ? (
        <button
          type="button"
          className="t-clear-btn relative z-[4] -mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Effacer"
          onPointerDown={(event) => {
            if (document.activeElement === inputRef.current) event.preventDefault();
          }}
          onClick={clear}
        >
          <X size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
