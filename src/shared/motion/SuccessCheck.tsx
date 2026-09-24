"use client";

/**
 * transitions.dev · 10 — Success check.
 *
 * Fondu + rotation + flou + rebond vertical, et le trait se dessine. Joué une
 * seule fois, au moment où une action passe réellement en file : c'est la
 * confirmation visuelle que la validation manuelle (FR-006) a abouti.
 *
 * `strokeDasharray` est passé en style inline : le snippet fixe `20` à titre
 * d'exemple, or la longueur réelle de CE tracé est ≈ 20,9 — sous-estimer
 * laisse le trait inachevé au bout de l'animation.
 */
const PATH_LENGTH = 21;

export function SuccessCheck({ shown, size = 18 }: { shown: boolean; size?: number }) {
  return (
    <span
      className="t-success-check"
      data-state={shown ? "in" : "out"}
      aria-hidden
      style={{ color: "var(--nc-status-accepted-text)" }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12.5L10 17.5L19 7"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ strokeDasharray: PATH_LENGTH, strokeDashoffset: PATH_LENGTH }}
        />
      </svg>
    </span>
  );
}
