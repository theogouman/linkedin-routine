"use client";

import { useEffect, useRef, useState } from "react";
import { motionMs } from "./tokens";

/**
 * transitions.dev · 04 — Text states swap.
 *
 * Trois phases : sortie vers le haut avec flou, échange du texte hors
 * transition, retour depuis le bas. Le composant garde le texte affiché dans
 * un état local pour que l'échange se fasse au bon moment — écrire directement
 * la prop ferait sauter la phase de sortie.
 */
export function TextSwap({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(children);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || children === shown) return;

    const duration = motionMs("--text-swap-dur", 150);
    element.classList.add("is-exit");
    const id = window.setTimeout(() => {
      setShown(children);
      element.classList.remove("is-exit");
      element.classList.add("is-enter-start");
      void element.offsetHeight;
      element.classList.remove("is-enter-start");
    }, duration);
    timers.current.push(id);
  }, [children, shown]);

  return (
    <span ref={ref} className={`t-text-swap ${className ?? ""}`}>
      {shown}
    </span>
  );
}
