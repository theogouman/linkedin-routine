/**
 * Ordre des écrans, source unique.
 *
 * Partagé par la barre de navigation et par la transition de page : le sens du
 * glissement se déduit de cet ordre, donc deux listes divergentes feraient
 * entrer un écran par le mauvais côté. Un test vérifie qu'aucune route de
 * l'app ne manque ici — c'est le seul garde-fou contre un écran ajouté et
 * jamais atteignable.
 */
export const NAV_ROUTES = ["/fil", "/inbox", "/file", "/listes", "/reglages"] as const;

export type NavRoute = (typeof NAV_ROUTES)[number];

/**
 * Onglet actif pour un chemin donné.
 *
 * `startsWith` nu ne convient PAS : « /file » commence par « /fil », donc
 * l'écran de la file allumait l'onglet du fil. La correspondance doit donc
 * s'arrêter à une frontière de segment — égalité, ou préfixe suivi d'un « / ».
 */
export function activeNavRoute(pathname: string): NavRoute | null {
  return (
    NAV_ROUTES.find(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    ) ?? null
  );
}
