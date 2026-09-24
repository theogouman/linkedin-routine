/**
 * Icônes de la famille Notion, redessinées.
 *
 * Les fichiers d'origine (`notion.so/icons/*_lightgray.svg`) ne sont pas
 * téléchargeables depuis l'environnement de build : la politique réseau du
 * conteneur refuse `notion.so` (403 du proxy). Elles sont donc retracées ici
 * dans la même grammaire — viewBox 16, trait 1,5, bouts et jonctions arrondis
 * — et en `currentColor`, ce que les fichiers `_lightgray` ne sont pas :
 * figés en gris clair, ils seraient illisibles en thème sombre et sur un
 * bouton actif.
 *
 * Remplacer par les fichiers d'origine se fait un bloc à la fois, sans toucher
 * au reste : chaque icône est une fonction isolée qui ne rend qu'un `<svg>`.
 */

function Icon({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** `reorder` — trois traits, le dernier plus court. Filtre par listes. */
export function ReorderIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
    </Icon>
  );
}

/** `list` — traits précédés de puces. Onglet « Listes ». */
export function ListIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M6 4h7.5M6 8h7.5M6 12h7.5" />
      <circle cx="3" cy="4" r=".85" fill="currentColor" stroke="none" />
      <circle cx="3" cy="8" r=".85" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r=".85" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** `clock-alternate` — filtre « À commenter ». */
export function ClockAlternateIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.5V8l2.5 1.5" />
    </Icon>
  );
}

/** `checkmark` — filtre « Déjà commenté ». */
export function CheckmarkIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 8.5L6.5 12L13 4.5" strokeWidth="1.8" />
    </Icon>
  );
}

/** `news` — onglet « Feed ». */
export function NewsIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 3.75h8.5v9.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
      <path d="M10.5 6h2.5a1 1 0 0 1 1 1v6.25a1 1 0 0 1-1 1" />
      <path d="M4 6.25h4.5M4 8.75h4.5M4 11.25h2.75" />
    </Icon>
  );
}

/** `inbox` — onglet « Inbox ». */
export function InboxIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 9.5h3l1 2h4l1-2h3" />
      <path d="M3.4 3h9.2l1.4 6.5v2.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9.5z" />
    </Icon>
  );
}

/** `timeline` — onglet « File » : ce qui va partir, et quand. */
export function TimelineIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 4h6M2 8h10M2 12h4" />
      <circle cx="10.5" cy="4" r="1.6" />
      <circle cx="6.5" cy="12" r="1.6" />
    </Icon>
  );
}

/** `gear` — onglet « Réglages ». */
export function GearIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="8" cy="8" r="2.15" />
      <path d="M8 1.6l1.05 1.62 1.9-.42.33 1.91 1.9.45-.5 1.87L14 8.35l-1.32 1.4.72 1.79-1.83.68-.14 1.94-1.92-.3L8 15.2l-1.51-1.34-1.92.3-.14-1.94-1.83-.68.72-1.79L2 8.35l1.32-1.32-.5-1.87 1.9-.45.33-1.91 1.9.42z" />
    </Icon>
  );
}

/** `view-off` — « Ignorer » : retirer du champ de vision. */
export function ViewOffIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2.2 2.2l11.6 11.6" />
      <path d="M6.3 6.4a2.2 2.2 0 0 0 3.05 3.16" />
      <path d="M4.2 4.45C2.9 5.35 1.9 6.6 1.4 8c1.2 2.8 3.7 4.6 6.6 4.6 1.08 0 2.1-.25 3-.7" />
      <path d="M11 11c1.7-.85 3.05-2.25 3.6-3.85-1.2-2.8-3.7-4.6-6.6-4.6-.7 0-1.37.1-2 .3" />
    </Icon>
  );
}

/** `dependency` — « Changer de liste » : rattacher ailleurs. */
export function DependencyIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="1.75" y="2" width="5" height="4" rx="1" />
      <rect x="9.25" y="10" width="5" height="4" rx="1" />
      <path d="M4.25 6v4.5a1.5 1.5 0 0 0 1.5 1.5h3.5" />
    </Icon>
  );
}

/** `delete` — « Supprimer le créateur ». */
export function DeleteIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2.5 4h11" />
      <path d="M6 4V2.75a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 .75.75V4" />
      <path d="M3.75 4l.6 8.4a1.2 1.2 0 0 0 1.2 1.1h4.9a1.2 1.2 0 0 0 1.2-1.1L12.25 4" />
      <path d="M6.6 6.75v4M9.4 6.75v4" />
    </Icon>
  );
}

/** `arrow-northeast` — sortir de l'app vers LinkedIn. */
export function ArrowNorthEastIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M4.5 11.5L11.5 4.5" />
      <path d="M5.75 4.5h5.75v5.75" />
    </Icon>
  );
}
