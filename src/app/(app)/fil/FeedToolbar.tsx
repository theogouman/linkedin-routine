"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, RefreshCw } from "lucide-react";
import { refreshNow } from "@/app/actions";
import { Dropdown } from "@/shared/motion/Dropdown";
import { MatrixLoader } from "@/shared/motion/MatrixLoader";
import { ScaleDownFade } from "@/shared/motion/ScaleDownFade";
import { TooltipGroup } from "@/shared/motion/Tooltip";
import { ListPickerMenu } from "@/shared/components/ListPickerMenu";
import {
  CheckmarkIcon,
  ClockAlternateIcon,
  ListIcon,
} from "@/shared/components/NotionIcons";
import { scrollAppToTop } from "@/shared/lib/scroll";
import { useFeedNavigation } from "./FeedShell";

/**
 * Filtres du feed (FR-003, FR-004).
 *
 * Le segment glissant a disparu : avec huit listes il défilait en long, et la
 * liste cherchée était toujours hors écran. Un menu à cases à cocher tient sur
 * un bouton, montre tout d'un coup et permet la sélection multiple, ce que le
 * segment ne permettait pas du tout.
 *
 * Le second filtre bascule entre « à commenter » et « déjà commenté ». Ce ne
 * sont pas deux réglages mais deux moments — vider la file, ou relire ce qu'on
 * a fait — donc un basculement et non une case de plus.
 */
function signature(scope: string, listIds: string[]): string {
  return `${scope}|${[...listIds].sort().join(",")}`;
}

/**
 * Tours d'actualisation enchaînés au maximum pour un clic. Dimensionné sur le
 * pire cas connu — plusieurs centaines de comptes à amorcer — avec de la marge.
 */
const MAX_REFRESH_ROUNDS = 12;

