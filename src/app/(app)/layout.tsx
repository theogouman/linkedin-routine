import { after } from "next/server";
import { BottomNav } from "@/shared/components/BottomNav";
import { countUnprocessedPosts } from "@/modules/feed/server/repository";
import { countUnprocessedComments } from "@/modules/inbox/server/repository";
import { getPendingActions } from "@/modules/engagement/server/repository";
import { drainOpportunistically } from "@/server/queue-service";

export const dynamic = "force-dynamic";

/**
 * Coquille de l'app.
 *
 * Les compteurs sont calculés ici et non dans chaque page : c'est la promesse
 * « inbox » du produit — savoir en permanence combien il reste, depuis
 * n'importe quel écran.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Purge opportuniste, APRÈS l'envoi de la réponse : elle n'ajoute aucune
  // latence à l'affichage. C'est le filet qui fait partir ce qui est dû même
  // si aucun ordonnanceur externe n'est configuré (le plan Hobby de Vercel
  // n'autorise qu'un cron par jour — cf. supabase/migrations/002).
  after(drainOpportunistically);

  const [posts, comments, pending] = await Promise.all([
    countUnprocessedPosts(),
    countUnprocessedComments(),
    getPendingActions(),
  ]);

  return (
    <div className="nc-page min-h-dvh">
      {/* pb : hauteur de la barre flottante + safe-area, pour que le dernier
          élément de chaque liste ne se cache jamais dessous. */}
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-[calc(112px+env(safe-area-inset-bottom,0px))]">
        {children}
      </div>
      <BottomNav counts={{ posts, comments, queue: pending.length }} />
    </div>
  );
}
