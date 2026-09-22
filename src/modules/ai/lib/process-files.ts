/**
 * Chargement des deux process de génération (FR-007).
 *
 * Les process vivent dans des fichiers Markdown versionnés du dépôt, pas en
 * base : ils s'écrivent, se relisent et se révisent comme du code, avec un
 * historique. L'utilisateur peut les modifier et commiter sans redéployer quoi
 * que ce soit — le fichier est relu à chaque génération.
 */

export type ProcessKind = "comment_on_post" | "reply_to_comment";

export const PROCESS_FILES: Record<ProcessKind, string> = {
  comment_on_post: "commentaire-sur-post.md",
  reply_to_comment: "reponse-a-commentaire.md",
};

/**
 * Retire le titre de niveau 1 et le bloc de citation d'en-tête.
 *
 * Ces deux éléments s'adressent à la personne qui édite le fichier (« ceci est
 * un placeholder, remplace-le »), pas au modèle. Les envoyer tels quels ferait
 * fuiter des méta-instructions dans le prompt.
 */
export function stripEditorialHeader(markdown: string): string {
  const lines = markdown.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed === "") {
      index += 1;
      continue;
    }
    if (trimmed.startsWith("# ") || trimmed.startsWith(">")) {
      index += 1;
      continue;
    }
    break;
  }

  return lines.slice(index).join("\n").trim();
}

/**
 * Le process livré au build porte-t-il encore son marqueur de placeholder ?
 *
 * On teste le marqueur explicite plutôt qu'une longueur : les placeholders
 * livrés sont volontairement étoffés (ils servent d'exemple de structure), et
 * un process réel peut tenir en cinq lignes. Le seul signal fiable est celui
 * que l'utilisateur supprime en rédigeant.
 *
 * Sert uniquement à afficher un avertissement dans les réglages — la
 * génération fonctionne dans les deux cas.
 */
const PLACEHOLDER_MARKER = /\*\*Placeholder\.?\*\*/i;

export function isPlaceholder(markdown: string): boolean {
  if (PLACEHOLDER_MARKER.test(markdown)) return true;
  return stripEditorialHeader(markdown).trim() === "";
}
