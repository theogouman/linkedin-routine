"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { BannerStack } from "@/shared/motion/BannerStack";

/**
 * transitions.dev · 32 — Banner stacking.
 *
 * Les alertes s'empilent au lieu de s'additionner. Trois bandeaux à la suite
 * repoussaient le fil — c'est-à-dire l'information qu'on vient réellement
 * chercher — sous la ligne de flottaison. Ici seule la plus récente est
 * lisible ; un clic étale la pile.
 *
 * L'ordre est celui de l'urgence : ce qui empêche de publier passe devant ce
 * qui dégrade la récupération.
 */
export type AlertTone = "danger" | "warning";

export interface AlertItem {
  id: string;
  tone: AlertTone;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}

const TONES: Record<AlertTone, { bg: string; border: string; title: string; body: string }> = {
  danger: {
    bg: "var(--nc-status-noshown-bg)",
    border: "rgba(153, 27, 27, 0.25)",
    title: "#991b1b",
    body: "#7f1d1d",
  },
  warning: {
    bg: "var(--nc-status-upcoming-bg)",
    border: "rgba(224, 98, 90, 0.25)",
    title: "var(--nc-status-upcoming-text)",
    body: "var(--nc-status-upcoming-text)",
  },
};

export function Alerts({ items }: { items: AlertItem[] }) {
  if (items.length === 0) return null;

  return (
    <BannerStack
      banners={items.map((item) => {
        const tone = TONES[item.tone];
        const Icon = item.tone === "danger" ? AlertTriangle : Info;
        return (
          <div
            key={item.id}
            className="rounded-[16px] border p-4"
            style={{ background: tone.bg, borderColor: tone.border }}
            role="alert"
          >
            <div className="flex items-start gap-2.5">
              <Icon size={18} className="mt-0.5 shrink-0" style={{ color: tone.title }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: tone.title }}>
                  {item.title}
                </p>
                <div className="mt-1 text-[13px]" style={{ color: tone.body }}>
                  {item.body}
                </div>
                {item.action ? <div className="mt-3">{item.action}</div> : null}
              </div>
            </div>
          </div>
        );
      })}
    />
  );
}
