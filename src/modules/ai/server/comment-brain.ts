import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Chargement du cerveau v2 (§4.1 du brief).
 *
 * Trois contraintes, toutes au service du cache.
 *
 * 1. **Le contenu est rendu OCTET POUR OCTET.** Pas de `trim()`, pas de
 *    normalisation de fins de ligne, aucune interpolation. Le cache d'Anthropic
 *    est un préfixe : un espace de différence et les six mille tokens du
 *    cerveau repassent au plein tarif, sans erreur, sans signal.
 *
 * 2. **Le fichier est un ASSET VERSIONNÉ**, pas une ligne de base modifiable à
 *    la volée. Un cerveau qu'on pourrait éditer depuis l'app changerait sous
 *    les pieds d'une session en cours.
 *
 * 3. **Il est lu une seule fois par processus.** La lecture est mémoïsée sur la
 *    PROMESSE et non sur le résultat : deux générations lancées en même temps
 *    au démarrage à froid ne doivent pas ouvrir le fichier deux fois.
 */

const ASSET = path.join(process.cwd(), "src", "modules", "ai", "assets");
const FILE = "cerveau-commentaires-theo-v2.md";

export interface Brain {
  /** Contenu intégral, tel quel. C'est ce qui part en system. */
  text: string;
  /**
   * Empreinte courte du contenu.
   *
   * Sert au journal : comparer un avant et un après une modification du
   * cerveau suppose de savoir lequel a produit quoi. Une date de déploiement
   * ne le dit pas — on redéploie pour mille raisons.
   */
  version: string;
}

let cached: Promise<Brain> | null = null;

export function loadBrain(): Promise<Brain> {
  if (cached === null) {
    cached = readFile(path.join(ASSET, FILE), "utf8").then((text) => ({
      text,
      version: createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12),
    }));
    // Un échec de lecture ne doit pas être mémoïsé : le prochain appel doit
    // pouvoir réessayer plutôt que de rejouer la même erreur indéfiniment.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

/** Réservé aux tests : vide le cache mémoire. */
export function resetBrainCache(): void {
  cached = null;
}
