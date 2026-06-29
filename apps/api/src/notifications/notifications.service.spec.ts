import { NotificationsService } from "./notifications.service";
import { User } from "../auth/user.entity";
import { Notification } from "./notification.entity";

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object") {
      const op = v as { _type?: string; _value?: unknown; value?: unknown };
      // TypeORM Not(x)
      if (op._type === "not") return row[k] !== op._value;
      // TypeORM In([...])
      if (Array.isArray(op.value)) return (op.value as unknown[]).includes(row[k]);
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
      rows.push({ id: `n${(seq += 1)}`, read: false, createdAt: new Date(2026, 0, seq), ...obj });
      return {};
    },
    find: async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)),
    findOne: async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null,
    count: async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)).length,
    update: async (where: Row, set: Row) => {
      rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, set));
      return {};
    },
  };
}

function makeService() {
  const notifRepo = fakeRepo();
  const userRepo = fakeRepo();
  userRepo.rows.push({ id: "alice", username: "alice", displayName: "Alice", isPrivate: false });
  const db = {
    repo: (e: unknown) => (e === Notification ? notifRepo : e === User ? userRepo : undefined),
  };
  const push = {
    tokensForUser: jest.fn(async () => [{ token: "ExponentPushToken[x]", locale: "fr" }]),
    send: jest.fn(async () => undefined),
  };
  const realtime = { emitToUser: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new NotificationsService(db as any, push as any, realtime as any);
  return { service, notifRepo, push, realtime };
}

describe("NotificationsService", () => {
  it("creates a notification and fires a localized push", async () => {
    const { service, notifRepo, push } = makeService();
    await service.notify({ recipientId: "bob", actorId: "alice", type: "follower" });
    expect(notifRepo.rows).toHaveLength(1);
    // fr token → French body ("vous suit")
    expect(push.send).toHaveBeenCalledWith([
      expect.objectContaining({ to: "ExponentPushToken[x]", body: expect.stringContaining("suit") }),
    ]);
  });

  it("never notifies a user about their own action", async () => {
    const { service, notifRepo, push } = makeService();
    await service.notify({ recipientId: "alice", actorId: "alice", type: "follower" });
    expect(notifRepo.rows).toHaveLength(0);
    expect(push.send).not.toHaveBeenCalled();
  });

  it("hydrates the actor and counts unread", async () => {
    const { service } = makeService();
    await service.notify({ recipientId: "bob", actorId: "alice", type: "follow_request" });
    const list = await service.list("bob");
    expect(list[0].actor?.username).toBe("alice");
    expect(list[0].read).toBe(false);
    expect(await service.unreadCount("bob")).toBe(1);
    await service.markAllRead("bob");
    expect(await service.unreadCount("bob")).toBe(0);
  });
});
