import { REACTIONS, reaction as lookup, type ReactionType } from "@/shared/lib/reactions";

/**
 * Pastille de réaction : le tracé fourni, dans un cercle teinté.
 *
 * Les cinq premiers tracés sont ceux du jeu de SVG fourni, repris **au trait
 * près** ; seuls les `<metadata>` C2PA (8 Ko par fichier, pour 300 octets de
 * dessin) ont été retirés, et `stroke="currentColor"` laissé tel quel — c'est
 * lui qui permet à la couleur LinkedIn de piloter le trait.
 *
 * Le sixième, « Drôle », n'était PAS dans le fichier fourni. Il est dessiné
 * ici dans la même grammaire (viewBox 24, trait 1,75, bouts arrondis) parce
 * qu'une réaction manquante dans un menu de six se voit immédiatement. Si tu
 * as le tracé d'origine, il n'y a que ce bloc à remplacer.
 */
const PATHS: Record<ReactionType, React.ReactNode> = {
  like: (
    <>
      <path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z" />
      <path d="M7 10l4-7a2 2 0 0 1 3 2l-1 4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7" />
    </>
  ),
  celebrate: (
    <>
      <path d="M4 20l4.5-11 6.5 6.5z" />
      <path d="M13 3.5v2" />
      <path d="M18.5 9.5h2" />
      <path d="M17 5l-1.5 1.5" />
      <path d="M11 8c.8-1 1.2-2.2 1-3.5" />
      <path d="M16 13c1-.8 2.2-1.2 3.5-1" />
      <circle cx="20" cy="4" r=".6" fill="currentColor" />
      <circle cx="20.5" cy="15" r=".6" fill="currentColor" />
    </>
  ),
  support: (
    <>
      <path d="M12 11.5c-2-1.4-3.5-2.6-3.5-4.2A1.8 1.8 0 0 1 12 6.4a1.8 1.8 0 0 1 3.5.9c0 1.6-1.5 2.8-3.5 4.2z" />
      <path d="M2 14h3v7H2" />
      <path d="M5 15.5h4l3 1h2.5a1.5 1.5 0 0 1 0 3H10" />
      <path d="M14.5 19.5l4.6-2.6a1.5 1.5 0 0 1 1.8 2.3L17 21H5" />
    </>
  ),
  love: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  insightful: (
    <>
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
      <path d="M9.5 19h5" />
      <path d="M10.5 21.5h3" />
    </>
  ),
  funny: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 14.5h8a4 4 0 0 1-8 0z" />
      <path d="M8.5 9.5h2" />
      <path d="M13.5 9.5h2" />
    </>
  ),
};

export function ReactionIcon({
  type,
  size = 22,
  filled = false,
}: {
  type: ReactionType;
  /** Diamètre du cercle. Le tracé occupe ~60 % du disque, comme sur LinkedIn. */
  size?: number;
  /** Fond plein à la couleur de la réaction, trait blanc — pour l'état actif. */
  filled?: boolean;
}) {
  const entry = lookup(type);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: filled ? entry.color : entry.tint,
        color: filled ? "#fff" : entry.color,
      }}
      aria-hidden
    >
      <svg
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[type]}
      </svg>
    </span>
  );
}

export { REACTIONS };
