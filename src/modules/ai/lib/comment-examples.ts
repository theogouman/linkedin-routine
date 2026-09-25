/**
 * Sélection des cinq exemples injectés à chaque génération (§5 du brief).
 *
 * Le corpus entier — près de trois mille commentaires — ne part JAMAIS dans le
 * prompt. Cinq lignes suffisent, et c'est une conclusion, pas une économie :
 * au-delà de quatre ou cinq exemples le gain d'imitation devient marginal,
 * alors que le coût, lui, continue de monter.
 *
 * Le tirage vise la DIVERSITÉ, pas la similarité. Quatre exemples couvrent les
 * quatre registres que le modèle doit produire, un seul est choisi pour sa
 * proximité au post. En style informel, des exemples tous sémantiquement
 * proches font converger la sortie vers leur contenu au lieu de leur ton.
 *
 * Module pur : aucune requête, aucun accès réseau. La base fournit les viviers,
 * ce fichier décide qui sort — ce qui le rend testable sans Postgres.
 */

import type { GenerationMode, Intention, Slot } from "./comment-variants";

export interface ExampleRow {
  id: number;
  texte: string;
  categorie: string;
  mots: number;
  /** ISO. Sert uniquement à pondérer vers le récent. */
  date: string;
}

export interface SelectedExample extends ExampleRow {
  /** Emplacement que cet exemple illustre, ou `thematique`. */
  role: Slot | "thematique";
}

// ── Catégories par emplacement ─────────────────────────────────────────────
/**
 * La catégorisation du corpus vient d'une heuristique : bonne en tendance,
 * imparfaite ligne à ligne. C'est pourquoi un emplacement pioche dans
 * plusieurs catégories plutôt qu'une seule — une erreur d'étiquette ne doit
 * pas vider un vivier.
 */
export function categoriesForSlot(
  slot: Slot,
  intention: Intention | null,
): readonly string[] {
  switch (slot) {
    case "question":
      return ["question"];
    case "reaction_courte":
      return ["reaction_courte"];
    case "avis":
      // Un désaccord demandé se nourrit des avis nuancés : ce sont les seuls
      // où Théo contredit vraiment, et ils sonnent autrement qu'un accord.
      return intention === "desaccord"
        ? ["avis_nuance"]
        : ["avis_court", "experience_perso", "avis_nuance", "accord_plus_ajout"];
    case "humour_ou_bravo":
      return ["humour", "felicitation_appreciation"];
    case "accord_court":
      return ["reponse_accord_court"];
    case "merci":
      return ["reponse_remerciement"];
    case "fond":
    case "relance":
      return ["reponse_argumentee"];
  }
}

/** Plafond de longueur propre à un emplacement, en mots. */
export function maxWordsForSlot(slot: Slot): number | null {
  return slot === "reaction_courte" ? 6 : null;
}

/**
 * Un commentaire reçu qui n'est qu'un mot-clé de lead magnet (« GEO »,
 * « SCPI »). Reconnu à sa brièveté et à l'absence de ponctuation de phrase :
 * personne n'écrit trois mots sans verbe pour dire autre chose que « envoie ».
 *
 * Sert à une seule décision : réautoriser les réponses de type lead magnet,
 * exclues par défaut parce qu'elles ne répondent à rien.
 */
export function looksLikeLeadMagnet(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length <= 3 && !/[.!?]/.test(trimmed);
}

// ── Pondération ────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
/**
 * Demi-vie d'un an : un commentaire de l'an dernier pèse moitié moins qu'un
 * commentaire d'aujourd'hui. Assez raide pour que la voix récente domine,
 * assez douce pour que 2024 reste tirable — c'est là que vit la moitié du
 * corpus.
 */
const RECENCY_HALF_LIFE_DAYS = 365;

function recencyWeight(row: ExampleRow, now: Date): number {
  const age = Math.max(0, now.getTime() - new Date(row.date).getTime()) / DAY_MS;
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_DAYS);
}

/** Trois longueurs, pour que les cinq exemples ne soient pas tous du même calibre. */
export type LengthBucket = "court" | "moyen" | "long";

