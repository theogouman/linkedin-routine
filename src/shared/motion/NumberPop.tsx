"use client";

import { useEffect, useRef } from "react";

/**
 * transitions.dev · 02 — Number pop-in.
 *
 * Chaque caractère rentre indépendamment, les deux derniers décalés. Utilisé
 * partout où un compteur d'inbox change : c'est le seul endroit de l'app où un
 * chiffre qui bouge veut dire « il te reste ça à faire ».
 */
export function NumberPop({
  value,
  className,
}: {
  value: number | string;
  className?: string;
}) {
  const groupRef = useRef<HTMLSpanElement | null>(null);
  const previous = useRef<string | null>(null);
  const text = String(value);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    // Pas de rejeu au montage : un compteur qui se réanime à chaque navigation
    // devient un tic nerveux, pas une information.
    if (previous.current === null) {
      previous.current = text;
      return;
    }
    if (previous.current === text) return;
    previous.current = text;

    group.classList.remove("is-animating");
    void group.offsetHeight;
    group.classList.add("is-animating");
  }, [text]);

  const chars = text.split("");

  return (
    <span ref={groupRef} className={`t-digit-group is-animating ${className ?? ""}`}>
      {chars.map((char, index) => (
        <span
          key={`${index}-${char}`}
          className="t-digit"
          data-stagger={
            index === chars.length - 2 ? "1" : index === chars.length - 1 ? "2" : undefined
          }
        >
          {char}
        </span>
      ))}
    </span>
  );
}
