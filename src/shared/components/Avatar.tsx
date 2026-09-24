"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

/**
 * Avatar d'un auteur.
 *
 * `<img>` brut plutôt que `next/image` : les URL d'avatars LinkedIn sont
 * signées et expirent, l'optimiseur de Next les mettrait en cache côté serveur
 * et servirait des images mortes.
 *
 * `onError` est ce qui rend la promesse « une image expirée retombe sur les
 * initiales » vraie. Sans lui, un avatar périmé affichait l'icône d'image
 * cassée du navigateur : le repli n'existait que pour les comptes sans photo
 * du tout, c'est-à-dire précisément le cas où il ne servait à rien.
 *
 * `referrerPolicy="no-referrer"` : le CDN de LinkedIn refuse certaines
 * requêtes selon l'origine déclarée. Ne rien déclarer passe.
 *
 * transitions.dev · 14 (Skeleton loader and reveal) — les initiales tiennent
 * la place et pulsent pendant le chargement, puis cèdent au portrait par
 * fondu croisé. Sur un fil de soixante publications, les photos arrivaient
 * sinon une par une en sautant dans la page.
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
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const initials = (name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const hasImage = src !== null && src !== "" && !broken;

  return (
    <span
      className={`t-skel inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold ${
        hasImage && loaded ? "is-revealed" : ""
      }`}
      style={{
        width: size,
        height: size,
        background: "var(--color-surface-raised)",
        color: "var(--color-text-secondary)",
      }}
      aria-hidden
    >
      {/* Le squelette n'est PAS en position absolue quand il n'y a pas de photo
          à révéler : il porte alors les initiales, qui sont le contenu final. */}
      <span
        className={`t-skel-skeleton ${hasImage ? "is-pulsing" : ""} flex items-center justify-center`}
        style={hasImage ? undefined : { position: "static" }}
      >
        <span>{initials}</span>
      </span>

      {hasImage ? (
        <span className="t-skel-content">
          <img
            src={src}
            alt=""
            width={size}
            height={size}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
          />
        </span>
      ) : null}
    </span>
  );
}
