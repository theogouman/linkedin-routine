/* eslint-disable @next/next/no-img-element */

/**
 * Avatar d'un auteur.
 *
 * `<img>` brut plutôt que `next/image` : les URL d'avatars LinkedIn sont
 * signées et expirent, l'optimiseur de Next les mettrait en cache côté serveur
 * et servirait des images mortes. Ici, une image expirée retombe simplement
 * sur les initiales.
 */
export function Avatar({
  src,
  name,
  size = 40,
}: {
  src: string | null;
  name: string | null;
  size?: number;
}) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold"
      style={{
        width: size,
        height: size,
        background: "var(--color-surface-raised)",
        color: "var(--color-text-secondary)",
      }}
      aria-hidden
    >
      {src ? (
        <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initials
      )}
    </span>
  );
}
