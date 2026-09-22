/** Formatage des dates pour l'affichage. Pur, testé. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Âge relatif court, à la manière d'un fil : « il y a 3 h », « hier ».
 *
 * Au-delà d'une semaine on bascule sur la date : « il y a 23 j » ne dit plus
 * rien d'utile, alors qu'une date situe la publication.
 */
export function relativeTime(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const delta = now.getTime() - date.getTime();

  if (Number.isNaN(delta)) return "";
  if (delta < 0) return "à l'instant";
  if (delta < MINUTE) return "à l'instant";
  if (delta < HOUR) return `il y a ${Math.floor(delta / MINUTE)} min`;
  if (delta < DAY) return `il y a ${Math.floor(delta / HOUR)} h`;
  if (delta < 2 * DAY) return "hier";
  if (delta < 7 * DAY) return `il y a ${Math.floor(delta / DAY)} j`;

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}

/** Échéance d'un envoi programmé : « aujourd'hui à 14:32 », « lun. à 8:00 ». */
export function scheduledLabel(
  value: string | Date,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);

  const sameDay = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone });
  if (sameDay.format(date) === sameDay.format(now)) return `aujourd'hui à ${time}`;

  const tomorrow = new Date(now.getTime() + DAY);
  if (sameDay.format(date) === sameDay.format(tomorrow)) return `demain à ${time}`;

  const day = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
  return `${day} à ${time}`;
}

export function formatMinuteOfDay(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseMinuteOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
