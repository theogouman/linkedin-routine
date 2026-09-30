import { beforeAll, describe, expect, it } from "vitest";

/**
 * Le fichier est un script de contenu, pas un module : il s'installe sur
 * `globalThis`. On l'importe tel quel, ce qui vérifie au passage qu'il ne
 * touche pas au DOM à l'import — condition pour qu'il se charge dans un
 * service worker de test comme dans une page.
 */
let LR;
beforeAll(async () => {
  await import("./extract.js");
  LR = globalThis.LRExtract;
});

/**
 * Élément factice minimal.
 *
 * Il ne cherche pas à imiter le DOM de LinkedIn — inventer un balisage pour le
 * faire correspondre à mes propres sélecteurs ne prouverait rien. Ce qu'il
 * teste est la logique autour : l'ORDRE des listes de sélecteurs, le
 * dédoublonnage, le traitement du repartage.
 */
function fake({ selectors = {}, attrs = {}, text = null, children = [], tag = "div", className = "" } = {}) {
  const node = {
    _selectors: selectors,
    _attrs: attrs,
    tagName: String(tag).toUpperCase(),
    className,
    innerText: text ?? undefined,
    textContent: text ?? "",
    children,
    getAttribute: (name) => attrs[name] ?? null,
    querySelector(selector) {
      const found = selectors[selector];
      return Array.isArray(found) ? (found[0] ?? null) : (found ?? null);
    },
    querySelectorAll(selector) {
      const found = selectors[selector];
      if (!found) return [];
      return Array.isArray(found) ? found : [found];
    },
    contains: (other) => children.includes(other),
    matches: () => false,
  };
  return node;
}

describe("cleanPostText", () => {
  it("retire le « voir plus » du repli", () => {
    expect(LR.cleanPostText("Un texte qui continue…voir plus")).toBe("Un texte qui continue");
    expect(LR.cleanPostText("Un texte qui continue... see more")).toBe("Un texte qui continue");
    expect(LR.cleanPostText("Un texte…  afficher plus")).toBe("Un texte");
    expect(LR.cleanPostText("Un texte\nvoir moins")).toBe("Un texte");
  });

  it("ne mange pas des points de suspension au milieu", () => {
    expect(LR.cleanPostText("Alors là… franchement, bravo.")).toBe("Alors là… franchement, bravo.");
  });

  it("retire l'intitulé et le degré de relation posés pour les lecteurs d'écran", () => {
    expect(
      LR.cleanPostText("Post du fil d'actualité\n\nThéo Gouman\n\n• 1er\n\nLe vrai sujet."),
    ).toBe("Théo Gouman\n\nLe vrai sujet.");
    expect(LR.cleanPostText("Feed post\n\n• 3e+\n\nUn texte.")).toBe("Un texte.");
  });

  it("ne confond pas le degré de relation avec une puce de liste", () => {
    expect(LR.cleanPostText("• 1er point : le coût\n• 2e point : le délai")).toBe(
      "• 1er point : le coût\n• 2e point : le délai",
    );
  });

  it("supprime le mot `hashtag` inséré pour les lecteurs d'écran", () => {
    expect(LR.cleanPostText("Merci hashtag#nocode et hashtag #notion")).toBe(
      "Merci #nocode et #notion",
    );
  });

  it("normalise les espaces sans écraser les paragraphes", () => {
    expect(LR.cleanPostText("Ligne un\n\n\n\nLigne deux")).toBe("Ligne un\n\nLigne deux");
    expect(LR.cleanPostText("Deux espaces   ici")).toBe("Deux espaces ici");
    expect(LR.cleanPostText("  \n bord  \n ")).toBe("bord");
  });

  it("rend une chaîne vide plutôt que de lever sur une entrée absente", () => {
    expect(LR.cleanPostText(null)).toBe("");
    expect(LR.cleanPostText(undefined)).toBe("");
    expect(LR.cleanPostText(42)).toBe("");
  });
});

