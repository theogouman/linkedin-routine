import { describe, expect, it } from "vitest";
import { buildPushMessage, checksPerDayToCron } from "./message";

describe("buildPushMessage", () => {
  it("n'envoie rien quand il n'y a rien à traiter", () => {
    expect(buildPushMessage({ posts: 0, comments: 0 })).toBeNull();
    expect(buildPushMessage({ posts: -1, comments: 0 })).toBeNull();
  });

  it("accorde le singulier et le pluriel", () => {
    expect(buildPushMessage({ posts: 1, comments: 0 })?.body)
      .toBe("1 publication non traitée dans ton fil.");
    expect(buildPushMessage({ posts: 4, comments: 0 })?.body)
      .toBe("4 publications non traitées dans ton fil.");
  });

  it("dirige vers l'inbox quand seuls des commentaires attendent", () => {
    const message = buildPushMessage({ posts: 0, comments: 3 });
    expect(message).toMatchObject({ url: "/inbox", title: "Nouveaux commentaires" });
    expect(message?.body).toBe("3 commentaires attendent une réponse.");
  });

  it("combine les deux files et ouvre sur le fil", () => {
    const message = buildPushMessage({ posts: 2, comments: 1 });
    expect(message?.body).toBe("2 publications et 1 commentaire reçu.");
    expect(message?.url).toBe("/fil");
  });
});

describe("checksPerDayToCron", () => {
  it("traduit 2 vérifications par jour en un cron de 12 h", () => {
    expect(checksPerDayToCron(2)).toBe("0 8/12 * * *");
  });

  it("gère une seule vérification quotidienne", () => {
    expect(checksPerDayToCron(1)).toBe("0 8 * * *");
  });

  it("borne les valeurs absurdes", () => {
    expect(checksPerDayToCron(0)).toBe("0 8 * * *");
    expect(checksPerDayToCron(1000)).toBe("0 8/1 * * *");
  });
});
