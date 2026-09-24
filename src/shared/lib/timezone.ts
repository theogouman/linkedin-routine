/**
 * Arithmétique de dates dans un fuseau nommé, sans dépendance externe.
 *
 * Tout ce qui touche à la cadence d'envoi (fenêtre diurne, plafonds
 * journaliers, jours ouvrés — FR-017) raisonne en heure locale de
 * l'utilisateur, alors que la base et la file stockent de l'UTC. Ces deux
 * fonctions font le pont via `Intl`, qui connaît les règles de DST : un
 * décalage figé casserait deux fois par an, exactement au moment où la file
 * enverrait à 7 h ou à 20 h.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = dimanche … 6 = samedi, comme Date#getDay. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Décompose un instant en heure murale du fuseau donné. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    weekday: WEEKDAY_INDEX[lookup.weekday ?? "Sun"] ?? 0,
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // On perd les millisecondes en passant par Intl ; on les remet pour que
  // l'offset soit un multiple exact de la minute et non décalé de 1-999 ms.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * Construit l'instant correspondant à une heure murale du fuseau.
 *
 * Deux passes : la première estime l'offset à partir de l'instant naïf, la
 * seconde le corrige si l'estimation tombait de l'autre côté d'un changement
 * d'heure. Pendant l'heure "sautée" du printemps (2 h → 3 h en Europe), aucune
 * instant ne correspond : on retourne alors le premier instant après le saut,
 * ce qui est le comportement voulu pour « ouvrir la fenêtre à 8 h ».
 */
export function fromZonedTime(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    0,
  );
  let timestamp = naive - offsetMs(new Date(naive), timeZone);
  timestamp = naive - offsetMs(new Date(timestamp), timeZone);
  return new Date(timestamp);
}

/** Minutes écoulées depuis minuit local. */
export function minutesOfDay(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** Clé `YYYY-MM-DD` du jour local — sert à compter les envois par jour. */
export function localDateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minuit local du jour de `date`, en UTC. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return fromZonedTime({ year: p.year, month: p.month, day: p.day }, timeZone);
}

/** Minuit local du jour suivant `date`, en UTC. */
export function startOfNextLocalDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  const nextDay = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return fromZonedTime(
    {
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
    },
    timeZone,
  );
}

/** Nombre de jours calendaires locaux entre deux instants (b - a). */
export function daysBetweenLocal(a: Date, b: Date, timeZone: string): number {
  const pa = zonedParts(a, timeZone);
  const pb = zonedParts(b, timeZone);
  const ua = Date.UTC(pa.year, pa.month - 1, pa.day);
  const ub = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((ub - ua) / 86_400_000);
}
