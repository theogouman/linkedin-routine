"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motionMs } from "./tokens";

/**
 * transitions.dev · 07 — Panel reveal.
 *
 * Le composer glisse dans la carte avec un cross-blur, plutôt que d'apparaître
 * d'un coup et de pousser tout ce qui est en dessous. Combiné à `t-resize` sur
 * la carte, l'agrandissement et l'arrivée du panneau sont une seule motion.
 *
 * Deux contraintes se croisent ici et expliquent la forme du composant :
 *
 *  · le panneau doit RESTER monté pendant sa fermeture, sinon la sortie ne
 *    joue pas — on démonte après la durée de fermeture, pas avant ;
 *  · il doit être monté UNE FRAME dans son état fermé avant de s'ouvrir,
 *    sinon il naît déjà ouvert et rien ne se transitionne.
 *
 * D'où le montage ajusté pendant le rendu (motif React officiel) et les
 * changements d'état confinés à des `requestAnimationFrame` / minuteurs :
 * aucun `setState` synchrone dans un effet, qui déclencherait une cascade de
 * rendus à chaque ouverture.
 */
export function PanelReveal({
  open,
  children,
  className,
  style,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;

    if (open) {
      const frame = window.requestAnimationFrame(() => setShown(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const frame = window.requestAnimationFrame(() => setShown(false));
    const timer = window.setTimeout(
      () => setMounted(false),
      motionMs("--panel-close-dur", 350),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open, mounted]);

  if (!mounted) return null;

  return (
    <div className={`t-panel-slide ${className ?? ""}`} data-open={shown} style={style}>
      {children}
    </div>
  );
}