describe("activityId", () => {
  it("lit l'identifiant sur chacun des attributs connus", () => {
    expect(LR.activityId(fake({ attrs: { "data-urn": "urn:li:activity:7510228384908582912" } }))).toBe(
      "7510228384908582912",
    );
    expect(LR.activityId(fake({ attrs: { "data-id": "urn:li:activity:123456789" } }))).toBe(
      "123456789",
    );
  });

  it("accepte les autres formes d'urn servies par LinkedIn", () => {
    expect(LR.activityId(fake({ attrs: { "data-urn": "urn:li:ugcPost:998877665544" } }))).toBe(
      "998877665544",
    );
  });

  it("rend null plutôt que de lever quand rien ne correspond", () => {
    expect(LR.activityId(fake({ attrs: { "data-urn": "urn:li:fsd_profile:abc" } }))).toBeNull();
    expect(LR.activityId(null)).toBeNull();
    expect(LR.activityId({})).toBeNull();
  });

  it("reconstruit un lien exploitable", () => {
    expect(LR.postUrl("123456789")).toBe(
      "https://www.linkedin.com/feed/update/urn:li:activity:123456789/",
    );
    expect(LR.postUrl(null)).toBeNull();
  });
});

describe("detectMedia", () => {
  it("classe la vidéo avant l'image, qui n'est que sa vignette", () => {
    const post = fake({
      selectors: { video: fake(), ".update-components-image": fake() },
    });
    expect(LR.detectMedia(post)).toBe("video");
  });

  it("classe le carrousel avant l'image", () => {
    const post = fake({
      selectors: { ".update-components-document": fake(), ".update-components-image": fake() },
    });
    expect(LR.detectMedia(post)).toBe("document");
  });

  it("rend `none` quand rien n'accompagne le texte", () => {
    expect(LR.detectMedia(fake())).toBe("none");
  });
});

describe("extractPost", () => {
  it("relève auteur, texte, média et lien", () => {
    const post = fake({
      attrs: { "data-urn": "urn:li:activity:123456789" },
      selectors: {
        '.update-components-actor__title span[aria-hidden="true"]': fake({ text: "Théo Gouman" }),
        ".update-components-update-v2__commentary": [
          fake({ text: "Le vrai sujet, c'est le coût…voir plus" }),
        ],
        ".update-components-image": fake(),
      },
    });

    expect(LR.extractPost(post)).toEqual({
      source: "selecteur",
      id: "123456789",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:123456789/",
      authorName: "Théo Gouman",
      body: "Le vrai sujet, c'est le coût",
      media: "image",
    });
  });

  it("étiquette le contenu repartagé plutôt que de le coller au texte de surface", () => {
    const post = fake({
      attrs: {},
      selectors: {
        ".update-components-update-v2__commentary": [
          fake({ text: "Tout est dit ici." }),
          fake({ text: "Le billet original." }),
        ],
      },
    });
    const extracted = LR.extractPost(post);
    expect(extracted.body).toBe("Tout est dit ici.\n\n[Publication repartagée]\nLe billet original.");
    expect(extracted.id).toBeNull();
    expect(extracted.authorName).toBeNull();
  });

  it("ne répète pas un texte déjà contenu dans un nœud parent", () => {
    const post = fake({
      selectors: {
        ".update-components-update-v2__commentary": [
          fake({ text: "Un texte complet et son écho." }),
          fake({ text: "son écho." }),
        ],
      },
    });
    expect(LR.extractPost(post).body).toBe("Un texte complet et son écho.");
  });
});

describe("findPosts", () => {
  it("écarte les publications imbriquées, qui n'ont pas de barre d'actions", () => {
    const inner = fake();
    const outer = fake({ children: [inner] });
    const scope = {
      querySelectorAll: (selector) =>
        selector === '[data-urn^="urn:li:activity:"]' ? [outer, inner] : [],
    };
    expect(LR.findPosts(scope)).toEqual([outer]);
  });

  it("dédoublonne une publication attrapée par plusieurs sélecteurs", () => {
    const post = fake();
    const scope = { querySelectorAll: () => [post] };
    expect(LR.findPosts(scope)).toEqual([post]);
  });

  it("rend une liste vide plutôt que de lever sans document", () => {
    expect(LR.findPosts({})).toEqual([]);
  });
});

