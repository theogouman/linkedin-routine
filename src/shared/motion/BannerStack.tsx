"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * transitions.dev · 32 — Banner stacking.
 *
 * Les alertes s'empilent comme des toasts : la plus récente devant, les
 * précédentes reculées et floutées. Un clic étale la pile.
 *
 * La hauteur du conteneur est mesurée sur la bannière de tête, parce que les
 * bannières sont en position absolue : sans ça, la pile ne réserve aucune
 * place et le contenu passe dessous.
 */
export function BannerStack({
  banners,
  className,
}: {
  banners: ReactNode[];
  className?: string;
}) {
  const [spread, setSpread] = useState(false);
  const frontRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const visible = banners.slice(0, 3);

  useLayoutEffect(() => {
    const front = frontRef.current;
    if (!front) return;
    const measure = () => setHeight(front.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(front);
    return () => observer.disconnect();
  }, [visible.length]);

  if (visible.length === 0) return null;

  const spreadHeight =
    height === undefined ? undefined : height * visible.length + 8 * (visible.length - 1);

  return (
    <div
      className={`t-stack t-resize mb-3 ${spread ? "is-spread" : ""} ${className ?? ""}`}
      style={{ height: spread ? spreadHeight : height }}
      onClick={() => visible.length > 1 && setSpread((value) => !value)}
      role={visible.length > 1 ? "button" : undefined}
      tabIndex={visible.length > 1 ? 0 : undefined}
      onKeyDown={(event) => {
        if (visible.length > 1 && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          setSpread((value) => !value);
        }
      }}
    >
      {visible.map((banner, index) => (
        <div
          key={index}
          ref={index === 0 ? frontRef : undefined}
          className="t-stack-banner nc-stack-banner"
          data-depth={index}
        >
          {banner}
        </div>
      ))}
    </div>
  );
}
