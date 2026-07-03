import { SeenService } from "./seen.service";
import { DatabaseService } from "../database/database.service";
import { Interaction } from "../events/interaction.entity";

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function service(rows: Partial<Interaction>[] | null): SeenService {
  const repo = rows ? { find: jest.fn(async () => rows) } : undefined;
  const db = { repo: jest.fn(() => repo) } as unknown as DatabaseService;
  return new SeenService(db);
}

const seenRow = (articleId: string, type: string, ageDays: number): Partial<Interaction> => ({
  articleId,
  type,
  ts: String(now - ageDays * DAY),
});

describe("SeenService.getSeen", () => {
  it("returns titles still within cooldown", async () => {
    const seen = await service([seenRow("A", "impression", 1), seenRow("B", "impression", 40)]).getSeen("u1");
    expect(seen.has("A")).toBe(true);
    expect(seen.has("B")).toBe(false);
  });

  it("is empty without a database", async () => {
    expect((await service(null).getSeen("u1")).size).toBe(0);
  });

  it("is empty for a guest", async () => {
    expect((await service([seenRow("A", "impression", 1)]).getSeen(undefined)).size).toBe(0);
  });
});
