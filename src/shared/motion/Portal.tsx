"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Sort un calque flottant du flux de la page.
 *
 * `position: fixed` se cale sur la fenêtre — SAUF si un ancêtre porte un
 * `transform`, un `filter` ou une `perspective`, qui en font un nouveau bloc
 * conteneur. Une visionneuse d'images rendue dans une carte s'ouvrait donc aux
 * dimensions de la carte au lieu de l'écran.
 *
 * Le remède durable n'est pas de traquer les ancêtres transformés — la
 * bibliothèque de transitions en pose partout — mais de monter le calque
 * directement sous `<body>`, où aucun ne peut l'atteindre.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // Le portail n'existe qu'après le montage : `document.body` n'est pas
  // disponible pendant le rendu serveur.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
