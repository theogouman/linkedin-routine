/**
 * Icônes de la famille Notion, redessinées.
 *
 * Les fichiers d'origine (`notion.so/icons/reorder_lightgray.svg`,
 * `clock-alternate_lightgray.svg`, `checkmark_lightgray.svg`) ne sont pas
 * téléchargeables depuis l'environnement de build : le proxy sortant refuse
 * `notion.so` (403). Elles sont donc retracées ici dans la même grammaire —
 * viewBox 16, trait plein, bouts arrondis — et surtout en `currentColor`, ce
 * que les fichiers `_lightgray` ne sont pas : figés en gris clair, ils
 * seraient illisibles en thème sombre et sur un bouton actif.
 *
 * Remplacer par les fichiers d'origine est une substitution d'un bloc.
 */

export function ReorderIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4h11M2.5 8h11M2.5 12h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ClockAlternateIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 4.5V8l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckmarkIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8.5L6.5 12L13 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