/** Bouton factice, avec un parent chaînable pour la remontée. */
function fakeButton({ label = "", text = "", parent = null } = {}) {
  return {
    tagName: "BUTTON",
    getAttribute: (name) => (name === "aria-label" ? label || null : null),
    hasAttribute: () => false,
    textContent: text,
    parentElement: parent,
  };
}

/** Chaîne d'ancêtres, du plus proche au plus lointain. */
function chainOf(button, levels) {
  let child = button;
  for (const level of levels) {
    child.parentElement = level;
    level.parentElement = null;
    child = level;
  }
  return levels;
}

function scopeWith(buttons) {
  return { querySelectorAll: (selector) => (selector === "button" ? buttons : []) };
}

describe("commentAnchors", () => {
  it("retient le bouton qui ouvre la rédaction, en français comme en anglais", () => {
    const fr = fakeButton({ label: "Commenter" });
    const en = fakeButton({ label: "Comment" });
    const long = fakeButton({ label: "Commenter le post de Théo Gouman" });
    expect(LR.commentAnchors(scopeWith([fr, en, long]))).toEqual([fr, en, long]);
  });

  it("écarte ce qui ouvre le fil des commentaires plutôt que la rédaction", () => {
    const compteur = fakeButton({ text: "12 commentaires" });
    const voir = fakeButton({ label: "Voir les commentaires" });
    const jaime = fakeButton({ label: "J'aime" });
    expect(LR.commentAnchors(scopeWith([compteur, voir, jaime]))).toEqual([]);
  });

  it("lit le texte du bouton quand il n'a pas de libellé accessible", () => {
    const button = fakeButton({ text: "  Commenter  " });
    expect(LR.commentAnchors(scopeWith([button]))).toEqual([button]);
  });

  /**
   * Notre bouton s'annonce « Proposer quatre commentaires ». Il ne commence pas
   * par le verbe, donc il ne passait pas ici — mais il passait dans
   * `COMMENT_BUTTON_SELECTORS`, et « Insérer » se cliquait dessus. La marque
   * `data-lr` ferme les deux portes d'un coup ; ce test tient la première.
   */
  it("ignore ce que l'extension a elle-même posé dans la page", () => {
    const notre = fakeButton({ label: "Commenter" });
    notre.hasAttribute = (name) => name === "data-lr";
    const vrai = fakeButton({ label: "Commenter" });
    vrai.hasAttribute = () => false;
    expect(LR.commentAnchors(scopeWith([notre, vrai]))).toEqual([vrai]);
  });

  /**
   * Le champ de saisie ouvert porte son propre bouton « Commenter », qui
   * publie. Le relevé comptait neuf ancres pour huit publications, et la carte
   * au champ ouvert n'était plus atteinte.
   */
  it("écarte le « Commenter » du champ de saisie, qui publie au lieu d'ouvrir", () => {
    const publier = fakeButton({ label: "Commenter" });
    const composeur = fake({ selectors: { '[contenteditable="true"]:not([data-lr])': fake() } });
    chainOf(publier, [composeur, fake()]);

    const ouvrir = fakeButton({ label: "Commenter" });
    chainOf(ouvrir, [fake(), fake()]);

    expect(LR.commentAnchors(scopeWith([publier, ouvrir]))).toEqual([ouvrir]);
  });

  it("rend une liste vide plutôt que de lever sans document", () => {
    expect(LR.commentAnchors({})).toEqual([]);
  });
});

