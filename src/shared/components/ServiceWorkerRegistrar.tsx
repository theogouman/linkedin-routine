"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (PWA, FR-011).
 *
 * Monté dans le layout racine pour qu'il s'enregistre quelle que soit la page
 * d'entrée — y compris l'écran de connexion, seule page visitée avant que
 * l'app ne soit installée.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Un enregistrement raté dégrade l'app en site classique : elle reste
        // pleinement utilisable en ligne, on ne dérange pas l'utilisateur.
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
