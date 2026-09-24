/**
 * Normalisation des profils renvoyés par un lot d'enrichissement.
 *
 * Écrit à part et testé sans réseau, parce que deux pièges silencieux vivent
 * ici :
 *
 *  1. **L'appariement.** L'actor rend les profils dans un ordre qui n'est pas
 *     celui de la demande, et en omet ceux qu'il n'a pas trouvés. Se fier à
 *     l'index collerait la photo de quelqu'un d'autre sur un compte — une
 *     erreur qui ne lève aucune exception et qu'on ne voit qu'à l'œil.
 *  2. **La casse.** Les slugs sont insensibles à la casse, les identifiants
 *     opaques (`ACoA…`, 39 caractères) ne le sont pas. Tout mettre en
 *     minuscules pour comparer ferait manquer l'appariement des seconds.
 */

import { normalizeProfileUrl } from "@/shared/lib/linkedin-url";

export interface RawProfile {
  publicIdentifier: string | null;
  profileUrl: string | null;
  name: string | null;
  headline: string | null;
  avatarUrl: string | null;
}

export interface MatchedProfile extends RawProfile {
  /** URL canonique de la demande à laquelle ce profil correspond. */
  requestedUrl: string;
}

/**
 * Clé d'appariement d'une URL de profil : l'identifiant canonique.
 *
 * `normalizeProfileUrl` porte déjà la règle de casse — un identifiant opaque
 * garde la sienne, un slug passe en minuscules. On réutilise donc la même
 * fonction des deux côtés plutôt que de réimplémenter la règle.
 */
export function matchKey(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  const normalized = normalizeProfileUrl(value);
  return normalized.ok ? normalized.value.publicIdentifier : null;
}

/**
 * Apparie les profils renvoyés aux URLs demandées.
 *
 * Un profil qui ne correspond à aucune demande est écarté : mieux vaut un
 * compte qui reste sans photo qu'un compte affublé de celle d'un autre.
 */
export function matchProfiles(
  requestedUrls: string[],
  profiles: RawProfile[],
): MatchedProfile[] {
  const byKey = new Map<string, string>();
  for (const url of requestedUrls) {
    const key = matchKey(url);
    if (key !== null && !byKey.has(key)) byKey.set(key, url);
  }

  const matched: MatchedProfile[] = [];
  const used = new Set<string>();

  for (const profile of profiles) {
    // L'identifiant public est l'appariement le plus sûr ; l'URL rendue par
    // l'actor n'est qu'un repli, car elle peut être une forme de redirection.
    const key = matchKey(profile.publicIdentifier) ?? matchKey(profile.profileUrl);
    if (key === null) continue;
    const requestedUrl = byKey.get(key);
    if (requestedUrl === undefined || used.has(key)) continue;
    used.add(key);
    matched.push({ ...profile, requestedUrl });
  }

  return matched;
}

/**
 * Extrait l'URL de photo d'un item d'actor.
 *
 * Les fournisseurs rendent tantôt une chaîne (`photo`), tantôt un objet avec
 * une liste de tailles. On vise la plus grande taille disponible : les avatars
 * sont affichés en 34 à 40 px mais sur un écran à 3× de densité, une vignette
 * de 100 px est déjà floue.
 */
export function pickAvatarUrl(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  const sizes = record.sizes;
  if (Array.isArray(sizes)) {
    let best: { width: number; url: string } | null = null;
    for (const entry of sizes) {
      if (typeof entry !== "object" || entry === null) continue;
      const size = entry as Record<string, unknown>;
      const url = typeof size.url === "string" ? size.url : null;
      const width = typeof size.width === "number" ? size.width : 0;
      if (url === null) continue;
      if (best === null || width > best.width) best = { width, url };
    }
    if (best !== null) return best.url;
  }

  return typeof record.url === "string" && record.url.trim() !== "" ? record.url : null;
}
