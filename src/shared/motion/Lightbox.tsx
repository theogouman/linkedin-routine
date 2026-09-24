"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { motionMs } from "./tokens";

/**
 * Agrandissement d'une image du fil.
 *
 * Bâti sur la grammaire du modal (transitions.dev · 06) plutôt que sur un
 * fondu nu : l'image monte en échelle depuis sa position, ce qui dit d'où elle
 * vient. Le fond s'assombrit sur son propre rythme, pour que la photo arrive
 * avant le noir et non l'inverse.
 *
 * Défilement de la page verrouillé pendant l'ouverture : sur téléphone, une
 * page qui continue de défiler derrière une visionneuse plein écran donne
 * l'impression que le geste a raté.
 */
export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(src !== null);
  const [shown, setShown] = useState(false);

  if (src !== null && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    if (src !== null) {
      const frame = window.requestAnimationFrame(() => setShown(true));
      return () => window.cancelAnimationFrame(frame);
    }
    const frame = window.requestAnimationFrame(() => setShown(false));
    const timer = window.setTimeout(
      () => setMounted(false),
      motionMs("--modal-close-dur", 150),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [src, mounted]);

  useEffect(() => {
    if (src === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [src, onClose]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{
        background: "rgba(0, 0, 0, 0.82)",
        opacity: shown ? 1 : 0,
        transition: `opacity var(--modal-${shown ? "open" : "close"}-dur) var(--modal-ease)`,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt && alt !== "" ? alt : "Image en grand"}
    >
      <img
        src={src ?? ""}
        alt={alt ?? ""}
        className="t-modal max-h-full max-w-full rounded-[12px] object-contain"
        data-open={shown}
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "scale(1)" : "scale(var(--modal-scale))",
          transition: `transform var(--modal-${shown ? "open" : "close"}-dur) var(--modal-ease), opacity var(--modal-${shown ? "open" : "close"}-dur) var(--modal-ease)`,
        }}
        onClick={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: "rgba(255, 255, 255, 0.12)",
          color: "#fff",
          top: "calc(16px + env(safe-area-inset-top, 0px))",
        }}
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
