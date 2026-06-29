import { StoriesService } from "./stories.service";
import { User } from "../auth/user.entity";
import { Story } from "./story.entity";

type Row = Record<string, unknown>;

/** Matches a row against a TypeORM-style where, understanding In()/MoreThan(). */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "_type" in (v as object)) {
      const op = v as { _type: string; _value: unknown };
      if (op._type === "in") return (op._value as unknown[]).includes(row[k]);
      if (op._type === "moreThan") return (row[k] as number) > (op._value as number);
      return false;
    }
    return row[k] === v;
  });
}

function fakeRepo() {
  const rows: Row[] = [];
  let seq = 0;
  return {
    rows,
    insert: async (obj: Row) => {
      rows.push({ id: `s${(seq += 1)}`, ...obj });
      return {};
    },
    find: async ({ where, order }: { where: Row; order?: { createdAt: "DESC" | "ASC" } }) => {
      let out = rows.filter((r) => matches(r, where));
      if (order?.createdAt) {
        out = [...out].sort(
          (a, b) =>
            (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
        );
      }
      return out;
    },
    delete: async (where: Row) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], where)) rows.splice(i, 1);
      return {};
    },
  };
}

function makeService(following: string[] = []) {
  const storyRepo = fakeRepo();
  const userRepo = fakeRepo();
  const addUser = (id: string) =>
    userRepo.rows.push({ id, username: id, displayName: id, isPrivate: false });
  const db = { repo: (e: unknown) => (e === Story ? storyRepo : e === User ? userRepo : undefined) };
  const follows = { followingIds: async () => following };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new StoriesService(db as any, follows as any);
  return { service, storyRepo, addUser };
}

describe("StoriesService", () => {
  it("reshares an article, keeping one bubble per article", async () => {
    const { service, storyRepo } = makeService();
    await service.create("u1", { articleId: "A", title: "A" });
    await service.create("u1", { articleId: "A", title: "A again" });
    expect(storyRepo.rows.filter((r) => r.articleId === "A")).toHaveLength(1);
  });

  it("feeds active stories from followed authors + self, grouped by author", async () => {
    const { service, storyRepo, addUser } = makeService(["author"]);
    addUser("me");
    addUser("author");
    addUser("stranger");

    const now = Date.now();
    const at = (msAgo: number) => new Date(now - msAgo);
    storyRepo.rows.push(
      { id: "1", userId: "author", articleId: "X", title: "X", image: null, createdAt: at(1000) },
      { id: "2", userId: "author", articleId: "Y", title: "Y", image: null, createdAt: at(2000) },
      { id: "3", userId: "me", articleId: "Z", title: "Z", image: null, createdAt: at(500) },
      // Too old (>24h) — excluded.
      { id: "4", userId: "author", articleId: "OLD", title: "old", image: null, createdAt: at(25 * 3600 * 1000) },
      // Not followed — excluded.
      { id: "5", userId: "stranger", articleId: "S", title: "s", image: null, createdAt: at(100) },
    );

    const feed = await service.feed("me");
    const byUser = Object.fromEntries(feed.map((g) => [g.user.username, g.items.map((i) => i.articleId)]));
    expect(Object.keys(byUser).sort()).toEqual(["author", "me"]);
    expect(byUser.author).toEqual(["X", "Y"]); // most recent first, OLD excluded
    expect(byUser.me).toEqual(["Z"]);
    expect(byUser.stranger).toBeUndefined();
  });

  it("returns nothing when there are no active stories", async () => {
    const { service, addUser } = makeService([]);
    addUser("me");
    expect(await service.feed("me")).toEqual([]);
  });
});
