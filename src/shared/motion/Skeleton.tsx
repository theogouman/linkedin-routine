/**
 * transitions.dev · 14 — Skeleton loader and reveal.
 *
 * Les squelettes servent d'écran d'attente pendant qu'une route se rend côté
 * serveur (`loading.tsx`). Le volet « révélation » du snippet — le fondu
 * croisé squelette → contenu — vit dans `shared/components/Avatar.tsx`, où il
 * couvre le chargement de chaque portrait.
 */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="nc-card p-4">
      <div className="t-skel-skeleton is-pulsing flex items-start gap-3" style={{ position: "static" }}>
        <div className="nc-skel-bar shrink-0" style={{ width: 40, height: 40, borderRadius: 9999 }} />
        <div className="min-w-0 flex-1">
          <div className="nc-skel-bar" style={{ width: "44%", height: 14 }} />
          <div className="nc-skel-bar mt-2" style={{ width: "26%", height: 10 }} />
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: lines }, (_, index) => (
              <div
                key={index}
                className="nc-skel-bar"
                style={{ width: index === lines - 1 ? "62%" : "100%" }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonHeader() {
  return (
    <div className="t-skel-skeleton is-pulsing mb-4" style={{ position: "static" }}>
      <div className="nc-skel-bar" style={{ width: 120, height: 22 }} />
      <div className="nc-skel-bar mt-2" style={{ width: 80, height: 12 }} />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="t-skel-skeleton is-pulsing flex items-center gap-3 py-2.5" style={{ position: "static" }}>
      <div className="nc-skel-bar shrink-0" style={{ width: 34, height: 34, borderRadius: 9999 }} />
      <div className="min-w-0 flex-1">
        <div className="nc-skel-bar" style={{ width: "40%", height: 12 }} />
        <div className="nc-skel-bar mt-1.5" style={{ width: "22%", height: 10 }} />
      </div>
    </div>
  );
}
