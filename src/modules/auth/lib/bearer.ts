/**
 * Jeton porteur des routes appelées sans navigateur.
 *
 * Le cookie de session ne sert à rien hors de l'app : une extension Chrome
 * s'exécute sur `linkedin.com`, et un cookie posé sur le domaine de l'app ne
 * la suit pas. Ces routes portent donc leur propre secret partagé, sur le même
 * modèle que `/api/cron/*` — vérifié dans le handler, pas dans le middleware.
 *
 * Le secret n'ouvre que la génération. La clé Anthropic, elle, ne quitte
 * jamais le serveur : une extension est un dossier lisible par quiconque a
 * accès à la machine, y mettre une clé d'API reviendrait à la publier.
 */

const MINIMUM_LENGTH = 24;

export function readBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S.*)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token === undefined || token === "" ? null : token;
}

/**
 * Comparaison à temps constant, sur le même principe que `verifyPassword` :
 * la durée de l'échec ne doit pas dire combien de caractères étaient bons.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export type BearerVerdict = "ok" | "non_configure" | "refuse";

/**
 * Trois issues et non deux : un secret absent du déploiement doit se
 * distinguer d'un jeton faux, sinon la seule piste qu'on a en cas de panne est
 * un 401 muet. La distinction est faite côté serveur, elle ne dit rien de plus
 * à un appelant non autorisé qu'un code de statut différent.
 */
export function verifyBearer(
  header: string | null | undefined,
  expected: string | undefined,
): BearerVerdict {
  // Un secret trop court est traité comme absent : il serait devinable, et
  // laisser passer une valeur de test oubliée est pire que refuser.
  if (expected === undefined || expected.length < MINIMUM_LENGTH) return "non_configure";
  const token = readBearer(header);
  if (token === null) return "refuse";
  return constantTimeEqual(token, expected) ? "ok" : "refuse";
}