export function FeedToolbar({
  lists,
  selectedListIds,
  scope,
  lastSyncLabel,
}: {
  lists: Array<{ id: string; name: string; count: number }>;
  selectedListIds: string[];
  scope: "unprocessed" | "processed";
  lastSyncLabel: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [refreshing, startRefresh] = useTransition();
  // La transition de navigation appartient à la coquille : c'est elle qui
  // rend le squelette pendant que le serveur travaille.
  const { navigate } = useFeedNavigation();

  // État affiché, découplé de l'URL.
  //
  // `router.push` ne rend la main qu'après le rendu serveur du nouveau feed :
  // le bouton restait donc sur son ancien libellé pendant tout l'aller-retour,
  // et le basculement paraissait en retard d'une seconde sur le clic. Le
  // bouton bascule maintenant tout de suite, la navigation suit derrière, et
  // l'URL reprend la main quand elle arrive — si elle contredit l'affichage
  // (retour arrière, lien partagé), c'est elle qui gagne.
  const [shownScope, setShownScope] = useState(scope);
  const [shownListIds, setShownListIds] = useState(selectedListIds);
  const [syncedWith, setSyncedWith] = useState(() => signature(scope, selectedListIds));

  // Resynchronisation pendant le rendu (motif React officiel) : dès que l'URL
  // change vraiment, elle reprend la main sur l'affichage optimiste. Le faire
  // dans un effet coûterait un rendu de plus à chaque clic — exactement la
  // latence qu'on cherche à supprimer.
  const fromUrl = signature(scope, selectedListIds);
  if (fromUrl !== syncedWith) {
    setSyncedWith(fromUrl);
    setShownScope(scope);
    setShownListIds(selectedListIds);
  }

  const push = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const query = next.toString();
    // Dans une transition : la navigation ne bloque pas la peinture du nouvel
    // état du bouton, et React garde l'écran précédent visible pendant que le
    // segment se rend au lieu de le vider.
    navigate(() => {
      router.push(query === "" ? "/fil" : `/fil?${query}`);
    });
    // Changer de filtre change la file : rester au milieu de l'ancienne
    // n'aurait pas de sens, les éléments sous les yeux ne sont plus les mêmes.
    scrollAppToTop();
  };

  const toggleList = (id: string, next: boolean) => {
    const optimistic = new Set(shownListIds);
    if (next) optimistic.add(id);
    else optimistic.delete(id);
    setShownListIds([...optimistic]);

    push((query) => {
      const current = new Set(shownListIds);
      if (next) current.add(id);
      else current.delete(id);
      if (current.size === 0) query.delete("liste");
      else query.set("liste", [...current].join(","));
    });
  };

  const toggleScope = () => {
    const next = shownScope === "unprocessed" ? "processed" : "unprocessed";
    setShownScope(next);
    push((query) => {
      if (next === "processed") query.set("vue", "traite");
      else query.delete("vue");
    });
  };

  /**
   * L'actualisation s'ENCHAÎNE jusqu'à épuisement du retard.
   *
   * Un passage est borné par le budget de la fonction serverless : à plusieurs
   * centaines de comptes, il s'arrête avec un reste. Demander à l'utilisateur
   * de recliquer sept fois n'est pas un réglage, c'est une corvée — et rien ne
   * lui dit combien de fois. On relance donc ici, côté client : chaque tour est
   * une invocation neuve avec son propre budget, et le toast dit où l'on en est.
   *
   * Le plafond de tours existe pour qu'un `remaining` qui ne descendrait pas —
   * un fournisseur qui échoue sur tous les comptes, par exemple — ne boucle pas
   * indéfiniment.
   */
  const refresh = () => {
    startRefresh(async () => {
      const id = "feed-refresh";
      let posts = 0;
      let comments = 0;
      let rounds = 0;
      let remaining = 0;
      let warning: string | undefined;

      for (;;) {
        const result = await refreshNow("all");
        if (!result.ok) {
          toast.error(result.message ?? "Actualisation impossible.", { id });
          return;
        }
        rounds += 1;
        posts += result.posts ?? 0;
        comments += result.comments ?? 0;
        remaining = result.remaining ?? 0;
        if (result.message) warning = result.message;

        if (remaining <= 0 || rounds >= MAX_REFRESH_ROUNDS) break;
        toast.loading(
          `Rattrapage en cours — ${remaining} compte${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""}.`,
          { id },
        );
        // Le fil se remplit sous les yeux plutôt qu'en bloc à la fin : à trois
        // ou quatre tours, l'attente est assez longue pour qu'un écran figé
        // ressemble à une panne.
        router.refresh();
      }

      const parts: string[] = [];
      if (posts) parts.push(`${posts} publication${posts > 1 ? "s" : ""}`);
      if (comments) parts.push(`${comments} commentaire${comments > 1 ? "s" : ""}`);
      toast.success(
        [
          parts.length ? `${parts.join(" · ")} récupéré(s).` : "Rien de nouveau.",
          remaining > 0
            ? `${remaining} compte${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""} — relance pour continuer.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        { id },
      );
      if (warning) toast.warning(warning);
      router.refresh();
    });
  };

  const count = shownListIds.length;
  const listLabel = count === 0 ? "Listes" : `${count} liste${count > 1 ? "s" : ""}`;

  return (
    <TooltipGroup className="nc-tt-row mb-1 items-center gap-2">
      <Dropdown
        label="Filtrer par liste"
        origin="top-left"
        align="left"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            className="nc-btn nc-btn--surface nc-btn--sm shrink-0"
            data-active={count > 0}
          >
            <ListIcon />
            {listLabel}
            <ChevronDown
              size={14}
              aria-hidden
              className="transition-transform"
              style={{ transform: open ? "rotate(180deg)" : undefined }}
            />
          </button>
        )}
      >
        {() => (
          <ListPickerMenu
            lists={lists}
            selected={shownListIds}
            onToggle={toggleList}
            footer={
              count > 0 ? (
                <button
                  type="button"
                  className="nc-menu-item w-full"
                  onClick={() => push((query) => query.delete("liste"))}
                >
                  Toutes les listes
                </button>
              ) : null
            }
          />
        )}
      </Dropdown>

      {/* animate-text · scale-down-fade — le libellé ET son icône basculent
          ensemble : ce sont deux façons de dire la même chose, les séparer
          ferait clignoter l'un pendant que l'autre glisse. */}
      <button
        type="button"
        onClick={toggleScope}
        className="nc-btn nc-btn--surface nc-btn--sm shrink-0"
        data-active={shownScope === "processed"}
        aria-pressed={shownScope === "processed"}
      >
        <ScaleDownFade swapKey={shownScope}>
          {shownScope === "processed" ? (
            <>
              <CheckmarkIcon />
              Déjà commenté
            </>
          ) : (
            <>
              <ClockAlternateIcon />
              À commenter
            </>
          )}
        </ScaleDownFade>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="nc-icon-btn shrink-0"
        data-tooltip={`Dernière actualisation : ${lastSyncLabel}`}
        aria-label="Actualiser"
      >
        {refreshing ? <MatrixLoader variant="orbit" /> : <RefreshCw size={16} aria-hidden />}
      </button>
    </TooltipGroup>
  );
}
