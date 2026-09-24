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
/**
 * Identifiant public d'un profil.
 *
 * Volontairement permissif : LinkedIn laisse mettre à peu près n'importe quoi
 * dans un slug, emoji compris (`/in/dorian-soler-☀️-254915147` est un profil
 * réel). Une version restreinte aux lettres et aux chiffres rejetait ces
 * comptes en silence — le pire des deux mondes, puisqu'un faux rejet perd un
 * créateur alors qu'un faux accord coûte au pire un compte qui ne remontera
 * jamais rien et restera marqué « en attente ».
 *
 * On exclut donc seulement ce qui ne peut pas être un identifiant : espaces,
 * séparateurs de chemin et de query. On exige en plus au moins une lettre ou
 * un chiffre, pour qu'une suite de ponctuation ne passe pas.
 */
const IDENTIFIER = /^[^\s/?#\\]+$/u;
const HAS_ALPHANUMERIC = /[\p{L}\p{N}]/u;

export function normalizeProfileUrl(input: string): ProfileUrlResult {
  const raw = input.trim();
  if (raw === "") return { ok: false, reason: "empty" };

  // Un identifiant nu (« theo-gouman ») est accepté : c'est ce qu'on obtient
  // en copiant la fin d'une URL, et le refuser serait une friction gratuite.
  if (!raw.includes("/") && !raw.includes(" ")) {
    if (!IDENTIFIER.test(raw) || !HAS_ALPHANUMERIC.test(raw)) {
      return { ok: false, reason: "not_a_url" };
    }
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
  if (!IDENTIFIER.test(identifier) || !HAS_ALPHANUMERIC.test(identifier)) {
    return { ok: false, reason: "missing_identifier" };
  }
  return { ok: true, value: canonical(identifier) };
}

/**
 * Identifiant opaque de membre LinkedIn (`/in/ACoAAAyy6A8B…`).
 *
 * LinkedIn sert deux formes d'URL de profil : le slug choisi par la personne,
 * et cet identifiant encodé. Les deux ne se normalisent PAS pareil — le slug
 * est insensible à la casse, celui-ci ne l'est pas du tout : le passer en
 * minuscules produit une URL morte. C'est la forme que renvoient la plupart
 * des outils qui lisent LinkedIn par API, donc le cas est courant, pas
 * marginal.
 *
 * Le motif est volontairement étroit : préfixe `ACoA` ET longueur exacte de
 * 39 caractères. Une version large (`ACoA` + « au moins dix caractères »)
 * capturait aussi un slug ordinaire comme `ACoAlade-Martin` et lui conservait
 * sa casse, alors qu'un slug doit être unifié en minuscules sous peine
 * d'entrer deux fois dans une liste.
 */
const OPAQUE_MEMBER_ID = /^ACoA[A-Za-z0-9_-]{35}$/;

function canonical(identifier: string): NormalizedProfile {
  const canonicalId = OPAQUE_MEMBER_ID.test(identifier)
    ? identifier
    : identifier.toLowerCase();
  return {
    url: `https://www.linkedin.com/in/${encodeURIComponent(canonicalId)}`,
    publicIdentifier: canonicalId,
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
