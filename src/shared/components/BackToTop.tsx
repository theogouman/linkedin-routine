"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { scrollAppToTop } from "@/shared/lib/scroll";

/**
 * Retour en haut, desktop uniquement.
 *
 * Sur mobile la barre de navigation est déjà sous le pouce et un onglet actif
 * y remonte (cf. `AppNav`) : un bouton de plus n'y ajouterait qu'un obstacle
 * devant le contenu.
 *
 * Il n'apparaît qu'après deux hauteurs d'écran de défilement — au-dessus, le
 * haut de page est à un coup de molette et le bouton ne serait qu'une pièce
 * de décor.
 */
const REVEAL_AFTER_PX = 2000;

export function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > REVEAL_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      className="nc-back-to-top"
      data-shown={shown}
      onClick={() => scrollAppToTop()}
      aria-label="Revenir en haut"
      tabIndex={shown ? 0 : -1}
    >
      <ArrowUp size={16} aria-hidden />
    </button>
  );
}
