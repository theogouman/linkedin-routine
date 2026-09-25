#!/usr/bin/env node
/**
 * Import du corpus de commentaires dans Supabase, et calcul des embeddings.
 *
 *   node scripts/import-comment-examples.mjs               # import + embeddings
 *   node scripts/import-comment-examples.mjs --no-embed    # import seul
 *   node scripts/import-comment-examples.mjs --embed-only  # rattrape les manquants
 *
 * Deux garanties, parce que ce script sera relancé :
 *
 *  — l'insertion est idempotente. La contrainte `unique (date, texte)` du
 *    schéma absorbe un second passage du même fichier sans rien dupliquer ;
 *  — le calcul des embeddings est REPRENABLE. Il ne traite que les lignes où
 *    `embedding is null`, donc une interruption au milieu de trois mille
 *    lignes ne coûte que le lot en cours.
 *
 * Variables lues : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CORPUS = path.join(process.cwd(), "data", "corpus-commentaires-reels.jsonl");
const TABLE = "comment_examples";
/** Lignes insérées par requête. Au-delà, le corps PostgREST devient énorme. */
const INSERT_BATCH = 500;
/** Textes envoyés par appel à la fonction d'embedding (son propre plafond). */
const EMBED_BATCH = 64;

const CATEGORIES = new Set([
  "question", "reaction_courte", "avis_court", "experience_perso",
  "avis_nuance", "accord_plus_ajout", "felicitation_appreciation",
  "humour", "expertise_structuree",
  "reponse_accord_court", "reponse_remerciement", "reponse_argumentee",
  "reponse_lead_magnet",
]);

function env(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Variable manquante : ${name}`);
    process.exit(1);
  }
  return value.replace(/\/+$/, "");
}

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const headers = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function rest(pathname, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} → ${response.status} ${text.slice(0, 400)}`);
  }
  return text === "" ? null : JSON.parse(text);
}

/** Lit le JSONL et rejette les lignes qui ne respectent pas le schéma. */
async function readCorpus() {
  const raw = await readFile(CORPUS, "utf8");
  const rows = [];
  const rejected = [];

  raw.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      rejected.push(`ligne ${index + 1} : JSON illisible`);
      return;
    }
    if (typeof entry.texte !== "string" || entry.texte.trim() === "") {
      rejected.push(`ligne ${index + 1} : texte vide`);
      return;
    }
    if (!CATEGORIES.has(entry.categorie)) {
      rejected.push(`ligne ${index + 1} : catégorie inconnue « ${entry.categorie} »`);
      return;
    }
    const date = new Date(entry.date.replace(" ", "T") + "Z");
    if (Number.isNaN(date.getTime())) {
      rejected.push(`ligne ${index + 1} : date illisible « ${entry.date} »`);
      return;
    }
    rows.push({
      date: date.toISOString(),
      lien: entry.lien ?? null,
      sur_mon_post: Boolean(entry.sur_mon_post),
      categorie: entry.categorie,
      // On recompte plutôt que de faire confiance au champ : il vient d'une
      // heuristique, et c'est lui qui borne l'emplacement `reaction_courte`.
      mots: entry.texte.trim().split(/\s+/).filter(Boolean).length,
      texte: entry.texte,
      source: "corpus",
    });
  });

  return { rows, rejected };
}

async function insertAll(rows) {
  let inserted = 0;
  for (let index = 0; index < rows.length; index += INSERT_BATCH) {
    const batch = rows.slice(index, index + INSERT_BATCH);
    const result = await rest(`${TABLE}?on_conflict=date,texte&select=id`, {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(batch),
    });
    inserted += Array.isArray(result) ? result.length : 0;
    process.stdout.write(`\r  insertion ${Math.min(index + INSERT_BATCH, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
  return inserted;
}

async function embedBatch(texts) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/embed`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ input: texts }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`fonction embed → ${response.status} ${text.slice(0, 400)}`);
  }
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.embeddings) || parsed.embeddings.length !== texts.length) {
    throw new Error("La fonction embed n'a pas rendu autant de vecteurs que de textes.");
  }
  return parsed.embeddings;
}

async function embedMissing() {
  let done = 0;
  for (;;) {
    const pending = await rest(
      `${TABLE}?embedding=is.null&select=id,texte&order=id&limit=${EMBED_BATCH}`,
    );
    if (!pending || pending.length === 0) break;

    const vectors = await embedBatch(pending.map((row) => row.texte));
    // Un PATCH par ligne : PostgREST ne sait pas mettre à jour des valeurs
    // différentes sur des lignes différentes en une requête. C'est lent mais
    // ça ne tourne qu'une fois, et la reprise rend l'interruption gratuite.
    for (let index = 0; index < pending.length; index += 1) {
      await rest(`${TABLE}?id=eq.${pending[index].id}`, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ embedding: JSON.stringify(vectors[index]) }),
      });
    }
    done += pending.length;
    process.stdout.write(`\r  embeddings ${done}`);
  }
  if (done > 0) process.stdout.write("\n");
  return done;
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const embedOnly = flags.has("--embed-only");
  const noEmbed = flags.has("--no-embed");

  if (!embedOnly) {
    const { rows, rejected } = await readCorpus();
    console.log(`Corpus : ${rows.length} lignes retenues, ${rejected.length} rejetées.`);
    for (const reason of rejected.slice(0, 10)) console.log(`  • ${reason}`);
    if (rejected.length > 10) console.log(`  • … ${rejected.length - 10} autres`);
    const inserted = await insertAll(rows);
    console.log(`Insérées : ${inserted} (les autres existaient déjà).`);
  }

  if (noEmbed) {
    console.log("Embeddings sautés (--no-embed). L'exemple thématique tirera au hasard.");
    return;
  }

  console.log("Calcul des embeddings manquants…");
  try {
    const embedded = await embedMissing();
    console.log(embedded === 0 ? "Rien à calculer." : `Calculés : ${embedded}.`);
  } catch (error) {
    // Un échec ici n'est PAS fatal : le générateur fonctionne sans embeddings,
    // avec un exemple thématique tiré au hasard. Le dire plutôt que de laisser
    // croire que l'import a échoué.
    console.error(`\nEmbeddings indisponibles : ${error.message}`);
    console.error("L'import des textes est fait. Déploie la fonction `embed`");
    console.error("(supabase functions deploy embed) puis relance avec --embed-only.");
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
