"use client";

import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
} from "react";
import { SkeletonCard } from "@/shared/motion/Skeleton";

/**
 * Coquille cliente du feed : elle possède la transition de navigation.
 *
 * Pourquoi elle existe. Changer de listes ne change pas de route, seulement
 * les paramètres d'URL : le routeur re-rend la page côté serveur et n'échange
 * le DOM qu'une fois la charge utile complète reçue. Une frontière `Suspense`
 * posée dans la page ne sert alors à rien — elle ne joue qu'au premier
 * chargement, pas sur une navigation cliente. Et `startTransition` demande
 * explicitement à React de GARDER l'écran précédent pendant l'attente, ce qui
 * est exactement l'effet « écran figé » qu'on cherche à supprimer.
 *
 * La coquille rend donc le squelette elle-même tant que la navigation est en
 * vol. La barre de filtres, elle, reste à l'écran : c'est elle qu'on vient de
 * manipuler, la faire disparaître serait désorientant.
 */
interface FeedNavigation {
  pending: boolean;
  navigate: (run: () => void) => void;
}

const FeedNavigationContext = createContext<FeedNavigation>({
  pending: false,
  navigate: (run) => run(),
});

export function useFeedNavigation(): FeedNavigation {
  return useContext(FeedNavigationContext);
}

export function FeedShell({
  toolbar,
  children,
}: {
  toolbar: ReactNode;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <FeedNavigationContext.Provider
      value={{ pending, navigate: (run) => startTransition(run) }}
    >
      {toolbar}
      {pending ? <FeedSkeleton /> : children}
    </FeedNavigationContext.Provider>
  );
}

/**
 * transitions.dev · 14 — les squelettes tiennent la place des cartes pendant
 * que la nouvelle sélection se charge. Trois suffisent : au-delà, on remplit
 * un écran que personne ne regarde.
 */
export function FeedSkeleton() {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <SkeletonCard key={index} lines={index === 0 ? 4 : 2} />
      ))}
    </div>
  );
}
