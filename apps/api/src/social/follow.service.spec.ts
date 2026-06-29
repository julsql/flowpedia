import { ConflictException } from "@nestjs/common";
import { FollowService } from "./follow.service";
import { User } from "../auth/user.entity";
import { Follow } from "./follow.entity";

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    // Handle TypeORM In(): a FindOperator carrying a `.value` array.
    if (v && typeof v === "object" && Array.isArray((v as { value?: unknown[] }).value)) {
      return ((v as { value: unknown[] }).value as unknown[]).includes(row[k]);
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
      rows.push({ id: `r${(seq += 1)}`, createdAt: new Date(2026, 0, seq), ...obj });
      return {};
    },
    findOne: async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null,
    find: async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)),
    count: async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)).length,
    delete: async (where: Row) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], where)) rows.splice(i, 1);
      return {};
    },
    update: async (where: Row, set: Row) => {
      rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, set));
      return {};
    },
  };
}

function makeService() {
  const userRepo = fakeRepo();
  const followRepo = fakeRepo();
  const addUser = (username: string, isPrivate = false) => {
    const u = {
      id: username,
      username,
      displayName: username,
      isPrivate,
      passwordHash: "x",
    };
    userRepo.rows.push(u);
    return u;
  };
  const db = {
    repo: (e: unknown) => (e === User ? userRepo : e === Follow ? followRepo : undefined),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new FollowService(db as any);
  return { service, addUser, followRepo };
}

describe("FollowService", () => {
  it("follows a public account immediately and a private one as a request", async () => {
    const { service, addUser } = makeService();
    addUser("alice");
    addUser("bob", true);

    expect((await service.follow("me", "alice")).state).toBe("active");
    expect((await service.follow("me", "bob")).state).toBe("pending");
  });

  it("rejects following yourself and returns the existing state on repeat", async () => {
    const { service, addUser } = makeService();
    addUser("me");
    addUser("alice");
    await expect(service.follow("me", "me")).rejects.toThrow(ConflictException);

    await service.follow("me", "alice");
    expect((await service.follow("me", "alice")).state).toBe("active");
  });

  it("approves a request: the follower then counts and can see content", async () => {
    const { service, addUser } = makeService();
    addUser("owner", true);
    addUser("fan");

    await service.follow("fan", "owner");
    // Pending: not yet a follower, content hidden.
    let profile = await service.profile("fan", "owner");
    expect(profile.state).toBe("pending");
    expect(profile.canViewContent).toBe(false);
    expect(await service.followers("fan", "owner")).toEqual([]);
    expect((await service.requests("owner")).map((u) => u.username)).toEqual(["fan"]);

    await service.acceptRequest("owner", "fan");
    profile = await service.profile("fan", "owner");
    expect(profile.state).toBe("active");
    expect(profile.canViewContent).toBe(true);
    expect(profile.followers).toBe(1);
    expect((await service.followers("fan", "owner")).map((u) => u.username)).toEqual(["fan"]);
  });

  it("reports followsYou, unfollows, and lets an owner remove a follower", async () => {
    const { service, addUser } = makeService();
    addUser("a");
    addUser("b");
    await service.follow("b", "a"); // b → a (public)

    const aSeesB = await service.profile("a", "b");
    expect(aSeesB.followsYou).toBe(true); // b follows a
    expect(aSeesB.state).toBe("none");

    await service.removeFollower("a", "b");
    expect((await service.profile("a", "b")).followsYou).toBe(false);

    await service.follow("a", "b");
    await service.unfollow("a", "b");
    expect((await service.profile("a", "b")).state).toBe("none");
  });

  it("rejecting a request removes it without following", async () => {
    const { service, addUser } = makeService();
    addUser("owner", true);
    addUser("fan");
    await service.follow("fan", "owner");
    await service.rejectRequest("owner", "fan");
    expect(await service.requests("owner")).toEqual([]);
    expect((await service.profile("fan", "owner")).state).toBe("none");
  });
});
