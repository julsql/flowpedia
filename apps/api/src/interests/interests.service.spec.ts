import { InterestsService } from "./interests.service";
import { WikipediaService } from "../wikipedia/wikipedia.service";

/**
 * Drives the derivation off a fixed category graph so we can assert the adaptive
 * granularity precisely. `graph[title]` is the list of topical categories a title
 * (article *or* "Cat:" page) belongs to — the same shape getTopicalCategories
 * returns. Unknown titles have no categories.
 */
function serviceWithGraph(graph: Record<string, string[]>): InterestsService {
  const wikipedia = {
    getTopicalCategories: jest.fn(async (title: string) => graph[title] ?? []),
  } as unknown as WikipediaService;
  return new InterestsService(wikipedia);
}

describe("InterestsService.deriveInterests", () => {
  it("keeps a tight cluster at its specific shared category", async () => {
    // Four French kings — all share the specific "Roi de France" category.
    const graph: Record<string, string[]> = {
      "Louis XIV": ["Cat:Roi de France"],
      "Louis XV": ["Cat:Roi de France"],
      "François Ier": ["Cat:Roi de France"],
      "Henri IV": ["Cat:Roi de France"],
      "Cat:Roi de France": ["Cat:Histoire de France", "Cat:Monarque du Moyen Âge"],
    };
    const interests = await serviceWithGraph(graph).deriveInterests(Object.keys(graph).slice(0, 4));

    expect(interests).toHaveLength(1);
    expect(interests[0]).toEqual({ id: "Cat:Roi de France", label: "Roi de France" });
  });

  it("climbs to a uniting ancestor when the cluster is dispersed", async () => {
    // Two French + two Chinese medieval pages: no specific category recurs across
    // ≥60% of the set, but they share the ancestor "Moyen Âge".
    const graph: Record<string, string[]> = {
      "Louis IX": ["Cat:Roi de France"],
      "Philippe II": ["Cat:Roi de France"],
      "Taizong": ["Cat:Empereur de Chine"],
      "Wu Zetian": ["Cat:Empereur de Chine"],
      "Cat:Roi de France": ["Cat:Moyen Âge"],
      "Cat:Empereur de Chine": ["Cat:Moyen Âge"],
    };
    const interests = await serviceWithGraph(graph).deriveInterests([
      "Louis IX",
      "Philippe II",
      "Taizong",
      "Wu Zetian",
    ]);

    expect(interests.map((i) => i.label)).toEqual(["Moyen Âge"]);
  });

  it("surfaces several distinct interests for unrelated clusters", async () => {
    const graph: Record<string, string[]> = {
      "Louis XIV": ["Cat:Roi de France"],
      "Louis XV": ["Cat:Roi de France"],
      "Henri IV": ["Cat:Roi de France"],
      "Catherine Deneuve": ["Cat:Actrice française"],
      "Isabelle Adjani": ["Cat:Actrice française"],
      "Jean Gabin": ["Cat:Actrice française"],
    };
    const interests = await serviceWithGraph(graph).deriveInterests(Object.keys(graph));

    expect(interests.map((i) => i.label).sort()).toEqual(["Actrice française", "Roi de France"]);
  });

  it("drops one-off categories that no second article shares", async () => {
    const graph: Record<string, string[]> = {
      "Louis XIV": ["Cat:Roi de France", "Cat:Naissance en 1638"],
      "Louis XV": ["Cat:Roi de France", "Cat:Naissance en 1710"],
    };
    const interests = await serviceWithGraph(graph).deriveInterests(["Louis XIV", "Louis XV"]);

    expect(interests.map((i) => i.label)).toEqual(["Roi de France"]);
  });

  it("returns nothing below the minimum coverage", async () => {
    const interests = await serviceWithGraph({ "Solo": ["Cat:Anything"] }).deriveInterests(["Solo"]);
    expect(interests).toEqual([]);
  });
});