export function lengthBucket(words: number): LengthBucket {
  if (words <= 6) return "court";
  return words <= 20 ? "moyen" : "long";
}

/** Signature des trois premiers mots, pour interdire deux ouvertures jumelles. */
export function openingSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

interface DrawState {
  takenIds: Set<number>;
  takenOpenings: Set<string>;
  bucketCounts: Record<LengthBucket, number>;
}

/**
 * Tirage pondéré dans un vivier, sous contraintes.
 *
 * Les contraintes sont RELÂCHÉES plutôt qu'appliquées en tout ou rien : si
 * aucun candidat ne passe l'interdit d'ouverture, on préfère un exemple avec
 * une ouverture répétée à un emplacement vide. Cinq exemples imparfaits valent
 * mieux que quatre parfaits — c'est le quatrième registre qui manquerait.
 */
function draw(
  pool: ExampleRow[],
  state: DrawState,
  now: Date,
  random: () => number,
): ExampleRow | null {
  const fresh = pool.filter((row) => !state.takenIds.has(row.id));
  if (fresh.length === 0) return null;

  const distinct = fresh.filter((row) => !state.takenOpenings.has(openingSignature(row.texte)));
  const candidates = distinct.length > 0 ? distinct : fresh;

  const weights = candidates.map((row) => {
    let weight = recencyWeight(row, now);
    // Une longueur déjà représentée deux fois est fortement découragée, pas
    // interdite : sur un vivier étroit, l'interdire viderait l'emplacement.
    if (state.bucketCounts[lengthBucket(row.mots)] >= 2) weight *= 0.2;
    return weight;
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return candidates[0] ?? null;

  let cursor = random() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    cursor -= weights[index] ?? 0;
    if (cursor <= 0) return candidates[index] ?? null;
  }
  return candidates[candidates.length - 1] ?? null;
}

export interface SelectionPools {
  /** Vivier par emplacement, dans l'ordre des emplacements du mode. */
  bySlot: Record<string, ExampleRow[]>;
  /** Les vingt plus proches du post, ou vide si aucun embedding n'est calculé. */
  thematique: ExampleRow[];
}

export interface SelectionInput {
  mode: GenerationMode;
  slots: readonly Slot[];
  pools: SelectionPools;
  now?: Date;
  /** Injectable : c'est ce qui rend le tirage reproductible dans les tests. */
  random?: () => number;
}

export function selectExamples(input: SelectionInput): SelectedExample[] {
  const now = input.now ?? new Date();
  const random = input.random ?? Math.random;
  const state: DrawState = {
    takenIds: new Set(),
    takenOpenings: new Set(),
    bucketCounts: { court: 0, moyen: 0, long: 0 },
  };
  const selected: SelectedExample[] = [];

  const take = (pool: ExampleRow[], role: Slot | "thematique") => {
    const row = draw(pool, state, now, random);
    if (!row) return;
    state.takenIds.add(row.id);
    state.takenOpenings.add(openingSignature(row.texte));
    state.bucketCounts[lengthBucket(row.mots)] += 1;
    selected.push({ ...row, role });
  };

  for (const slot of input.slots) take(input.pools.bySlot[slot] ?? [], slot);
  // Le thématique en dernier : il hérite des contraintes posées par les quatre
  // autres plutôt que de les leur imposer. C'est le seul des cinq dont le rôle
  // n'est pas de couvrir un registre.
  take(input.pools.thematique, "thematique");

  return selected;
}

/**
 * Rend le bloc `<exemples_reels>` du message utilisateur.
 *
 * Texte SEUL, sans date, sans catégorie, sans identifiant. Les métadonnées
 * aideraient un humain à comprendre la sélection ; au modèle, elles donneraient
 * des motifs à reproduire — il se mettrait à écrire des catégories.
 */
export function renderExamples(examples: SelectedExample[]): string {
  const lines = examples.map((example) => `<exemple>${example.texte}</exemple>`);
  return ["<exemples_reels>", ...lines, "</exemples_reels>"].join("\n");
}
