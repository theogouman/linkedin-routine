/**
 * Embeddings, calculés par Supabase.
 *
 * `gte-small`, embarqué dans le runtime des Edge Functions : 384 dimensions,
 * vecteurs normalisés, aucun appel sortant, aucun coût par requête. Anthropic
 * ne produit pas d'embeddings et renvoie vers des partenaires ; on évite ainsi
 * un fournisseur, une clé et une facture pour la seule sélection de l'exemple
 * thématique.
 *
 * Deux usages, un seul endpoint : l'installation du corpus, qui envoie des
 * lots, et la génération, qui envoie le texte d'un post à la fois.
 *
 * Déployée sur le projet Supabase sous le nom `embed`, JWT requis.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// @ts-expect-error — `Supabase.ai` est fourni par le runtime Edge.
const session = new Supabase.ai.Session("gte-small");

/**
 * Plafond de textes acceptés par appel. Ce n'est PAS le nombre traité : la
 * fonction s'arrête d'elle-même sur son budget CPU et rend ce qu'elle a pu.
 */
const MAX_BATCH = 64;

/**
 * Budget CPU auto-imposé.
 *
 * Une Edge Function dispose d'environ deux secondes de CPU, et l'inférence
 * `gte-small` tourne DANS ce budget — ce n'est pas un appel sortant. Soixante-
 * quatre textes d'un coup faisaient tuer le worker en plein lot : « CPU Time
 * exceeded », zéro vecteur rendu, et l'appelant n'apprenait rien.
 *
 * Plutôt que de deviner un lot qui passe — la bonne taille dépend de la
 * longueur des textes et de la machine du jour — la fonction traite tant
 * qu'elle a du temps et rend ce qu'elle a fait. L'appelant reprend au tour
 * suivant. Aucune valeur à recalibrer quand le corpus change.
 */
const CPU_BUDGET_MS = 1_200;

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json({ error: "POST attendu" }, { status: 405 });
  }

  let body: { input?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corps JSON illisible" }, { status: 400 });
  }

  const raw = body.input;
  const inputs = Array.isArray(raw) ? raw : [raw];
  if (inputs.length === 0 || inputs.length > MAX_BATCH) {
    return Response.json(
      { error: `Entre 1 et ${MAX_BATCH} textes par appel, ${inputs.length} reçus.` },
      { status: 400 },
    );
  }
  if (!inputs.every((value) => typeof value === "string" && value.trim() !== "")) {
    return Response.json({ error: "Chaque entrée doit être un texte non vide" }, { status: 400 });
  }

  // En série, et en surveillant l'horloge. Le premier texte est toujours
  // traité : un appel qui ne rendrait rien ferait boucler l'appelant à vide.
  const started = performance.now();
  const embeddings: Array<number[] | null> = [];
  for (const text of inputs as string[]) {
    if (embeddings.length > 0 && performance.now() - started > CPU_BUDGET_MS) {
      embeddings.push(null);
      continue;
    }
    embeddings.push(await session.run(text, { mean_pool: true, normalize: true }));
  }

  const processed = embeddings.filter((vector) => vector !== null).length;
  return Response.json({
    embeddings,
    processed,
    dimensions: embeddings.find((vector) => vector !== null)?.length ?? 0,
  });
});
