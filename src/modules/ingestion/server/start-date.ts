import "server-only";

import { APP_TIMEZONE } from "@/shared/lib/env";
import { readSetting, writeSetting } from "@/shared/lib/settings";
import { startOfLocalDay } from "@/shared/lib/timezone";

/**
 * Date de départ du corpus (FR-003).
 *
 * Stockée en base et non en variable d'environnement, parce que c'est une
 * décision éditoriale qui se prend depuis l'app : « le fil commence ce
 * jour-là ». Elle borne toutes les fenêtres de récupération, y compris celle
 * d'un compte ajouté dans six mois — sans quoi chaque nouveau créateur ferait
 * remonter sept jours d'archive que personne n'a demandés.
 *
 * Son effet principal est un effet de coût : à plusieurs centaines de comptes,
 * demander le jour même plutôt que la semaine change la nature de l'amorçage.
 */
const KEY = "ingestion_start_date";

export async function readIngestionStart(): Promise<Date | null> {
  const raw = await readSetting<string>(KEY);
  if (typeof raw !== "string" || raw === "") return null;
  const parsed = new Date(raw);
  // Une valeur illisible ne doit pas se traduire par une borne au 1ᵉʳ janvier
  // 1970 — c'est-à-dire par aucune borne du tout, silencieusement.
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function writeIngestionStart(date: Date): Promise<void> {
  await writeSetting(KEY, date.toISOString());
}

/** Minuit local du jour de `now`, dans le fuseau de l'app. */
export function startOfToday(now: Date = new Date()): Date {
  return startOfLocalDay(now, APP_TIMEZONE);
}
