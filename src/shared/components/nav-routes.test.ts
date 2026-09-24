import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activeNavRoute, NAV_ROUTES } from "./nav-routes";

/**
 * Épingle la surface de navigation.
 *
 * Un écran ajouté sous `(app)` et absent de la barre serait inatteignable
 * autrement qu'en tapant son URL — et personne ne tape d'URL dans une PWA
 * installée. Le test échoue alors, avant la mise en ligne.
 */
describe("surface de navigation", () => {
  const segments = readdirSync(path.join(process.cwd(), "src/app/(app)"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `/${entry.name}`)
    .sort();

  it("couvre tous les écrans du groupe (app)", () => {
    expect([...NAV_ROUTES].sort()).toEqual(segments);
  });

  it("n'a pas de doublon", () => {
    expect(new Set(NAV_ROUTES).size).toBe(NAV_ROUTES.length);
  });
});

describe("onglet actif", () => {
  it("ne confond pas /file avec /fil", () => {
    // « /file » commence par « /fil » : avec un `startsWith` nu, l'écran de la
    // file allumait l'onglet du fil et la pilule se posait au mauvais endroit.
    expect(activeNavRoute("/file")).toBe("/file");
    expect(activeNavRoute("/fil")).toBe("/fil");
  });

  it("reconnaît un sous-chemin", () => {
    expect(activeNavRoute("/listes/abc")).toBe("/listes");
  });

  it("ignore un chemin hors navigation", () => {
    expect(activeNavRoute("/login")).toBeNull();
    expect(activeNavRoute("/filtre")).toBeNull();
  });
});
