import { BlockService } from "./block.service";
import { DatabaseService } from "../database/database.service";
import { BlockedTopic } from "./blocked-topic.entity";

function service(rows: Partial<BlockedTopic>[] | null) {
  const repo = rows
    ? { find: jest.fn(async () => rows), upsert: jest.fn(async () => undefined), delete: jest.fn(async () => undefined) }
    : undefined;
  const db = { repo: jest.fn(() => repo) } as unknown as DatabaseService;
  return { svc: new BlockService(db), repo };
}

describe("BlockService", () => {
  it("returns the set of blocked topics", async () => {
    const { svc } = service([{ topic: "Sport" }, { topic: "Politique" }]);
    const blocked = await svc.getBlocked("u1");
    expect(blocked.has("Sport")).toBe(true);
    expect(blocked.has("Politique")).toBe(true);
  });

  it("is empty without a database or user", async () => {
    expect((await service(null).svc.getBlocked("u1")).size).toBe(0);
    expect((await service([]).svc.getBlocked(undefined)).size).toBe(0);
  });

  it("upserts on block (idempotent) and deletes on unblock", async () => {
    const { svc, repo } = service([]);
    await svc.block("u1", "Sport");
    expect(repo!.upsert).toHaveBeenCalledWith({ userId: "u1", topic: "Sport" }, ["userId", "topic"]);
    await svc.unblock("u1", "Sport");
    expect(repo!.delete).toHaveBeenCalledWith({ userId: "u1", topic: "Sport" });
  });

  it("ignores empty topic or user", async () => {
    const { svc, repo } = service([]);
    await svc.block("", "Sport");
    await svc.block("u1", "");
    expect(repo!.upsert).not.toHaveBeenCalled();
  });
});
