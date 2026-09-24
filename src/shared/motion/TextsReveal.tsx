"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * transitions.dev · 18 — Texts reveal.
 *
 * Montée floutée décalée pour deux lignes empilées : l'œil se pose sur le
 * titre avant que la ligne de service n'arrive. Utilisé sur les en-têtes de
 * page et les états vides, pas ailleurs — le décalage n'a de sens que là où il
 * y a une hiérarchie à lire.
 */
export function TextsReveal({
  lines,
  className,
}: {
  lines: [ReactNode, ReactNode?];
  className?: string;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Une frame de décalage, sinon l'élément naît déjà dans son état de repos
    // et rien ne se transitionne.
    const id = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const [first, second] = lines;

  return (
    <span className={`t-stagger ${shown ? "is-shown" : ""} ${className ?? ""}`}>
      <span className="t-stagger-line">{first}</span>
      {second !== undefined && second !== null ? (
        <span className="t-stagger-line t-stagger-line--2">{second}</span>
      ) : null}
    </span>
  );
}
