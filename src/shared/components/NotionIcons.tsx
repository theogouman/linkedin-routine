/**
 * Icônes de la famille Notion, telles que servies par
 * `notion.so/icons/<nom>_lightgray.svg`.
 *
 * Les tracés sont collés sans retouche : même viewBox, même géométrie, même
 * découpe de chemin que le fichier d'origine. La seule chose qui change est la
 * couleur — les variantes `_lightgray` la codent en dur (`#A6A299`), ce qui
 * rendrait l'onglet actif et le thème sombre illisibles ; les attributs de
 * couleur passent donc en `currentColor`, et rien d'autre.
 *
 * Chaque composant ne rend qu'un `<svg>`, ce qui permet de remplacer une icône
 * par une autre version d'origine sans toucher au reste du fichier.
 */

/**
 * Le fichier Notion a une taille fixe ; elle doit céder à la prop `size` pour
 * que l'icône reste à l'échelle de son bouton. `shrink-0` l'empêche d'être
 * écrasée dans les rangées flex.
 */
function Icon({
  size,
  viewBox,
  children,
}: {
  size: number;
  viewBox: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** `reorder` — icône du bouton de filtre par listes. */
export function ReorderIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M17.5 4.063v1.875h-15V4.063zm-15 6.875h15V9.062h-15zm0 5h15v-1.876h-15z"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `list` — onglet « Listes » et bouton de filtre « Listes ». */
export function ListIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M17.5 4.063v1.875H6.875V4.063zM6.875 10.938H17.5V9.062H6.875zm0 5H17.5v-1.876H6.875zM3.75 3.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5m0 5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5m0 5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `clock-alternate` — bascule « À commenter ». */
export function ClockAlternateIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M10.938 9.375h2.812v1.875H9.063V5.625h1.874zM17.5 10c0 4.14-3.36 7.5-7.5 7.5S2.5 14.14 2.5 10 5.86 2.5 10 2.5s7.5 3.36 7.5 7.5m-1.875 0a5.625 5.625 0 1 0-11.251.001A5.625 5.625 0 0 0 15.625 10"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `checkmark` — bascule « Déjà commenté ». */
export function CheckmarkIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M10 2.5c-4.14 0-7.5 3.36-7.5 7.5s3.36 7.5 7.5 7.5 7.5-3.36 7.5-7.5-3.36-7.5-7.5-7.5m-.937 11.325-3.438-3.437L6.95 9.063l2.113 2.112 4.3-4.3L14.688 8.2z"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `news` — onglet « Feed ». */
export function NewsIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="m15.938 3.125-1.25 1.25-1.25-1.25h-.626l-1.25 1.25-1.25-1.25h-.624l-1.25 1.25-1.25-1.25h-.625l-1.25 1.25-1.25-1.25h-.938v11.25c0 1.544.956 2.5 2.5 2.5h8.75c1.544 0 2.5-.956 2.5-2.5V3.125zM8.75 14.375H5v-3.75h3.75zm6.25 0h-5v-1.25h5zm0-2.5h-5v-1.25h5zm0-3.75H5v-1.25h10z"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `inbox` — onglet « Inbox ». */
export function InboxIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M15.834 2.5H4.166L2.5 12.5v5h15v-5zm-3.959 10c0 1.034-.84 1.875-1.875 1.875A1.876 1.876 0 0 1 8.125 12.5H4.4l1.353-8.125h8.49l1.354 8.125h-3.725z"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `timeline` — onglet « File ». */
export function TimelineIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M13.125 6.875h-7.5v-3.75h7.5zm2.5 1.25H1.875v3.75h13.75zm-6.25 5v3.75h8.75v-3.75z"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `gear` — onglet « Réglages ». */
export function GearIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M18.125 10.625v-1.25l-1.981-.494a6.4 6.4 0 0 0-.263-.981l1.469-1.419-.625-1.081-1.963.562q-.328-.39-.718-.718l.562-1.963-1.081-.625-1.419 1.469a6 6 0 0 0-.981-.263l-.494-1.98h-1.25l-.494 1.98q-.506.094-.98.263l-1.42-1.469-1.08.625.562 1.963q-.39.329-.719.718L3.288 5.4l-.625 1.081L4.13 7.9a6 6 0 0 0-.262.981l-1.982.494v1.25l1.982.494q.093.506.262.981l-1.469 1.419.626 1.081 1.962-.562q.33.39.719.718l-.563 1.963 1.082.625 1.418-1.469q.475.171.981.262l.494 1.982h1.25l.494-1.982q.508-.093.981-.262l1.419 1.469 1.081-.625-.562-1.963q.39-.33.718-.719l1.963.563.625-1.081L15.88 12.1a6 6 0 0 0 .263-.981zM5.625 10a4.36 4.36 0 0 1 1.428-3.228L8.916 10l-1.863 3.228A4.36 4.36 0 0 1 5.625 10m4.916-.938-1.866-3.23a4.374 4.374 0 0 1 5.597 3.231zm0 1.876h3.73a4.374 4.374 0 0 1-5.596 3.23z"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `view-off` — « Ignorer » dans le menu ⋅⋅⋅ d'un post. */
export function ViewOffIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M8.534 5.881 7.054 4.4c.9-.397 1.883-.65 2.95-.65 5.334 0 8.75 6.25 8.75 6.25s-.966 1.769-2.676 3.425l-1.956-1.956c.162-.46.256-.95.256-1.466a4.376 4.376 0 0 0-4.375-4.375c-.515 0-1.006.094-1.466.256zM10 14.375A4.376 4.376 0 0 1 5.625 10c0-.516.094-1.006.256-1.466L3.925 6.578C2.219 8.234 1.25 10.003 1.25 10.003s3.416 6.25 8.75 6.25c1.063 0 2.05-.25 2.95-.65l-1.481-1.481c-.46.162-.95.256-1.466.256zM1.875 2.759l15.366 15.366.884-.884L2.759 1.875z"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `dependency` — « Changer de liste » dans le menu ⋅⋅⋅. */
export function DependencyIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="m7.888 8.75 4.062 4.063-4.062 4.062-1.325-1.325 1.8-1.8H5.938c-2.657 0-4.375-1.719-4.375-4.375S3.28 5 5.938 5H8.75v1.875H5.938c-1.613 0-2.5.888-2.5 2.5s.887 2.5 2.5 2.5h2.425l-1.8-1.8zm7.737-5.625H10V8.75h5.625zM12.5 10v5.625h5.625V10z"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `delete` — « Supprimer le créateur » dans le menu ⋅⋅⋅. */
export function DeleteIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M13.75 5V3.75c0-1.544-.956-2.5-2.5-2.5h-2.5c-1.544 0-2.5.956-2.5 2.5V5H1.875v1.875h16.25V5zM8.125 3.75c0-.51.116-.625.625-.625h2.5c.51 0 .625.116.625.625V5h-3.75zM3.75 8.125h12.5L14.688 17.5H5.313z"
        fill="currentColor"
      />
    </Icon>
  );
}

/** `arrow-northeast` — « Ouvrir le post original ». */
export function ArrowNorthEastIcon({ size = 15 }: { size?: number }) {
  return (
    <Icon size={size} viewBox="0 0 20 20">
      <path
        d="M15.313 4.688v10.625h-1.876V7.888l-8.05 8.05-1.324-1.325 8.05-8.05H4.688V4.688z"
        fill="currentColor"
      />
    </Icon>
  );
}
