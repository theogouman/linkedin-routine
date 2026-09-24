/**
 * Remontée en haut de page.
 *
 * Centralisée parce que trois gestes l'appellent — le bouton de desktop, le
 * clic sur l'onglet du feed depuis le feed, et le changement de filtre — et
 * qu'ils doivent se comporter pareil. Le respect de `prefers-reduced-motion`
 * est porté ici, pas dans chaque appelant.
 */
export function scrollAppToTop(): void {
  if (typeof window === "undefined") return;
  const smooth =
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
}
