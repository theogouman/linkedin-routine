"use client";

import { useEffect, useRef, useState } from "react";
import { motionMs } from "./tokens";

/**
 * transitions.dev · 12 — Error state shake.
 *
 * Secousse à segments, bordure et message qui reviennent d'eux-mêmes au bout
 * de la tenue. Rendu sous forme de hook : la secousse doit pouvoir être
 * déclenchée depuis la logique de validation, pas depuis un composant
 * enveloppant qui ne sait pas ce qui est invalide.
 */
export function useShake() {
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => timers.current.forEach((id) => window.clearTimeout(id));
  }, []);

  const shake = (message: string) => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setError(message);
    setShaking(false);
    // Une frame de coupure pour que l'animation puisse être rejouée à
    // l'identique sur deux tentatives successives.
    window.requestAnimationFrame(() => setShaking(true));

    const shakeDuration =
      motionMs("--shake-dur-a", 80) * 2 + motionMs("--shake-dur-b", 60) * 2;
    timers.current.push(window.setTimeout(() => setShaking(false), shakeDuration));
    timers.current.push(window.setTimeout(() => setError(null), motionMs("--revert-hold", 3000)));
  };

  return {
    error,
    /** À poser sur le conteneur, pour révéler le message. */
    wrapClassName: `t-input-wrap ${error ? "is-error" : ""}`,
    /** À poser sur le champ lui-même. */
    inputClassName: `t-input ${error ? "is-error" : ""} ${shaking ? "is-shaking" : ""}`,
    shake,
  };
}

export function ErrorMessage({ children }: { children: string | null }) {
  return (
    <p className="t-error-msg mt-1.5 text-[12px]" style={{ color: "var(--color-brand)" }} role="alert">
      {children}
    </p>
  );
}
