import type { Badge, CheckedVariante } from "./comment-checks";
import type { Slot } from "./comment-variants";

/**
 * Forme sérialisable d'une variante, telle qu'elle traverse la frontière
 * serveur → client. Les expressions régulières et les objets d'erreur restent
 * côté serveur ; ce qui passe est ce qui s'affiche.
 *
 * Partagée par la Server Action et la route en flux : les deux chemins doivent
 * rendre exactement la même chose au composant.
 */
export interface VarianteView {
  slot: Slot;
  texte: string;
  extraitPost: string;
  faitUtilise: string | null;
  positionUtilisee: string | null;
  coquille: boolean;
  badges: Badge[];
}

export function toVarianteView(variante: CheckedVariante): VarianteView {
  return {
    slot: variante.slot,
    texte: variante.texte,
    extraitPost: variante.extrait_post,
    faitUtilise: variante.fait_utilise,
    positionUtilisee: variante.position_utilisee,
    coquille: variante.coquille,
    badges: variante.badges,
  };
}
