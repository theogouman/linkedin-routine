import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db, unwrap } from "@/shared/lib/db";
import { readSetting, writeSetting } from "@/shared/lib/settings";
import { embedTexts } from "./comment-examples-repository";

/**
 * Installation du corpus, faite par l'app elle-même.
 *
 * Le corpus est un FICHIER DU DÉPÔT, pas une donnée à importer à la main. La
 * différence compte : un déploiement neuf, une base restaurée ou un second
 * environnement se provisionnent tout seuls, et personne n'a à retrouver la
 * bonne commande six mois plus tard.
 *
 * Deux étapes indépendantes, chacune idempotente et reprenable :
 *
 *  1. **Les lignes.** Insérées en lots, dédoublonnées par la contrainte
 *     `unique (date, texte)`. Un marqueur en base porte l'empreinte du fichier :
 *     tant qu'elle n'a pas changé, l'étape ne coûte qu'une lecture de réglage.
 *  2. **Les embeddings.** Calculés par lots sous budget de temps, uniquement
 *     là où ils manquent. Leur absence ne bloque rien — le cinquième exemple
 *     est alors tiré au hasard — ce qui permet au générateur de servir dès que
 *     les lignes sont là, sans attendre trois mille inférences.
 */

const CORPUS_FILE = path.join(process.cwd(), "data", "corpus-commentaires-reels.jsonl");
const SEED_KEY = "comment_corpus_seed";

/** Lignes par insertion. Au-delà, le corps PostgREST devient énorme. */
const INSERT_BATCH = 400;
/** Textes par appel à la fonction d'embedding (son propre plafond est 128). */
const EMBED_BATCH = 64;

const CATEGORIES = new Set([
  "question", "reaction_courte", "avis_court", "experience_perso",
  "avis_nuance", "accord_plus_ajout", "felicitation_appreciation",
  "humour", "expertise_structuree",
  "reponse_accord_court", "reponse_remerciement", "reponse_argumentee",
  "reponse_lead_magnet",
]);

interface CorpusRow {
  date: string;
  lien: string | null;
  sur_mon_post: boolean;
  categorie: string;
  mots: number;
  texte: string;
  source: "corpus";
}

interface SeedMarker {
  /** Empreinte du fichier au moment du dernier import réussi. */
  fingerprint: string;
  rows: number;
  at: string;
}

/**
 * Lit et valide le fichier. Une ligne mal formée est ÉCARTÉE, pas fatale :
 * refuser tout le corpus pour une date illisible priverait le générateur de
 * deux mille neuf cent trente-neuf exemples valides.
 */
async function readCorpus(): Promise<{ rows: CorpusRow[]; fingerprint: string; rejected: number }> {
  const raw = await readFile(CORPUS_FILE, "utf8");
  const fingerprint = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 12);
  const rows: CorpusRow[] = [];
  let rejected = 0;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const entry = JSON.parse(trimmed) as Record<string, unknown>;
      const texte = typeof entry.texte === "string" ? entry.texte : "";
      const categorie = typeof entry.categorie === "string" ? entry.categorie : "";
      const date = new Date(String(entry.date ?? "").replace(" ", "T") + "Z");
      if (texte.trim() === "" || !CATEGORIES.has(categorie) || Number.isNaN(date.getTime())) {
        rejected += 1;
        continue;
      }
      rows.push({
        date: date.toISOString(),
        lien: typeof entry.lien === "string" ? entry.lien : null,
        sur_mon_post: entry.sur_mon_post === true,
        // Recompté plutôt que repris du fichier : ce champ vient d'une
        // heuristique, et c'est lui qui borne l'emplacement `reaction_courte`.
        mots: texte.trim().split(/\s+/).filter(Boolean).length,
        categorie,
        texte,
        source: "corpus",
      });
    } catch {
      rejected += 1;
    }
  }

  return { rows, fingerprint, rejected };
}

export interface SeedReport {
  /** true quand l'import avait déjà été fait pour cette version du fichier. */
  alreadyDone: boolean;
  inserted: number;
  total: number;
  rejected: number;
}

