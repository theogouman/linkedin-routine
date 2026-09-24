import { Suspense } from "react";
import { after } from "next/server";
import { AppNav } from "@/shared/components/AppNav";
import { BackToTop } from "@/shared/components/BackToTop";
import { NavBadge } from "@/shared/components/NavBadge";
import { countUnprocessedPosts } from "@/modules/feed/server/repository";
import { countUnprocessedComments } from "@/modules/inbox/server/repository";
import { countPendingActions } from "@/modules/engagement/server/repository";
import { drainOpportunistically } from "@/server/queue-service";

/**
 * Coquille de l'app.
 *
 * Les compteurs sont calculés ici et non dans chaque page : c'est la promesse
 * « inbox » du produit — savoir en permanence combien il reste, depuis
 * n'importe quel écran.
 *
 * Mais ils ne BLOQUENT plus le rendu. Chaque compteur est sa propre frontière
 * `Suspense` : la coquille et la navigation partent au premier octet, les
 * pastilles arrivent en streaming derrière. Avant, trois allers-retours
 * Postgres s'ajoutaient au temps d'affichage de chaque écran, y compris quand
 * l'écran lui-même était déjà prêt.
 */
// Rien ici n'est prérendu : les compteurs lisent la base à chaque affichage.
// Cela n'annule pas le streaming — `Suspense` découpe la réponse dynamique
// elle aussi, la coquille part d'abord et les pastilles suivent.
export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Purge opportuniste, APRÈS l'envoi de la réponse : elle n'ajoute aucune
  // latence à l'affichage. C'est le filet qui fait partir ce qui est dû même
  // si aucun ordonnanceur externe n'est configuré (le plan Hobby de Vercel
  // n'autorise qu'un cron par jour — cf. supabase/migrations/002).
  after(drainOpportunistically);

  return (
    <div className="nc-page min-h-dvh">
      <AppNav
        badges={{
          posts: (
            <Suspense fallback={null}>
              <PostsBadge />
            </Suspense>
          ),
          comments: (
            <Suspense fallback={null}>
              <CommentsBadge />
            </Suspense>
          ),
          queue: (
            <Suspense fallback={null}>
              <QueueBadge />
            </Suspense>
          ),
        }}
      />
      {/* La pilule flotte au-dessus du contenu : la gouttière la compense là
          où elle se trouve — en bas sur mobile, en haut sur desktop — pour
          qu'aucun élément ne se cache dessous. */}
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-[calc(112px+env(safe-area-inset-bottom,0px))] md:pt-[92px] md:pb-16">
        {children}
      </div>
      <BackToTop />
    </div>
  );
}

async function PostsBadge() {
  return <NavBadge count={await countUnprocessedPosts()} />;
}

async function CommentsBadge() {
  return <NavBadge count={await countUnprocessedComments()} />;
}

async function QueueBadge() {
  return <NavBadge count={await countPendingActions()} />;
}
