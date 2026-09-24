"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { resumeQueueAction } from "@/app/actions";
import { relativeTime } from "@/shared/lib/format";
import { Alerts, type AlertItem } from "@/shared/components/Alerts";

/**
 * Bandeau de coupe-circuit (FR-018) et alertes voisines.
 *
 * Présent sur tous les écrans d'engagement, et pas seulement dans les
 * réglages : une file suspendue change le sens de chaque geste — commenter ne
 * publiera rien — et l'utilisateur doit le savoir avant d'écrire, pas après.
 *
 * Les alertes secondaires (comptes non récupérables, sources en échec) passent
 * par la même pile : elles informent, elles n'empêchent rien, et elles ne
 * doivent pas repousser le fil plus bas que le bandeau qui, lui, bloque.
 */
export function SuspendedBanner({
  reason,
  suspendedAt,
  restrictedAccounts = 0,
  failedSources = 0,
}: {
  reason: string | null;
  suspendedAt: string | null;
  restrictedAccounts?: number;
  failedSources?: number;
}) {
  const [pending, startTransition] = useTransition();

  const resume = () => {
    startTransition(async () => {
      const result = await resumeQueueAction();
      if (result.ok) toast.success(result.message ?? "File reprise.");
      else toast.error(result.message ?? "Reprise impossible.");
    });
  };

  const items: AlertItem[] = [];

  if (reason !== null || suspendedAt !== null) {
    items.push({
      id: "suspended",
      tone: "danger",
      title: "File de publication suspendue",
      body: (
        <>
          {reason ?? "Un signal de restriction a été détecté."}
          {suspendedAt ? ` Suspendue ${relativeTime(suspendedAt)}.` : ""} Rien ne partira tant
          que tu n&apos;auras pas repris la file à la main, et jamais avant 72 h.
        </>
      ),
      action: (
        <button
          type="button"
          onClick={resume}
          disabled={pending}
          className="nc-btn nc-btn--ghost nc-btn--sm"
          style={{ background: "#fff" }}
        >
          {pending ? "Vérification…" : "Tenter la reprise"}
        </button>
      ),
    });
  }

  if (failedSources > 0) {
    items.push({
      id: "sources",
      tone: "warning",
      title: `${failedSources} source${failedSources > 1 ? "s" : ""} en échec`,
      body: "Le curseur est resté en place : la prochaine actualisation reprendra la même fenêtre, rien ne sera manqué.",
    });
  }

  if (restrictedAccounts > 0) {
    items.push({
      id: "restricted",
      tone: "warning",
      title: `${restrictedAccounts} compte${restrictedAccounts > 1 ? "s" : ""} non récupérable${restrictedAccounts > 1 ? "s" : ""}`,
      body: "Profil privé, fermé ou introuvable. Ces comptes sont sortis du cycle de récupération.",
    });
  }

  return <Alerts items={items} />;
}
