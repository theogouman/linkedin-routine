/**
 * Lecture des tokens de motion depuis le CSS.
 *
 * Les snippets transitions.dev exigent que le JS lise les durées dans
 * `:root` plutôt que de les redéclarer : un réglage changé dans la feuille de
 * style doit prendre effet sans retoucher le composant. On garde donc les
 * `getComputedStyle(...).getPropertyValue(...)`, avec une valeur de repli pour
 * le rendu serveur où `document` n'existe pas.
 */

export function motionMs(name: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function motionNumber(name: string, fallback: number): number {
  return motionMs(name, fallback);
}

export function motionEase(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw === "" ? fallback : raw;
}

/** Respecte le réglage système : aucune animation orchestrée en JS non plus. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
