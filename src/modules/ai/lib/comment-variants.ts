/**
 * Vocabulaire du générateur de commentaires (§3.5, §4.3 du brief).
 *
 * Les emplacements sont FIXES et au nombre de quatre. Ce n'est pas une
 * commodité de rendu : c'est ce qui force les quatre propositions à être
 * franchement différentes plutôt que quatre reformulations de la même idée.
 * Théo choisit ensuite celle qui correspond à ce qu'il pense vraiment.
 */

import { z } from "zod";

export type GenerationMode = "commentaire" | "reponse";

export const COMMENT_SLOTS = ["question", "reaction_courte", "avis", "humour_ou_bravo"] as const;
export const REPLY_SLOTS = ["accord_court", "merci", "fond", "relance"] as const;

export type CommentSlot = (typeof COMMENT_SLOTS)[number];
export type ReplySlot = (typeof REPLY_SLOTS)[number];
export type Slot = CommentSlot | ReplySlot;

export const ALL_SLOTS = [...COMMENT_SLOTS, ...REPLY_SLOTS] as const;

export function slotsFor(mode: GenerationMode): readonly Slot[] {
  return mode === "reponse" ? REPLY_SLOTS : COMMENT_SLOTS;
}

/**
 * Emplacements encore remplis quand le post est jugé inexploitable — une image
 * seule, trois mots, un partage de lien. On ne peut ni poser une vraie
 * question ni donner un avis sur rien ; on peut encore réagir.
 */
export const SLOTS_WHEN_UNUSABLE: readonly Slot[] = ["reaction_courte", "humour_ou_bravo"];

export const INTENTIONS = ["question", "soutien", "avis", "humour", "desaccord"] as const;
export type Intention = (typeof INTENTIONS)[number];

export const INTENTION_LABELS: Record<Intention, string> = {
  question: "Question",
  soutien: "Soutien",
  avis: "Avis",
  humour: "Humour",
  desaccord: "Désaccord",
};

export function asIntention(value: unknown): Intention | null {
  return typeof value === "string" && (INTENTIONS as readonly string[]).includes(value)
    ? (value as Intention)
    : null;
}

export const SLOT_LABELS: Record<Slot, string> = {
  question: "Question",
  reaction_courte: "Réaction",
  avis: "Avis",
  humour_ou_bravo: "Humour / Bravo",
  accord_court: "Accord",
  merci: "Merci",
  fond: "Fond",
  relance: "Relance",
};

/**
 * Catégorie de corpus sous laquelle ranger un commentaire publié et retouché
 * (§9). Tous les emplacements retombent sur une catégorie qui existe déjà :
 * la réinjection ne crée pas de vocabulaire nouveau.
 */
export const SLOT_TO_CATEGORY: Record<Slot, string> = {
  question: "question",
  reaction_courte: "reaction_courte",
  avis: "avis_court",
  humour_ou_bravo: "humour",
  accord_court: "reponse_accord_court",
  merci: "reponse_remerciement",
  fond: "reponse_argumentee",
  relance: "reponse_argumentee",
};

// ── Schéma de sortie (§4.3) ────────────────────────────────────────────────
/**
 * Le schéma sert deux choses à la fois : il contraint la sortie du modèle via
 * les structured outputs, et il valide ce qui revient. Les deux usages
 * partagent la même définition pour qu'ils ne puissent pas diverger.
 *
 * `fait_utilise` et `position_utilisee` sont de simples chaînes nullables et
 * non des énumérations de F1..F22 : une énumération de 22 valeurs dans le
 * schéma alourdit la contrainte pour un gain nul, puisque le contrôle §7.3 les
 * vérifie de toute façon — et qu'un identifiant inventé est une information
 * qu'on veut voir, pas une valeur qu'on veut interdire au modèle de produire.
 */
export const varianteSchema = z.object({
  slot: z.enum(ALL_SLOTS),
  texte: z.string(),
  extrait_post: z.string(),
  fait_utilise: z.string().nullable(),
  position_utilisee: z.string().nullable(),
  coquille: z.boolean(),
});

export const generationSchema = z.object({
  post_exploitable: z.boolean(),
  variantes: z.array(varianteSchema),
});

export type Variante = z.infer<typeof varianteSchema>;
export type GenerationPayload = z.infer<typeof generationSchema>;

/**
 * Complétude de la sortie (§7.1) : quatre variantes, ou deux quand le post est
 * inexploitable. Une sortie incomplète déclenche un unique nouvel essai de
 * l'appel entier — jamais une régénération partielle, qui coûterait un second
 * appel pour une variante.
 */
export function describeIncompleteness(
  payload: GenerationPayload,
  mode: GenerationMode,
): string | null {
  const expected = payload.post_exploitable ? slotsFor(mode) : SLOTS_WHEN_UNUSABLE;
  const present = new Set(payload.variantes.map((variante) => variante.slot));
  const missing = expected.filter((slot) => !present.has(slot));
  if (missing.length > 0) return `emplacements manquants : ${missing.join(", ")}`;

  const foreign = payload.variantes.filter((variante) => !expected.includes(variante.slot));
  if (foreign.length > 0) {
    return `emplacements hors mode : ${foreign.map((v) => v.slot).join(", ")}`;
  }

  const empty = payload.variantes.filter((variante) => variante.texte.trim() === "");
  if (empty.length > 0) return `variantes vides : ${empty.map((v) => v.slot).join(", ")}`;

  return null;
}

/** Nombre de variantes portant une coquille, pour le suivi §7.8. */
export function countTypos(payload: GenerationPayload): number {
  return payload.variantes.filter((variante) => variante.coquille).length;
}