describe("sélecteurs génériques", () => {
  /**
   * Les sélecteurs nommés d'après LinkedIn (`ql-editor`, `comment-button`) ne
   * peuvent pas attraper nos nœuds, qui ne portent pas ces noms. Les
   * génériques, si — et c'est exactement ce qui est arrivé. Chacun doit donc
   * porter l'exclusion.
   */
  it("excluent nos propres nœuds dès qu'ils ne nomment plus LinkedIn", () => {
    const generiques = [...LR.COMMENT_BUTTON_SELECTORS, ...LR.EDITOR_SELECTORS].filter(
      (selector) => /aria-label\*?=|contenteditable|role="textbox"/.test(selector),
    );
    expect(generiques.length).toBeGreaterThan(0);
    for (const selector of generiques) {
      if (selector.includes("ql-editor")) continue;
      expect(selector).toContain(":not([data-lr])");
    }
  });
});

describe("actionBarFor", () => {
  it("retient le plus petit ancêtre qui réunit plusieurs boutons", () => {
    const button = fakeButton({ label: "Commenter" });
    const cellule = fake({ selectors: { "button:not([data-lr])": [button] } });
    const barre = fake({
      selectors: { "button:not([data-lr])": [button, fake(), fake(), fake()] },
    });
    const carte = fake({
      selectors: { "button:not([data-lr])": [button, fake(), fake(), fake(), fake()] },
    });
    chainOf(button, [cellule, barre, carte]);
    expect(LR.actionBarFor(button, carte)).toBe(barre);
  });

  it("s'arrête à la publication plutôt que de remonter au-delà", () => {
    const button = fakeButton({ label: "Commenter" });
    const post = fake({ selectors: { "button:not([data-lr])": [button, fake(), fake()] } });
    chainOf(button, [post]);
    expect(LR.actionBarFor(button, post)).toBeNull();
  });

  it("rend null quand rien ne ressemble à une barre d'actions", () => {
    const button = fakeButton({ label: "Commenter" });
    chainOf(button, [fake(), fake()]);
    expect(LR.actionBarFor(button, null)).toBeNull();
  });
});

describe("insertionPointFor", () => {
  /** Remplace `getComputedStyle` le temps d'un test. */
  function withLayout(map, run) {
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (element) => map.get(element) || { display: "block" };
    try {
      return run();
    } finally {
      globalThis.getComputedStyle = previous;
    }
  }

  /**
   * La panne de l'image : le bloc posé juste après la barre entrait dans le
   * `flex` qui la porte, et les icônes se dispersaient autour de lui.
   */
  it("remonte hors des conteneurs qui rangent leurs enfants en ligne", () => {
    const button = fakeButton({ label: "Commenter" });
    const barre = fake({ selectors: { "button:not([data-lr])": [button, fake(), fake()] } });
    const rangee = fake();
    const colonne = fake();
    const carte = fake();
    chainOf(button, [barre, rangee, colonne, carte]);
    const layout = new Map([
      [rangee, { display: "flex", flexDirection: "row" }],
      [colonne, { display: "flex", flexDirection: "column" }],
    ]);
    expect(withLayout(layout, () => LR.insertionPointFor(button, carte))).toBe(rangee);
  });

  it("s'en tient à la barre quand son parent empile déjà verticalement", () => {
    const button = fakeButton({ label: "Commenter" });
    const barre = fake({ selectors: { "button:not([data-lr])": [button, fake(), fake()] } });
    const carte = fake();
    chainOf(button, [barre, fake(), carte]);
    expect(withLayout(new Map(), () => LR.insertionPointFor(button, carte))).toBe(barre);
  });

  it("ne sort jamais de la publication", () => {
    const button = fakeButton({ label: "Commenter" });
    const barre = fake({ selectors: { "button:not([data-lr])": [button, fake(), fake()] } });
    const carte = fake();
    chainOf(button, [barre, carte]);
    const layout = new Map([[carte, { display: "flex", flexDirection: "row" }]]);
    expect(withLayout(layout, () => LR.insertionPointFor(button, carte))).toBe(barre);
  });

  it("sans moteur de style, se pose après la barre plutôt que de lever", () => {
    const button = fakeButton({ label: "Commenter" });
    const barre = fake({ selectors: { "button:not([data-lr])": [button, fake(), fake()] } });
    const carte = fake();
    chainOf(button, [barre, carte]);
    expect(LR.insertionPointFor(button, carte)).toBe(barre);
  });
});

