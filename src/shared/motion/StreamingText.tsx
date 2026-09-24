"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motionMs, prefersReducedMotion } from "./tokens";

/**
 * transitions.dev · 30 — Streaming text.
 *
 * Les mots se résolvent un par un à travers un flou doux. Utilisé quand une
 * proposition générée arrive dans le composer : le texte n'apparaît pas d'un
 * bloc, on le voit se poser — ce qui donne le temps de commencer à le lire
 * avant de décider s'il part (FR-006).
 */
export function StreamingText({
  text,
  className,
  onDone,
}: {
  text: string;
  className?: string;
  /** Appelé quand le dernier mot est posé. */
  onDone?: () => void;
}) {
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean), [text]);
  const [revealed, setRevealed] = useState(0);
  const [streamed, setStreamed] = useState(text);
  const done = useRef(onDone);

  // La callback est rangée dans une ref APRÈS le rendu : la garder dans les
  // dépendances de l'effet relancerait le flux à chaque rendu du parent.
  useEffect(() => {
    done.current = onDone;
  });

  // Remise à zéro pendant le rendu (motif React officiel) plutôt que dans
  // l'effet : un `setState` synchrone dans un effet ferait un rendu de plus
  // par mot posé.
  if (text !== streamed) {
    setStreamed(text);
    setRevealed(0);
  }

  useEffect(() => {
    if (prefersReducedMotion()) {
      const frame = window.requestAnimationFrame(() => {
        setRevealed(words.length);
        done.current?.();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const gap = motionMs("--stream-gap", 60);
    let index = 0;
    const id = window.setInterval(() => {
      index += 1;
      setRevealed(index);
      if (index >= words.length) {
        window.clearInterval(id);
        done.current?.();
      }
    }, gap);
    return () => window.clearInterval(id);
  }, [words]);

  return (
    <span className={className}>
      {words.map((word, index) => (
        <span key={`${index}-${word}`}>
          <span className={`t-stream-w ${index < revealed ? "is-in" : ""}`}>{word}</span>
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}
