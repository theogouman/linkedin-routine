/**
 * transitions.dev · 24 — Learn more hover.
 *
 * Le chevron glisse et ses deux branches s'écartent autour de leur sommet :
 * la flèche s'ouvre au lieu d'être remplacée. Posé sur les liens qui quittent
 * l'app vers LinkedIn — les seuls endroits où on sort vraiment.
 *
 * Le chevron ne remplace jamais une icône porteuse de sens : sur un bouton
 * rond sans libellé, un « › » nu se lit « suivant », pas « ouvrir dans
 * LinkedIn ». Ces boutons gardent leur icône et reçoivent le mouvement sur
 * elle (`icon`), le chevron restant réservé aux liens qui portent un texte.
 */
export function LearnMoreLink({
  href,
  children,
  className,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** Icône à la place du chevron, pour un lien sans libellé visible. */
  icon?: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`t-learn inline-flex items-center gap-1 ${className ?? ""}`}
    >
      {children}
      {icon ? (
        <span className="t-learn-chevron">{icon}</span>
      ) : (
      <span className="t-learn-chevron">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            className="t-learn-arm t-learn-arm-top"
            d="M6 4L10 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            className="t-learn-arm t-learn-arm-bot"
            d="M10 8L6 12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      )}
    </a>
  );
}
