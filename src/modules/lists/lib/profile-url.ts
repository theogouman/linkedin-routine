/**
 * Normalisation des URLs de profil LinkedIn (FR-002).
 *
 * L'utilisateur colle ce qu'il a sous la main : une URL copiée depuis le
 * navigateur avec ses paramètres de tracking, une variante régionale
 * (fr.linkedin.com), un identifiant seul. Tout doit converger vers une forme
 * canonique, sans quoi le même compte entre deux fois dans une liste et ses
 * publications remontent en double.
 */

export interface NormalizedProfile {
  /** Forme canonique : `https://www.linkedin.com/in/<identifiant>`. */
  url: string;
  /** Le segment après `/in/`, décodé. */
  publicIdentifier: string;
}

export type ProfileUrlRejection =
  | "empty"
  | "not_a_url"
  | "not_linkedin"
  | "not_a_profile"
  | "missing_identifier";

export type ProfileUrlResult =
  | { ok: true; value: NormalizedProfile }
  | { ok: false; reason: ProfileUrlRejection };

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;
/** Identifiant public : lettres, chiffres, tirets — accents acceptés. */
const IDENTIFIER = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

export function normalizeProfileUrl(input: string): ProfileUrlResult {
  const raw = input.trim();
  if (raw === "") return { ok: false, reason: "empty" };

  // Un identifiant nu (« theo-gouman ») est accepté : c'est ce qu'on obtient
  // en copiant la fin d'une URL, et le refuser serait une friction gratuite.
  if (!raw.includes("/") && !raw.includes(" ")) {
    if (!IDENTIFIER.test(raw)) return { ok: false, reason: "not_a_url" };
    return { ok: true, value: canonical(raw) };
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: "not_a_url" };
  }

  if (!LINKEDIN_HOST.test(parsed.hostname)) {
    return { ok: false, reason: "not_linkedin" };
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  // Variantes localisées : /fr/in/xxx, /en-us/in/xxx.
  const inIndex = segments.findIndex((segment) => segment.toLowerCase() === "in");
  if (inIndex === -1) return { ok: false, reason: "not_a_profile" };

  const identifierSegment = segments[inIndex + 1];
  if (!identifierSegment) return { ok: false, reason: "missing_identifier" };

  let identifier: string;
  try {
    identifier = decodeURIComponent(identifierSegment);
  } catch {
    identifier = identifierSegment;
  }
  if (!IDENTIFIER.test(identifier)) {
    return { ok: false, reason: "missing_identifier" };
  }
  return { ok: true, value: canonical(identifier) };
}

function canonical(identifier: string): NormalizedProfile {
  const lower = identifier.toLowerCase();
  return {
    url: `https://www.linkedin.com/in/${encodeURIComponent(lower)}`,
    publicIdentifier: lower,
  };
}

export interface BulkParseResult {
  accepted: NormalizedProfile[];
  /** Entrées rejetées, avec leur texte d'origine pour les afficher telles quelles. */
  rejected: Array<{ input: string; reason: ProfileUrlRejection }>;
  /** Entrées valides mais déjà présentes plus haut dans le collage. */
  duplicates: NormalizedProfile[];
}

/**
 * Découpe un collage en masse et normalise chaque entrée.
 *
 * Séparateurs acceptés : saut de ligne, virgule, point-virgule, tabulation,
 * espace — un export de tableur, une liste Notion et un copier-coller brut
 * arrivent tous dans des formes différentes.
 */
export function parseBulkProfileUrls(text: string): BulkParseResult {
  const tokens = text
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => token !== "");

  const accepted: NormalizedProfile[] = [];
  const rejected: BulkParseResult["rejected"] = [];
  const duplicates: NormalizedProfile[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const result = normalizeProfileUrl(token);
    if (!result.ok) {
      rejected.push({ input: token, reason: result.reason });
      continue;
    }
    if (seen.has(result.value.publicIdentifier)) {
      duplicates.push(result.value);
      continue;
    }
    seen.add(result.value.publicIdentifier);
    accepted.push(result.value);
  }

  return { accepted, rejected, duplicates };
}

export const REJECTION_LABELS: Record<ProfileUrlRejection, string> = {
  empty: "entrée vide",
  not_a_url: "ni une URL ni un identifiant valide",
  not_linkedin: "ce n'est pas une URL linkedin.com",
  not_a_profile: "URL LinkedIn sans segment /in/ (page entreprise ou post ?)",
  missing_identifier: "identifiant de profil absent ou invalide",
};