describe("containerFor", () => {
  it("s'arrête au premier ancêtre porteur d'un identifiant d'activité", () => {
    const button = fakeButton({ label: "Commenter" });
    const bar = fake();
    const post = fake({ attrs: { "data-urn": "urn:li:activity:123456789" } });
    const page = fake();
    chainOf(button, [bar, post, page]);
    expect(LR.containerFor(button)).toBe(post);
  });

  it("retombe sur le lien de profil et la longueur du texte quand tout est renommé", () => {
    const button = fakeButton({ label: "Commenter" });
    const bar = fake({ text: "court" });
    const post = fake({
      selectors: { 'a[href*="/in/"]': fake() },
      text: "x".repeat(200),
    });
    chainOf(button, [bar, post]);
    expect(LR.containerFor(button)).toBe(post);
  });

  it("rend null plutôt qu'un ancêtre arbitraire quand rien ne ressemble à un post", () => {
    const button = fakeButton({ label: "Commenter" });
    chainOf(button, [fake(), fake()]);
    expect(LR.containerFor(button)).toBeNull();
  });

  /**
   * La régression du 30 septembre, en un test.
   *
   * Le fil satisfait le dernier critère — un lien de profil, beaucoup de texte
   * — aussi bien qu'une publication. Sans borne, la remontée le rendait, il
   * contenait les sept autres cartes, et `findTargets` n'en gardait qu'une.
   */
  it("s'arrête avant l'ancêtre qui contient un autre bouton « Commenter »", () => {
    const button = fakeButton({ label: "Commenter" });
    const autre = fakeButton({ label: "Commenter" });
    const carte = fake({
      selectors: { 'a[href*="/in/"]': fake() },
      text: "x".repeat(400),
    });
    const fil = fake({
      selectors: { 'a[href*="/in/"]': fake() },
      text: "x".repeat(4000),
      children: [carte, autre],
    });
    chainOf(button, [carte, fil]);
    expect(LR.containerFor(button, [button, autre])).toBe(carte);
    // Sans la liste des ancres, rien ne borne la remontée : c'est l'ancien
    // comportement, et il rendait le fil.
    expect(LR.containerFor(button)).toBe(fil);
  });

  it("remonte assez profond : LinkedIn enfouit le bouton sous une quinzaine de niveaux", () => {
    const button = fakeButton({ label: "Commenter" });
    const niveaux = Array.from({ length: 17 }, () => fake({ text: "court" }));
    const carte = fake({
      selectors: { 'a[href*="/in/"]': fake() },
      text: "x".repeat(400),
    });
    chainOf(button, [...niveaux, carte]);
    expect(LR.containerFor(button, [button])).toBe(carte);
  });
});

