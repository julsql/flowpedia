import { ServiceUnavailableException } from "@nestjs/common";
import { LibraryService } from "./library.service";
import { LibraryItem } from "./library-item.entity";

interface Row {
  userId: string;
  articleId: string;
  kind: string;
  folder?: string | null;
}

/** In-memory stand-in for the LibraryItem repository (incl. the insert builder). */
function fakeLibraryRepo() {
  const rows: Row[] = [];
  const qb = {
    vals: [] as Row[],
    insert() {
      return qb;
    },
    values(v: Row | Row[]) {
      qb.vals = Array.isArray(v) ? v : [v];
      return qb;
    },
    orIgnore() {
      return qb;
    },
    orUpdate() {
      return qb;
    },
    async execute() {
      for (const v of qb.vals) {
        const existing = rows.find(
          (r) => r.userId === v.userId && r.articleId === v.articleId && r.kind === v.kind,
        );
        if (existing) {
          existing.folder = v.folder ?? null; // orUpdate(["folder"])
        } else {
          rows.push({ ...v });
        }
      }
      return {};
    },
  };
  return {
    rows,
    createQueryBuilder: () => qb,
    find: async ({ where }: { where: { userId: string } }) =>
      rows.filter((r) => r.userId === where.userId),
    // Delete rows matching every key present in `where` (userId, and optionally
    // articleId/kind) — so a whole-kind clear works alongside single removes.
    delete: async (where: Partial<Row>) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const r = rows[i];
        if ((Object.keys(where) as (keyof Row)[]).every((k) => r[k] === where[k])) {
          rows.splice(i, 1);
        }
      }
      return {};
    },
  };
}

function makeService(connected = true) {
  const repo = connected ? fakeLibraryRepo() : undefined;
  const db = { repo: (e: unknown) => (e === LibraryItem ? repo : undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new LibraryService(db as any), repo };
}

describe("LibraryService", () => {
  it("adds entries into their kind buckets and lists them per account", async () => {
    const { service } = makeService();
    await service.add("u1", "Article A", "like");
    await service.add("u1", "Article B", "save");
    await service.add("u1", "Article C", "share");
    await service.add("u2", "Other", "like");

    const lib = await service.list("u1");
    expect(lib.liked).toEqual(["Article A"]);
    expect(lib.saved).toEqual(["Article B"]);
    expect(lib.shared).toEqual(["Article C"]);
  });

  it("persists reading history (kind read) so it syncs cross-device", async () => {
    const { service } = makeService();
    await service.add("u1", "Article R", "read");
    expect((await service.list("u1")).read).toEqual(["Article R"]);
  });

  it("files a bookmark under a folder and lists distinct folders", async () => {
    const { service } = makeService();
    await service.add("u1", "A", "save", "Voyage");
    await service.add("u1", "B", "save", "Voyage");
    await service.add("u1", "C", "save"); // unfiled
    const lib = await service.list("u1");
    expect(lib.saved.sort()).toEqual(["A", "B", "C"]);
    expect(lib.folders).toEqual(["Voyage"]);
    expect(lib.savedFolders).toEqual({ A: "Voyage", B: "Voyage" });
  });

  it("moves a bookmark between folders on re-save (still one save)", async () => {
    const { service } = makeService();
    await service.add("u1", "A", "save", "Voyage");
    await service.add("u1", "A", "save", "Cuisine");
    const lib = await service.list("u1");
    expect(lib.saved).toEqual(["A"]);
    expect(lib.savedFolders).toEqual({ A: "Cuisine" });
  });

  it("bulk-adds a device's local library in one call, skipping dupes/invalids", async () => {
    const { service, repo } = makeService();
    await service.add("u1", "A", "like");
    await service.addMany("u1", [
      { articleId: "A", kind: "like" }, // dupe → ignored
      { articleId: "B", kind: "save" },
      { articleId: "C", kind: "read" },
      { articleId: "", kind: "read" }, // invalid → skipped
      { articleId: "D", kind: "bogus" as never }, // invalid → skipped
    ]);
    expect(repo!.rows.filter((r) => r.userId === "u1")).toHaveLength(3);
  });

  it("clears a whole kind without touching the others", async () => {
    const { service } = makeService();
    await service.addMany("u1", [
      { articleId: "R1", kind: "read" },
      { articleId: "R2", kind: "read" },
      { articleId: "L1", kind: "like" },
    ]);
    await service.clearKind("u1", "read");
    const lib = await service.list("u1");
    expect(lib.read).toEqual([]);
    expect(lib.liked).toEqual(["L1"]);
  });

  it("is idempotent on repeated adds and removes on demand", async () => {
    const { service, repo } = makeService();
    await service.add("u1", "A", "like");
    await service.add("u1", "A", "like");
    expect(repo!.rows.filter((r) => r.articleId === "A")).toHaveLength(1);

    await service.remove("u1", "A", "like");
    expect((await service.list("u1")).liked).toEqual([]);
  });

  it("ignores invalid kinds and empty ids", async () => {
    const { service, repo } = makeService();
    await service.add("u1", "A", "bogus" as never);
    await service.add("u1", "", "like");
    expect(repo!.rows).toHaveLength(0);
  });

  it("requires a database", async () => {
    const { service } = makeService(false);
    await expect(service.list("u1")).rejects.toThrow(ServiceUnavailableException);
  });
});