export async function seedCorpus(): Promise<SeedReport> {
  const { rows, fingerprint, rejected } = await readCorpus();
  const marker = await readSetting<SeedMarker>(SEED_KEY);
  if (marker?.fingerprint === fingerprint) {
    return { alreadyDone: true, inserted: 0, total: rows.length, rejected };
  }

  let inserted = 0;
  for (let index = 0; index < rows.length; index += INSERT_BATCH) {
    const batch = rows.slice(index, index + INSERT_BATCH);
    const result = unwrap(
      await db()
        .from("comment_examples")
        .upsert(batch, { onConflict: "date,texte", ignoreDuplicates: true })
        .select("id"),
      "import du corpus d'exemples",
    ) as Array<{ id: number }>;
    inserted += result.length;
  }

  // Le marqueur n'est écrit qu'APRÈS le dernier lot : une interruption au
  // milieu laisse l'import « à refaire », et le refaire ne coûte rien puisque
  // les lignes déjà présentes sont ignorées.
  await writeSetting(SEED_KEY, {
    fingerprint,
    rows: rows.length,
    at: new Date().toISOString(),
  } satisfies SeedMarker);

  return { alreadyDone: false, inserted, total: rows.length, rejected };
}

export interface EmbedReport {
  embedded: number;
  /** Lignes encore sans embedding après ce passage. */
  remaining: number;
  /** true quand le passage s'est arrêté sur son budget et non sur la fin. */
  partial: boolean;
}

/**
 * Calcule les embeddings manquants, par lots, sous budget de temps.
 *
 * Les lignes sont réécrites par `upsert` complet plutôt que par un `update`
 * ligne à ligne : soixante-quatre allers-retours vers une base située de
 * l'autre côté de l'Atlantique coûtaient huit secondes par lot, contre deux
 * cents millisecondes ici. C'est la même leçon que l'actualisation du fil.
 */
export async function topUpEmbeddings(options: { deadline: Date }): Promise<EmbedReport> {
  let embedded = 0;

  for (;;) {
    if (Date.now() >= options.deadline.getTime()) {
      const left = await countMissingEmbeddings();
      return { embedded, remaining: left, partial: left > 0 };
    }

    const pending = unwrap(
      await db()
        .from("comment_examples")
        .select("id, date, lien, sur_mon_post, categorie, mots, texte, source")
        .is("embedding", null)
        .order("id")
        .limit(EMBED_BATCH),
      "lecture des exemples sans embedding",
    ) as Array<CorpusRow & { id: number }>;

    if (pending.length === 0) return { embedded, remaining: 0, partial: false };

    // UN appel pour les soixante-quatre textes, pas soixante-quatre appels :
    // la fonction Edge accepte les lots, et c'est tout l'intérêt.
    const vectors = await embedTexts(pending.map((row) => row.texte));
    const usable = pending
      .map((row, index) => ({ row, vector: vectors[index] }))
      .filter((entry): entry is { row: CorpusRow & { id: number }; vector: number[] } =>
        entry.vector !== null,
      );

    // La fonction d'embedding indisponible : on s'arrête proprement plutôt que
    // de boucler sur un service absent. Le générateur, lui, continue de marcher.
    if (usable.length === 0) {
      const left = await countMissingEmbeddings();
      return { embedded, remaining: left, partial: true };
    }

    const { error } = await db()
      .from("comment_examples")
      .upsert(
        usable.map(({ row, vector }) => ({ ...row, embedding: JSON.stringify(vector) })),
        { onConflict: "date,texte" },
      );
    if (error) throw new Error(`Écriture des embeddings : ${error.message}`);
    embedded += usable.length;
  }
}

async function countMissingEmbeddings(): Promise<number> {
  const { count, error } = await db()
    .from("comment_examples")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);
  if (error) throw new Error(`Comptage des embeddings : ${error.message}`);
  return count ?? 0;
}

/**
 * Garde-fou du chemin de génération : si le corpus est vide, on l'installe
 * avant de générer.
 *
 * Coût habituel : une lecture de réglage. Ce n'est pas le chemin normal
 * d'installation — l'ordonnanceur s'en charge — mais c'est ce qui rend la
 * toute première génération possible sans attendre le passage suivant.
 */
export async function ensureCorpusSeeded(): Promise<void> {
  try {
    await seedCorpus();
  } catch (error) {
    // Un corpus absent dégrade la génération, il ne l'empêche pas : le modèle
    // reçoit alors moins d'exemples. Mieux vaut une proposition tiède qu'un
    // écran d'erreur.
    console.error("installation du corpus :", error);
  }
}
