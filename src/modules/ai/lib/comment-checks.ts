/**
 * Contrôles en code après réception (§7 du brief).
 *
 * Aucun de ces contrôles ne dépense un token. C'est délibéré : le brief
 * n'autorise qu'un seul appel par génération, donc tout ce qui peut être
 * vérifié sans le modèle doit l'être sans lui. Une variante qui échoue n'est
 * pas régénérée — elle est affichée avec son motif et reléguée en bas.
 *
 * Le module est pur, sans accès réseau ni base : c'est ce qui permet de
 * calibrer le filtre anti-tells sur les 139 commentaires générés par l'outil
 * de 2025 et sur les 2 940 vrais commentaires, dans les tests.
 */

import type { Slot, Variante } from "./comment-variants";

export type BadgeKind =
  | "non_ancre"
  | "identifiant_invalide"
  | "affirmation_non_sourcee"
  | "tournure_ia"
  | "trop_long";

export interface Badge {
  kind: BadgeKind;
  /** Texte affiché à côté de la variante. */
  label: string;
  /** Détail : le motif exact qui a levé le badge. */
  detail?: string;
}

export interface CheckedVariante extends Variante {
  /** Texte après normalisation typographique — c'est celui qu'on affiche. */
  texte: string;
  badges: Badge[];
}

// ── 6. Normalisation typographique ─────────────────────────────────────────
/**
 * Appliquée AVANT les autres contrôles, et pas après comme le laisserait
 * croire sa place dans la liste.
 *
 * La raison est mécanique : les motifs anti-tells sont écrits avec des
 * apostrophes droites (`j'achète`). Un modèle qui rend `j’achète` passerait
 * au travers du filtre si on normalisait après. Le brief place la
 * normalisation en 6 parce qu'elle est silencieuse, pas parce qu'elle vient
 * en dernier dans l'ordre d'exécution.
 */
export function normalizeTypography(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    // Les espaces autour du tiret long sont absorbés : `mot — mot` donnerait
    // sinon `mot  --  mot`, avec des doubles espaces que personne ne tape.
    .replace(/\s*—\s*/g, " -- ")
    .replace(/…/g, "..");
}

// ── 2. Ancrage ─────────────────────────────────────────────────────────────
/**
 * Comparaison tolérante : le modèle recopie un extrait à la main, et la casse
 * comme les apostrophes typographiques varient d'un côté à l'autre. Exiger
 * l'égalité stricte lèverait le badge sur des extraits parfaitement exacts.
 */
function foldForAnchor(value: string): string {
  return normalizeTypography(value)
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAnchored(extrait: string, source: string): boolean {
  const needle = foldForAnchor(extrait);
  if (needle === "") return false;
  return foldForAnchor(source).includes(needle);
}

// ── 3. Identifiants ────────────────────────────────────────────────────────
export const FACT_PATTERN = /^F(?:[1-9]|1\d|2[0-2])$/;
export const POSITION_PATTERN = /^P(?:[1-9]|1\d|2[0-3])$/;

// ── 4. Première personne sans source ───────────────────────────────────────
/**
 * Tournures d'opinion, retirées du texte avant de chercher les marqueurs.
 *
 * Les soustraire plutôt que de tester « le texte contient-il une exception »
 * est ce qui rend le contrôle juste : « je pense que si, et j'ai remboursé un
 * client » contient une exception ET une affirmation. Il doit être badgé.
 */
const OPINION_PHRASES = [
  /\bje pense\b/gi,
  /\bje trouve\b/gi,
  /\bj'ai l'impression\b/gi,
  /\bje vois\b/gi,
  /\bje suis curieux\b/gi,
];

const FIRST_PERSON_MARKERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bje /i, label: "je" },
  { pattern: /\bj'/i, label: "j'" },
  { pattern: /\bmes clients\b/i, label: "mes clients" },
  { pattern: /\bmon programme\b/i, label: "mon programme" },
  { pattern: /\bchez moi\b/i, label: "chez moi" },
  { pattern: /\bmes élèves\b/i, label: "mes élèves" },
];

export function firstPersonWithoutSource(
  text: string,
  faitUtilise: string | null,
): string | null {
  if (faitUtilise !== null) return null;
  let stripped = text;
  for (const phrase of OPINION_PHRASES) stripped = stripped.replace(phrase, " ");
  for (const marker of FIRST_PERSON_MARKERS) {
    if (marker.pattern.test(stripped)) return marker.label;
  }
  return null;
}

// ── 5. Filtre anti-tells ───────────────────────────────────────────────────
/**
 * Les motifs viennent du brief, eux-mêmes tirés des 139 commentaires que
 * l'outil de 2025 a publiés sous le nom de Théo. Ce ne sont pas des tics
 * théoriques : chacun a été publié.
 *
 * Deux propriétés sont vérifiées par les tests, et ce sont elles qui comptent
 * plus que la liste : le filtre attrape l'immense majorité des anti-exemples,
 * et il reste sous 3 % de faux positifs sur les vrais commentaires. Ajouter un
 * motif sans relancer ces deux mesures, c'est risquer de badger Théo.
 */
