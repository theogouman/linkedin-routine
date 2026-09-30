import { beforeAll, describe, expect, it } from "vitest";

/**
 * Test de démarrage du script de contenu.
 *
 * Il existe pour une raison précise : une version a livré un script qui levait
 * au chargement — le premier passage lisait une variable `let` déclarée plus
 * bas, donc encore en zone morte. Rien ne s'affichait sur LinkedIn, et rien
 * n'expliquait pourquoi. Le contrôle de syntaxe ne voit pas ça ; les tests
 * d'extraction non plus, puisqu'ils n'exécutent pas le fichier.
 *
 * Les trois fichiers sont chargés dans l'ordre du manifeste, sur un DOM réduit
 * au strict nécessaire. On ne vérifie pas le rendu — on vérifie que le script
 * arrive au bout et pose ce qu'il doit poser.
 */

function makeEl(tag) {
  const element = {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: { cssText: "", setProperty() {} },
    classList: { add() {}, remove() {}, contains: () => false },
    isConnected: true,
    textContent: "",
    id: "",
    className: "",
    title: "",
    type: "",
    offsetHeight: 0,
    parentElement: null,
    _attrs: {},
    appendChild(child) {
      element.children.push(child);
      child.parentElement = element;
      return child;
    },
    insertBefore(child) {
      element.children.push(child);
      child.parentElement = element;
      return child;
    },
    remove() {},
    setAttribute(name, value) {
      element._attrs[name] = value;
    },
    getAttribute(name) {
      return element._attrs[name] ?? null;
    },
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
    getBoundingClientRect: () => ({ top: 0, height: 0, width: 0 }),
    attachShadow() {
      element._shadow = makeEl("shadow-root");
      return element._shadow;
    },
  };
  return element;
}

const writes = [];

beforeAll(async () => {
  const head = makeEl("head");
  const body = makeEl("body");
  globalThis.document = {
    documentElement: makeEl("html"),
    head,
    body,
    createElement: (tag) => makeEl(tag),
    createElementNS: (_namespace, tag) => makeEl(tag),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  globalThis.location = { href: "https://www.linkedin.com/feed/" };
  globalThis.window = { innerHeight: 900 };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.chrome = {
    storage: { local: { set: (value) => writes.push(value) } },
    runtime: { connect: () => ({ onMessage: {}, onDisconnect: {} }), sendMessage: async () => ({}) },
  };

  // L'ordre du manifeste : extract, panel, content.
  await import("./extract.js");
  await import("./panel.js");
  await import("./content.js");
});

describe("démarrage du script de contenu", () => {
  it("installe les trois espaces de noms", () => {
    expect(typeof globalThis.LRExtract).toBe("object");
    expect(typeof globalThis.LRPanel.show).toBe("function");
  });

  it("pose sa feuille de styles dans la page", () => {
    expect(document.head.children.some((child) => child.id === "lr-styles")).toBe(true);
  });

  it("ne pose plus rien en dehors des publications", () => {
    // L'extension ne vit que dans la barre d'actions d'une publication : rien
    // ne doit flotter par-dessus le fil.
    expect(document.body.children).toEqual([]);
  });

  it("dépose un relevé, ce qui prouve que le premier passage est allé au bout", () => {
    const last = writes.at(-1);
    expect(last?.diagnostic).toBeDefined();
    // La clé n'existe que si le démarrage a levé : sa présence est l'échec.
    expect(last.diagnostic.erreur).toBeUndefined();
    expect(last.diagnostic.detected).toBe(0);
  });
});
