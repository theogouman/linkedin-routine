import { SkeletonCard, SkeletonHeader } from "@/shared/motion/Skeleton";

/**
 * transitions.dev · 14 — Skeleton loader.
 *
 * Affiché INSTANTANÉMENT par l'App Router pendant que le segment se rend côté
 * serveur. C'est ce qui change la nature de la navigation : l'écran arrive au
 * clic, avec sa structure, et se remplit — au lieu de laisser l'écran
 * précédent figé le temps de l'aller-retour Postgres.
 */
export default function FeedLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="t-skel-skeleton is-pulsing mb-1 flex items-center gap-2" style={{ position: "static" }}>
        <div className="nc-skel-bar flex-1" style={{ height: 36, borderRadius: 48 }} />
        <div className="nc-skel-bar" style={{ width: 72, height: 36, borderRadius: 48 }} />
        <div className="nc-skel-bar" style={{ width: 38, height: 38, borderRadius: 9999 }} />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} lines={index === 0 ? 4 : 3} />
        ))}
      </div>
    </>
  );
}
