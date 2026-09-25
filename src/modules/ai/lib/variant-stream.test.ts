import { describe, expect, it } from "vitest";
import {
  completedVariantObjects,
  createVariantExtractor,
  readPostExploitable,
} from "./variant-stream";

const FULL = JSON.stringify({
  post_exploitable: true,
  variantes: [
    { slot: "question", texte: "Tu fais comment pour {les} \"accolades\" ?", coquille: false },
    { slot: "reaction_courte", texte: "Bien vu ]", coquille: true },
  ],
});

describe("completedVariantObjects", () => {
  it("ne rend rien tant que le tableau n'est pas ouvert", () => {
    expect(completedVariantObjects('{"post_exploitable": true, "vari')).toEqual([]);
  });

  it("ignore un objet à moitié écrit", () => {
    const partial = FULL.slice(0, FULL.indexOf("Bien vu"));
    const objects = completedVariantObjects(partial);
    expect(objects).toHaveLength(1);
    expect((objects[0] as { slot: string }).slot).toBe("question");
  });

  it("ne se laisse pas piéger par des accolades, crochets et guillemets dans le texte", () => {
    const objects = completedVariantObjects(FULL) as Array<{ texte: string }>;
    expect(objects).toHaveLength(2);
    expect(objects[0]?.texte).toBe('Tu fais comment pour {les} "accolades" ?');
    expect(objects[1]?.texte).toBe("Bien vu ]");
  });
});

describe("createVariantExtractor", () => {
  it("rend chaque variante une seule fois, au moment où elle se referme", () => {
    const extract = createVariantExtractor();
    const seen: unknown[] = [];
    for (let end = 1; end <= FULL.length; end += 7) {
      seen.push(...extract(FULL.slice(0, end)));
    }
    seen.push(...extract(FULL));
    expect(seen).toHaveLength(2);
  });
});

describe("readPostExploitable", () => {
  it("lit la première clé dès qu'elle est écrite", () => {
    expect(readPostExploitable('{"post_exploitable": fal')).toBeNull();
    expect(readPostExploitable('{"post_exploitable": false,')).toBe(false);
    expect(readPostExploitable(FULL)).toBe(true);
  });
});