/**
 * Verbes d'observation qui ouvrent un commentaire.
 *
 * « Tu mets le doigt sur… », « Tu pointes juste… », « Tu rends ça clair… ».
 * Le brief en listait quatre ; les mesures sur les 139 anti-exemples montrent
 * que c'est LA signature de l'outil de 2025 — un tiers de ses commentaires
 * s'ouvrent ainsi, contre un vingtième de ceux de Théo, et la proportion tombe
 * à 0,7 % quand on restreint aux verbes de commentaire ci-dessous.
 */
const TU_OBSERVATION =
  "(mets|pointes|tapes|coches|rends|montres|poses|donnes|remets|rappelles|traites" +
  "|paries|passes|développes|vises|gères|fais bien|y vas|as raison|transformes" +
  "|expliques|racontes|parles|décris|résumes|soulignes|illustres|prouves" +
  "|démontres|apportes|ouvres)";

const TELL_STARTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^tu as raison sur/i, label: "tu as raison sur" },
  { pattern: /^tu mets le doigt/i, label: "tu mets le doigt" },
  { pattern: /^tu rends /i, label: "tu rends" },
  { pattern: /^tu montres /i, label: "tu montres" },
  { pattern: /^ok pour /i, label: "ok pour" },
  { pattern: /^oui à /i, label: "oui à" },
  { pattern: /^je te rejoins/i, label: "je te rejoins" },
  { pattern: /^je te suis/i, label: "je te suis" },
  { pattern: /^je te challenge/i, label: "je te challenge" },
  { pattern: /^j'achète/i, label: "j'achète" },
  { pattern: /^ce que je retiens/i, label: "ce que je retiens" },
  { pattern: /^ça résonne/i, label: "ça résonne" },
  { pattern: /^ça percute/i, label: "ça percute" },
  { pattern: /^même combat/i, label: "même combat" },
  { pattern: /^plutôt sain/i, label: "plutôt sain" },
  // Ajouts mesurés, chacun pesant au moins 2 % des anti-exemples à lui seul.
  // Les motifs qui n'apparaissaient qu'une ou deux fois ont été écartés : un
  // filtre calé sur deux exemples ne généralise pas, il mémorise.
  { pattern: new RegExp(`^tu ${TU_OBSERVATION}\\b`, "i"), label: "tu + verbe d'observation" },
  {
    pattern: /^ça (pique|fait du bien|donne envie|résonne|percute|me fait sourire|coche)/i,
    label: "ça + verbe d'effet",
  },
  { pattern: /^tellement (vrai|d'accord)/i, label: "tellement vrai" },
  {
    // « Ok pour X, mais Y » : valider puis corriger l'auteur, le tic que le
    // cerveau désigne en premier parmi ce qui trahit une IA.
    pattern: /^(ok|oui|tu as raison|d'accord|je te suis|je te rejoins)\b[^.!?]{0,60}, mais /i,
    label: "valide puis corrige",
  },
];

const TELL_ANYWHERE: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /mais sans /i, label: "mais sans" },
  { pattern: /nerf de la guerre/i, label: "nerf de la guerre" },
  { pattern: /bouger l'aiguille/i, label: "bouger l'aiguille" },
  { pattern: /déclic n°1/i, label: "déclic n°1" },
  { pattern: /process béton/i, label: "process béton" },
  { pattern: /merci pour ce partage inspirant/i, label: "merci pour ce partage inspirant" },
  { pattern: /excellent point/i, label: "excellent point" },
  { pattern: /absolument/i, label: "absolument" },
  { pattern: /force est de constater/i, label: "force est de constater" },
  { pattern: /\ble (vrai|seul) (levier|enjeu|game.?changer|sujet|point)\b/i, label: "le vrai levier" },
  { pattern: /\bsans [^,.]{3,50}, (le|la|les|ça|tu|on|c'est)\b/i, label: "sans X, conséquence" },
  { pattern: /\bfait (toute )?la diff\b/i, label: "fait la diff" },
  { pattern: /\bc'est (exactement )?ce qui (fait|me fait|donne)\b/i, label: "c'est ce qui fait" },
  { pattern: /\b(reste|restent|resterait) (du|de la|un|une) \w+/i, label: "reste du vernis" },
];

/**
 * L'antithèse finale : « …, pas du vernis. »
 *
 * C'est la signature la plus fiable des commentaires de 2025 — valider puis
 * corriger, et finir sur une leçon. Théo, lui, finit rarement sur une
 * opposition.
 */
const FINAL_ANTITHESIS = /, pas [^,]{3,40}[.!]?$/i;

/**
 * Deux-points collés au mot qui précède (« l'essentiel: chez les… »).
 *
 * Théo met un espace avant ses deux-points (« selon moi : »). Les heures
 * (`14:30`) et les URLs n'en sont pas : elles n'ont pas d'espace après le
 * deux-points, ou sont précédées d'un chiffre.
 */
function stuckColon(text: string): boolean {
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, " ");
  const matches = withoutUrls.matchAll(/(\S): /g);
  for (const match of matches) {
    if (!/\d/.test(match[1] ?? "")) return true;
  }
  return false;
}

export function detectTell(text: string): string | null {
  const value = text.trim();
  for (const tell of TELL_STARTS) if (tell.pattern.test(value)) return tell.label;
  for (const tell of TELL_ANYWHERE) if (tell.pattern.test(value)) return tell.label;
  if (FINAL_ANTITHESIS.test(value)) return "antithèse finale";
  if (stuckColon(value)) return "deux-points collés";
  return null;
}

// ── 7. Longueur ────────────────────────────────────────────────────────────
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const MAX_WORDS_REACTION = 12;
const MAX_WORDS_DEFAULT = 40;

export function tooLong(
  slot: Slot,
  text: string,
  positionUtilisee: string | null,
): number | null {
  const words = wordCount(text);
  if (slot === "reaction_courte" || slot === "accord_court") {
    return words > MAX_WORDS_REACTION ? words : null;
  }
  // Un avis adossé à une position argumente : il a le droit d'être long.
  // C'est le seul endroit où Théo dépasse quarante mots dans son corpus.
  if (slot === "avis" && positionUtilisee !== null) return null;
  return words > MAX_WORDS_DEFAULT ? words : null;
}

// ── Application ────────────────────────────────────────────────────────────
export interface CheckContext {
  /** Le post commenté, ou le commentaire reçu en mode réponse. */
  source: string;
}

export function checkVariante(variante: Variante, context: CheckContext): CheckedVariante {
  const texte = normalizeTypography(variante.texte).trim();
  const badges: Badge[] = [];

  if (!isAnchored(variante.extrait_post, context.source)) {
    badges.push({
      kind: "non_ancre",
      label: "non ancré",
      detail: `« ${variante.extrait_post} » ne figure pas dans le post`,
    });
  }

  const fait = variante.fait_utilise;
  const position = variante.position_utilisee;
  const badIds = [
    fait !== null && !FACT_PATTERN.test(fait) ? fait : null,
    position !== null && !POSITION_PATTERN.test(position) ? position : null,
  ].filter((value): value is string => value !== null);
  if (badIds.length > 0) {
    badges.push({
      kind: "identifiant_invalide",
      label: "à vérifier",
      detail: `identifiant inconnu : ${badIds.join(", ")}`,
    });
  }

  // Un identifiant inventé ne vaut pas mieux qu'aucun identifiant : la
  // variante affirme alors quelque chose sur Théo sans source réelle. On teste
  // donc la première personne avec le fait NORMALISÉ à null dans ce cas.
  const sourcedFact = fait !== null && FACT_PATTERN.test(fait) ? fait : null;
  const marker = firstPersonWithoutSource(texte, sourcedFact);
  if (marker !== null) {
    badges.push({
      kind: "affirmation_non_sourcee",
      label: "affirmation non sourcée",
      detail: `« ${marker} » sans fait vérifié`,
    });
  }

  const tell = detectTell(texte);
  if (tell !== null) {
    badges.push({ kind: "tournure_ia", label: "tournure IA", detail: tell });
  }

  const sourcedPosition =
    position !== null && POSITION_PATTERN.test(position) ? position : null;
  const words = tooLong(variante.slot, texte, sourcedPosition);
  if (words !== null) {
    badges.push({ kind: "trop_long", label: "trop long", detail: `${words} mots` });
  }

  return { ...variante, texte, badges };
}

/**
 * Ordonne les variantes pour l'affichage : l'ordre des emplacements d'abord,
 * les badgées ensuite.
 *
 * Reléguer plutôt que masquer. Une variante badgée reste souvent la bonne
 * après une retouche de trois mots, et la cacher obligerait à régénérer —
 * c'est-à-dire à repayer un appel pour un problème que l'œil règle en deux
 * secondes.
 */
export function orderForDisplay(
  variantes: CheckedVariante[],
  slotOrder: readonly Slot[],
): CheckedVariante[] {
  const rank = (variante: CheckedVariante) => {
    const index = slotOrder.indexOf(variante.slot);
    return index === -1 ? slotOrder.length : index;
  };
  return [...variantes].sort((left, right) => {
    const badged = Number(left.badges.length > 0) - Number(right.badges.length > 0);
    return badged !== 0 ? badged : rank(left) - rank(right);
  });
}
