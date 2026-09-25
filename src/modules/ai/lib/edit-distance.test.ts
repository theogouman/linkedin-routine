import { describe, expect, it } from "vitest";
import { levenshtein, normalizedEditDistance } from "./edit-distance";

describe("levenshtein", () => {
  it("rend zéro sur deux textes identiques", () => {
    expect(levenshtein("Insane l'animation", "Insane l'animation")).toBe(0);
  });

  it("compte une substitution, une insertion, une suppression", () => {
    expect(levenshtein("chat", "chut")).toBe(1);
    expect(levenshtein("chat", "chats")).toBe(1);
    expect(levenshtein("chats", "chat")).toBe(1);
  });

  it("rend la longueur de l'autre quand l'un est vide", () => {
    expect(levenshtein("", "bravo")).toBe(5);
    expect(levenshtein("bravo", "")).toBe(5);
  });

  it("est symétrique", () => {
    expect(levenshtein("propre", "très propre")).toBe(levenshtein("très propre", "propre"));
  });
});

describe("normalizedEditDistance", () => {
  it("vaut zéro quand la proposition part telle quelle", () => {
    expect(normalizedEditDistance("Smart le hook", "Smart le hook")).toBe(0);
  });

  it("vaut un quand tout est réécrit", () => {
    expect(normalizedEditDistance("aaaa", "bbbb")).toBe(1);
  });

  it("compte une correction de casse comme une retouche", () => {
    // C'est voulu : replier la casse ferait passer pour « publié tel quel »
    // un texte que Théo a effectivement touché, et surestimerait le générateur
    // exactement là où on cherche à le mesurer.
    expect(normalizedEditDistance("propre", "Propre")).toBeGreaterThan(0);
  });

  it("reste borné entre zéro et un", () => {
    const distance = normalizedEditDistance("Très propre, tu fais ça comment ?", "Propre !");
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThanOrEqual(1);
  });

  it("vaut zéro sur deux textes vides plutôt que de diviser par zéro", () => {
    expect(normalizedEditDistance("", "")).toBe(0);
  });
});
