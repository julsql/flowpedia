import { ServiceUnavailableException } from "@nestjs/common";
import { LibraryService } from "./library.service";
import { LibraryItem } from "./library-item.entity";

interface Row {
  userId: string;
  articleId: string;
  kind: string;
}

/** In-memory stand-in for the LibraryItem repository (incl. the insert builder). */
function fakeLibraryRepo() {
  const rows: Row[] = [];
  const qb = {
    vals: null as Row | null,
    insert() {
      return qb;
    },
    values(v: Row) {
      qb.vals = v;
      return qb;
    },
    orIgnore() {
      return qb;
    },
    async execute() {
      const v = qb.vals!;
      const dupe = rows.some(
        (r) => r.userId === v.userId && r.articleId === v.articleId && r.kind === v.kind,
      );
      if (!dupe) rows.push({ ...v });
      return {};
    },
  };
  return {
    rows,
    createQueryBuilder: () => qb,
    find: async ({ where }: { where: { userId: string } }) =>
      rows.filter((r) => r.userId === where.userId),
    delete: async (where: Row) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const r = rows[i];
        if (r.userId === where.userId && r.articleId === where.articleId && r.kind === where.kind) {
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
