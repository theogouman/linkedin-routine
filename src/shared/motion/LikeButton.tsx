"use client";

import { useEffect, useRef, useState } from "react";
import { motionMs, motionNumber, prefersReducedMotion } from "./tokens";

/**
 * transitions.dev · 23 — Like button.
 *
 * Le cœur se remplit avec un pop, et huit particules partent en gerbe. Les
 * vecteurs sont tirés au sort à chaque like : une gerbe identique à chaque
 * fois se lit comme une image, pas comme une réaction.
 *
 * Le `scale` du pop est porté par un wrapper HTML, jamais par le `<svg>` :
 * transformer un SVG inline fait rasteriser Chromium en 1× et le cœur devient
 * pixelisé sur écran Retina — donc sur l'iPhone, qui est la cible.
 */
const PARTICLE_COUNT = 8;

export function LikeButton({
  liked,
  disabled,
  onLike,
  label,
  className,
}: {
  liked: boolean;
  disabled?: boolean;
  onLike: () => void;
  label: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const [bursting, setBursting] = useState(false);
  const wasLiked = useRef(liked);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (liked && !wasLiked.current && !prefersReducedMotion()) {
      const root = rootRef.current;
      if (root) {
        const distance = motionNumber("--like-particle-dist", 20);
        const duration = motionMs("--like-particle-dur", 600);
        root.querySelectorAll<HTMLElement>(".t-like-particles i").forEach((dot, index) => {
          const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.5;
          const reach = distance * (0.7 + Math.random() * 0.6);
          dot.style.setProperty("--px", `${(Math.cos(angle) * reach).toFixed(2)}px`);
          dot.style.setProperty("--py", `${(Math.sin(angle) * reach).toFixed(2)}px`);
          dot.style.setProperty("--pdur", `${Math.round(duration * (0.75 + Math.random() * 0.5))}ms`);
          dot.style.setProperty("--pdelay", `${Math.round(Math.random() * 60)}ms`);
          dot.style.setProperty("--psize", (0.7 + Math.random() * 0.8).toFixed(2));
          dot.style.setProperty("--p-end-scale", (0.3 + Math.random() * 0.5).toFixed(2));
        });
      }
      setBursting(true);
      timer.current = window.setTimeout(() => setBursting(false), motionMs("--like-particle-dur", 600) * 2);
    }
    wasLiked.current = liked;
  }, [liked]);

  return (
    <button
      ref={rootRef}
      type="button"
      data-liked={liked}
      disabled={disabled}
      onClick={onLike}
      aria-label={label}
      aria-pressed={liked}
      data-tooltip={label}
      className={`t-like nc-icon-btn relative ${bursting ? "is-bursting" : ""} ${className ?? ""}`}
    >
      <span className="t-like-icon inline-flex">
        <svg className="t-like-heart" width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 20.5C12 20.5 3.5 15.6 3.5 9.75A4.75 4.75 0 0 1 12 6.9A4.75 4.75 0 0 1 20.5 9.75C20.5 15.6 12 20.5 12 20.5Z"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="t-like-particles" aria-hidden>
        {Array.from({ length: PARTICLE_COUNT }, (_, index) => (
          <i key={index} />
        ))}
      </span>
    </button>
  );
}