describe("findTargets", () => {
  it("garde l'ancre comme point d'insertion quand elle existe", () => {
    const button = fakeButton({ label: "Commenter" });
    const post = fake({ attrs: { "data-urn": "urn:li:activity:123456789" } });
    chainOf(button, [post]);
    const scope = {
      querySelectorAll: (selector) => {
        if (selector === "button") return [button];
        if (selector === '[data-urn^="urn:li:activity:"]') return [post];
        return [];
      },
    };
    expect(LR.findTargets(scope)).toEqual([{ post, anchor: button }]);
  });

  it("trouve la publication par l'ancre même si aucun conteneur n'est reconnu", () => {
    const button = fakeButton({ label: "Commenter" });
    const post = fake({ attrs: { "data-id": "urn:li:activity:999999999" } });
    chainOf(button, [post]);
    const scope = { querySelectorAll: (selector) => (selector === "button" ? [button] : []) };
    expect(LR.findTargets(scope)).toEqual([{ post, anchor: button }]);
  });

  /**
   * Le relevé du 30 septembre, reproduit : huit boutons « Commenter », zéro
   * conteneur reconnu, et une seule cible retenue au lieu de huit. C'est le
   * test qui échouait avant la borne d'ascension, et le seul qui dise que le
   * bouton se posera bien sur chaque publication.
   */
  it("rend une cible par publication quand tous les noms de classes ont changé", () => {
    /** Arbre où `contains` descend vraiment, comme dans un vrai document. */
    function branche({ text = "", children = [] }) {
      const self = {
        tagName: "DIV",
        className: "",
        children,
        textContent: text || children.map((child) => child.textContent).join(""),
        parentElement: null,
        getAttribute: () => null,
        matches: () => false,
        querySelector: (selector) => (selector.includes("/in/") ? {} : null),
        contains: (other) =>
          other === self || children.some((child) => child.contains?.(other) ?? false),
      };
      for (const child of children) child.parentElement = self;
      return self;
    }

    const boutons = [];
    const cartes = [];
    for (let index = 0; index < 8; index += 1) {
      const bouton = {
        tagName: "BUTTON",
        getAttribute: (name) => (name === "aria-label" ? "Commenter" : null),
        textContent: "",
        parentElement: null,
        contains: (other) => other === bouton,
        children: [],
      };
      // Quinze niveaux entre le bouton et la carte, comme chez LinkedIn.
      let sommet = bouton;
      for (let depth = 0; depth < 15; depth += 1) sommet = branche({ children: [sommet] });
      const carte = branche({ children: [branche({ text: "x".repeat(400) }), sommet] });
      boutons.push(bouton);
      cartes.push(carte);
    }
    const fil = branche({ children: cartes });

    const scope = { querySelectorAll: (selector) => (selector === "button" ? boutons : []) };
    const targets = LR.findTargets(scope);
    expect(targets).toHaveLength(8);
    expect(targets.map((target) => target.post)).toEqual(cartes);
    expect(targets.map((target) => target.anchor)).toEqual(boutons);
    // Le fil satisfait les mêmes critères qu'une carte : c'est lui qu'on
    // rendait, et il avalait les sept autres.
    expect(targets.some((target) => target.post === fil)).toBe(false);
  });

  it("écarte la publication imbriquée d'un repartage", () => {
    const inner = fake();
    const outer = fake({ children: [inner] });
    const scope = {
      querySelectorAll: (selector) =>
        selector === '[data-urn^="urn:li:activity:"]' ? [outer, inner] : [],
    };
    expect(LR.findTargets(scope)).toEqual([{ post: outer, anchor: null }]);
  });
});

describe("diagnose", () => {
  it("compte les repères sans lever sur une page sans rien", () => {
    const report = LR.diagnose({ querySelectorAll: () => [] });
    expect(report.anchors).toBe(0);
    expect(report.posts).toBe(0);
    expect(report.targets).toBe(0);
    expect(report.counts["button (total)"]).toBe(0);
  });

  it("rend un relevé même sans document exploitable", () => {
    expect(LR.diagnose({})).toEqual({
      counts: {},
      anchors: 0,
      posts: 0,
      targets: 0,
      conteneurs: [],
    });
  });
});

/**
 * Nœud factice pour la recherche structurelle : elle interroge les
 * descendants, compare les positions et descend par `children`.
 */
function node({ text = "", children = [], holdsEditor = false, index = 0 } = {}) {
  const self = {
    _index: index,
    textContent: text || children.map((child) => child.textContent).join(""),
    children,
    contains: (other) => other === self || children.some((child) => child.contains?.(other)),
    querySelector: () => (holdsEditor ? {} : null),
    // 4 = DOCUMENT_POSITION_FOLLOWING : vrai quand l'autre vient après nous.
    compareDocumentPosition: (other) => (other._index > self._index ? 4 : 2),
  };
  return self;
}

function postWith(descendants) {
  return { querySelectorAll: () => descendants };
}

