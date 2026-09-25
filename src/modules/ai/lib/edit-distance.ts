/**
 * Distance d'édition normalisée entre la variante proposée et le texte publié.
 *
 * C'est l'indicateur central du journal (§9). Un taux de publication élevé ne
 * dit rien à lui seul : il peut cacher un générateur dont chaque proposition
 * est réécrite aux trois quarts. La distance sépare « ça marche » de « ça
 * donne un point de départ ».
 *
 * 0 = publié tel quel. 1 = entièrement réécrit.
 */

/**
 * Levenshtein sur deux lignes seulement.
 *
 * Une matrice complète coûterait `n × m` en mémoire pour un gain nul : on ne
 * veut pas le chemin d'édition, juste sa longueur. Sur des commentaires de
 * quelques centaines de signes ça ne changerait rien en pratique, mais c'est
 * la forme habituelle et elle ne coûte pas plus cher à écrire.
 */
export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (left[i - 1] === right[j - 1] ? 0 : 1);
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      current[j] = Math.min(substitution, deletion, insertion);
    }
    [previous, current] = [current, previous];
  }

  return previous[right.length] ?? 0;
}

/**
 * Comparaison sur le texte BRUT, sans replier la casse ni les espaces.
 *
 * Corriger une majuscule ou retirer une espace en trop est une retouche : la
 * normaliser reviendrait à compter comme « publié tel quel » un texte que Théo
 * a effectivement touché, et à surestimer le générateur exactement là où on
 * cherche à le mesurer.
 */
export function normalizedEditDistance(proposed: string, published: string): number {
  const longest = Math.max(proposed.length, published.length);
  if (longest === 0) return 0;
  return levenshtein(proposed, published) / longest;
}
