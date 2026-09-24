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

/**
 * Hauteur libre sous la barre de navigation, en pixels.
 *
 * La pilule est en haut sur desktop et en bas sur mobile : on la mesure plutôt
 * que de coder deux constantes qui se désynchroniseraient du CSS. Sur mobile la
 * marge à retenir est l'encoche, que `.nc-page` porte déjà en padding — on la
 * lit là, plutôt que d'essayer d'évaluer `env()` en JavaScript.
 */
function viewportTopMargin(): number {
  if (typeof document === "undefined") return 0;
  const nav = document.querySelector(".nc-nav-pill-bar");
  const rect = nav?.getBoundingClientRect();
  if (rect && rect.top < window.innerHeight / 2) return rect.bottom + 12;
  const page = document.querySelector(".nc-page");
  const inset = page ? Number.parseFloat(getComputedStyle(page).paddingTop) : 0;
  return (Number.isFinite(inset) ? inset : 0) + 12;
}

/**
 * Ramène un élément sous la barre de navigation s'il est passé au-dessus.
 *
 * Sert au repli d'une publication longue : le bloc de texte perd plusieurs
 * centaines de pixels d'un coup, et le lecteur qui avait défilé dedans se
 * retrouve mécaniquement à la publication suivante — il a fermé un post et il
 * en regarde un autre. On le repose au sommet de celui qu'il vient de refermer.
 *
 * Aucun effet si l'élément est déjà visible : replier une carte qu'on voit en
 * entier ne doit pas faire bouger la page.
 */
export function anchorToTop(element: Element): void {
  if (typeof window === "undefined") return;
  const margin = viewportTopMargin();
  const top = element.getBoundingClientRect().top;
  if (top >= margin) return;
  const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollBy({ top: top - margin, behavior: smooth ? "smooth" : "auto" });
}
