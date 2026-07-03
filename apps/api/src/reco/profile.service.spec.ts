import { ProfileService } from "./profile.service";
import { DatabaseService } from "../database/database.service";
import { Interaction } from "../events/interaction.entity";
import { WikipediaService } from "../wikipedia/wikipedia.service";

const now = Date.now();

/** A ProfileService backed by fixed interaction rows + a fixed category graph. */
function service(
  rows: Partial<Interaction>[] | null,
  graph: Record<string, string[]> = {},
): ProfileService {
  const repo = rows
    ? { find: jest.fn(async () => rows) }
    : undefined;
  const db = { repo: jest.fn(() => repo) } as unknown as DatabaseService;
  const wikipedia = {
    getTopicalCategories: jest.fn(async (title: string) => graph[title] ?? []),
  } as unknown as WikipediaService;
  return new ProfileService(db, wikipedia);
}

const sig = (articleId: string, type: string, ts = now): Partial<Interaction> => ({
  articleId,
  type,
  value: null,
  ts: String(ts),
});

describe("ProfileService.getWeightedSeeds", () => {
  it("returns most-engaged titles first, capped to the limit", async () => {
    const svc = service([sig("A", "like"), sig("A", "save"), sig("B", "read")]);
    expect(await svc.getWeightedSeeds("u1", 5)).toEqual(["A", "B"]);
    expect(await svc.getWeightedSeeds("u1", 1)).toEqual(["A"]);
  });

  it("is empty without a database", async () => {
    expect(await service(null).getWeightedSeeds("u1", 5)).toEqual([]);
  });

  it("is empty for a guest (no userId)", async () => {
    const svc = service([sig("A", "like")]);
    expect(await svc.getWeightedSeeds(undefined, 5)).toEqual([]);
  });

  it("drops an unliked article via the remove event", async () => {
    const svc = service([sig("A", "like", now - 1000), sig("A", "remove", now)]);
    expect(await svc.getWeightedSeeds("u1", 5)).toEqual([]);
  });
});

describe("ProfileService.getCategoryAffinity", () => {
  it("accumulates engaged articles' categories, most-affine first", async () => {
    const svc = service(
      [sig("A", "share"), sig("B", "like"), sig("C", "read")],
      { A: ["Cat:History"], B: ["Cat:History"], C: ["Cat:Sport"] },
    );
    const { entries } = await svc.getCategoryAffinity("u1");
    expect(entries[0].category).toBe("Cat:History"); // shared+liked outweigh a read
    expect(entries.map((e) => e.category)).toContain("Cat:Sport");
  });

  it("is empty without engagement", async () => {
    expect((await service([]).getCategoryAffinity("u1")).entries).toEqual([]);
  });
});