describe("densestTextBlock", () => {
  it("préfère le bloc le plus long situé AVANT le bouton « Commenter »", () => {
    const corps = node({ text: "x".repeat(300), index: 1 });
    const commentaires = node({ text: "y".repeat(900), index: 9 });
    const anchor = { _index: 5 };
    expect(LR.densestTextBlock(postWith([corps, commentaires]), anchor)).toBe(corps);
  });

  it("écarte un bloc qui englobe une zone de saisie", () => {
    const corps = node({ text: "x".repeat(300), index: 1 });
    const boite = node({ text: "y".repeat(900), index: 2, holdsEditor: true });
    const anchor = { _index: 5 };
    expect(LR.densestTextBlock(postWith([corps, boite]), anchor)).toBe(corps);
  });

  it("écarte un ancêtre du bouton, qui est la barre d'actions ou la carte entière", () => {
    const corps = node({ text: "x".repeat(300), index: 1 });
    const anchor = { _index: 5 };
    const carte = node({ text: "z".repeat(2000), index: 0, children: [] });
    carte.contains = (other) => other === anchor;
    expect(LR.densestTextBlock(postWith([carte, corps]), anchor)).toBe(corps);
  });

  it("rend null quand rien n'atteint la taille d'un vrai texte", () => {
    const bribe = node({ text: "court", index: 1 });
    expect(LR.densestTextBlock(postWith([bribe]), { _index: 5 })).toBeNull();
  });

  it("resserre sur l'enfant dominant, ce qui écarte l'entête auteur", () => {
    const corps = node({ text: "x".repeat(400), index: 2 });
    const entete = node({ text: "Théo Gouman · 2 j", index: 1 });
    const bloc = node({ children: [entete, corps], index: 0 });
    expect(LR.densestTextBlock(postWith([bloc]), { _index: 9 })).toBe(corps);
  });

  /**
   * L'autre moitié de la régression : la carte entière gagnait en longueur, et
   * ce qui remontait était « Post du fil d'actualité / Jérôme Knops / CTO
   * @Edenio… » au lieu du corps. L'avatar dans le lien de profil sépare
   * l'entête du texte sans supposer aucun nom de classe.
   */
  it("écarte le bloc qui englobe l'entête auteur, reconnu à son avatar", () => {
    const corps = node({ text: "Le corps, court mais c'est bien lui qu'on veut lire.", index: 3 });
    const carte = node({ text: "y".repeat(900), index: 1 });
    carte.querySelector = (selector) => (selector.includes("img") ? {} : null);
    expect(LR.densestTextBlock(postWith([carte, corps]), { _index: 9 })).toBe(corps);
  });

  it("reprend la carte entière plutôt que rien quand elle est tout ce qu'il y a", () => {
    const carte = node({ text: "z".repeat(300), index: 1 });
    carte.querySelector = (selector) => (selector.includes("img") ? {} : null);
    expect(LR.densestTextBlock(postWith([carte]), { _index: 9 })).toBe(carte);
  });

  it("s'arrête quand aucun enfant ne porte l'essentiel du texte", () => {
    const moitie = node({ text: "x".repeat(200), index: 1 });
    const autre = node({ text: "y".repeat(200), index: 2 });
    const bloc = node({ children: [moitie, autre], index: 0 });
    expect(LR.tighten(bloc)).toBe(bloc);
  });
});

describe("extractPost, repli structurel", () => {
  it("bascule sur la structure quand aucun sélecteur ne rend de texte", () => {
    const corps = node({ text: "Un vrai corps de publication, bien assez long.", index: 2 });
    const anchor = { _index: 9 };
    const post = {
      getAttribute: () => null,
      querySelector: () => null,
      querySelectorAll: (selector) => (selector.includes("div") ? [corps] : []),
    };
    const extracted = LR.extractPost(post, anchor);
    expect(extracted.source).toBe("structure");
    expect(extracted.body).toBe("Un vrai corps de publication, bien assez long.");
  });

  it("dit `aucune` quand même la structure ne donne rien", () => {
    const post = {
      getAttribute: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const extracted = LR.extractPost(post, null);
    expect(extracted.source).toBe("aucune");
    expect(extracted.body).toBe("");
  });
});
