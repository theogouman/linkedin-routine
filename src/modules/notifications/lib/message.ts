/**
 * Composition du message de notification (FR-014).
 *
 * Pur, donc testable : c'est le seul texte que l'utilisateur voit quand il
 * n'est pas dans l'app, et il doit dire en trois mots s'il vaut la peine de
 * l'ouvrir.
 */

export interface PendingCounts {
  posts: number;
  comments: number;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/**
 * Retourne `null` quand il n'y a rien à traiter : on n'envoie pas de
 * notification « rien de neuf ». Une notification qui ne mérite pas d'être
 * ouverte apprend à l'utilisateur à les ignorer toutes.
 */
export function buildPushMessage(counts: PendingCounts): PushMessage | null {
  const { posts, comments } = counts;
  if (posts <= 0 && comments <= 0) return null;

  if (posts > 0 && comments > 0) {
    return {
      title: "À traiter",
      body: `${plural(posts, "publication", "publications")} et ${plural(comments, "commentaire reçu", "commentaires reçus")}.`,
      url: "/fil",
    };
  }
  if (posts > 0) {
    return {
      title: "Nouvelles publications",
      body: `${plural(posts, "publication non traitée", "publications non traitées")} dans ton fil.`,
      url: "/fil",
    };
  }
  return {
    title: "Nouveaux commentaires",
    body: `${plural(comments, "commentaire attend", "commentaires attendent")} une réponse.`,
    url: "/inbox",
  };
}

/** Expression cron correspondant à N vérifications par jour (FR-014). */
export function checksPerDayToCron(checksPerDay: number): string {
  const safe = Math.min(24, Math.max(1, Math.round(checksPerDay)));
  if (safe === 1) return "0 8 * * *";
  const interval = Math.max(1, Math.floor(24 / safe));
  return `0 8/${interval} * * *`;
}
