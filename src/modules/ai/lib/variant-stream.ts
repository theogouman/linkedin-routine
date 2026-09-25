/**
 * Lecture au fil de l'eau de la sortie JSON du générateur.
 *
 * Le modèle écrit `{"post_exploitable": …, "variantes": [{…}, {…}, …]}` token
 * par token. Attendre la fin pour afficher quoi que ce soit, c'est faire
 * patienter Théo le temps des quatre textes alors que le premier est prêt au
 * quart du trajet. Ce module repère, dans le texte partiel, les objets
 * `variantes[i]` déjà REFERMÉS et les rend dès qu'ils le sont.
 *
 * Il ne tente pas de lire un objet à moitié écrit : un texte tronqué affiché
 * puis réécrit sous les yeux se lit comme un bug. Une variante apparaît donc
 * entière ou pas du tout.
 *
 * Pur et sans dépendance, pour être testé sans réseau.
 */

const VARIANTES_KEY = /"variantes"\s*:\s*\[/;
const EXPLOITABLE_KEY = /"post_exploitable"\s*:\s*(true|false)/;

/** Objets complets du tableau `variantes`, dans l'ordre d'écriture. */
export function completedVariantObjects(snapshot: string): unknown[] {
  const match = VARIANTES_KEY.exec(snapshot);
  if (!match) return [];

  const objects: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let index = match.index + match[0].length; index < snapshot.length; index += 1) {
    const char = snapshot[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        try {
          objects.push(JSON.parse(snapshot.slice(start, index + 1)));
        } catch {
          // Un objet refermé mais illisible ne bloque pas les suivants : la
          // validation finale, elle, verra le problème et relancera l'appel.
        }
        start = -1;
      }
    } else if (char === "]" && depth === 0) {
      break;
    }
  }

  return objects;
}

/** `post_exploitable`, dès qu'il est écrit — c'est la première clé du schéma. */
export function readPostExploitable(snapshot: string): boolean | null {
  const match = EXPLOITABLE_KEY.exec(snapshot);
  return match ? match[1] === "true" : null;
}

/**
 * Extracteur à état : chaque appel rend uniquement les objets apparus depuis
 * le précédent. Le texte complet est relu à chaque fois — il fait moins de
 * trois kilo-octets, la relecture coûte moins qu'un état de parseur à tenir.
 */
export function createVariantExtractor(): (snapshot: string) => unknown[] {
  let emitted = 0;
  return (snapshot) => {
    const objects = completedVariantObjects(snapshot);
    if (objects.length <= emitted) return [];
    const fresh = objects.slice(emitted);
    emitted = objects.length;
    return fresh;
  };
}
