/**
 * Embeddings, calculés par Supabase.
 *
 * Anthropic ne produit pas d'embeddings et renvoie vers des partenaires.
 * Plutôt que d'ajouter un fournisseur, une clé et une facture pour la seule
 * sélection de l'exemple thématique, on utilise `gte-small`, embarqué dans le
 * runtime des Edge Functions : 384 dimensions, vecteurs normalisés, aucun
 * appel sortant, aucun coût par requête.
 *
 * Deux usages, un seul endpoint :
 *  — l'import du corpus, qui envoie des lots de textes ;
 *  — la génération, qui envoie le texte d'un post à la fois.
 *
 * Déployée sur le projet Supabase sous le nom `embed`, JWT requis (la clé
 * service role fait office de jeton côté serveur et côté script d'import).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// @ts-expect-error — `Supabase.ai` est fourni par le runtime Edge.
const session = new Supabase.ai.Session("gte-small");

/** Plafond par appel : au-delà, le lot dépasse la durée d'une invocation. */
const MAX_BATCH = 128;

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

  // En série et non en parallèle : la session tient un modèle unique en
  // mémoire, la paralléliser ne gagne rien et fait grimper la mémoire du
  // worker jusqu'à le faire tuer.
  const embeddings: number[][] = [];
  for (const text of inputs as string[]) {
    embeddings.push(await session.run(text, { mean_pool: true, normalize: true }));
  }

  return Response.json({ embeddings, dimensions: embeddings[0]?.length ?? 0 });
});
