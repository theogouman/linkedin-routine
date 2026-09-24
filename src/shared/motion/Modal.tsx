"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motionMs } from "./tokens";
import { Portal } from "./Portal";

/**
 * transitions.dev · 06 — Modal open / close.
 *
 * Remplace `window.prompt` / `window.confirm`. En PWA installée, les boîtes
 * natives affichent le nom d'hôte et cassent net l'illusion d'application ;
 * elles sont aussi impossibles à styler et bloquent le fil d'exécution.
 *
 * `.is-closing` est retirée au bout de la durée de fermeture : sans ce
 * nettoyage, la prochaine ouverture repart de l'échelle de fermeture au lieu
 * de l'échelle de repos, et le modal « saute » (piège documenté par le skill).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Montage ajusté pendant le rendu (motif React officiel) : le dialogue doit
  // exister UNE FRAME dans son état fermé, sinon il naît déjà ouvert et rien
  // ne se transitionne.
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;

    if (open) {
      const frame = window.requestAnimationFrame(() => {
        setClosing(false);
        setShown(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const frame = window.requestAnimationFrame(() => {
      setShown(false);
      setClosing(true);
    });
    // `.is-closing` est retirée EN MÊME TEMPS que le démontage : sans ce
    // nettoyage, la prochaine ouverture repartirait de l'échelle de fermeture
    // au lieu de l'échelle de repos — le piège que le skill documente.
    const timer = window.setTimeout(() => {
      setClosing(false);
      setMounted(false);
    }, motionMs("--modal-close-dur", 150));
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.38)",
        opacity: shown ? 1 : 0,
        transition: `opacity var(--modal-${shown ? "open" : "close"}-dur) var(--modal-ease)`,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`t-modal nc-card w-full max-w-sm p-4 ${shown ? "is-open" : ""} ${closing ? "is-closing" : ""}`}
      >
        <p className="text-[15px] font-semibold">{title}</p>
        <div className="mt-3">{children}</div>
        {footer ? <div className="mt-4 flex items-center justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
    </Portal>
  );
}
