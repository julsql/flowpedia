import { ConflictException, NotFoundException } from "@nestjs/common";
import { MessagesService } from "./messages.service";
import { User } from "../auth/user.entity";
import { PageMessage } from "./page-message.entity";

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
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
      rows.push({ id: `m${(seq += 1)}`, read: false, createdAt: new Date(2026, 0, seq), ...obj });
      return {};
    },
    find: async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)),
    findOne: async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null,
    count: async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)).length,
  };
}

function makeService() {
  const msgRepo = fakeRepo();
  const userRepo = fakeRepo();
  userRepo.rows.push({ id: "alice", username: "alice", displayName: "Alice", isPrivate: false });
  userRepo.rows.push({ id: "bob", username: "bob", displayName: "Bob", isPrivate: false });
  const db = {
    repo: (e: unknown) => (e === PageMessage ? msgRepo : e === User ? userRepo : undefined),
  };
  const notifications = { notify: jest.fn(async () => undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new MessagesService(db as any, notifications as any);
  return { service, msgRepo, notifications };
}

describe("MessagesService", () => {
  it("sends a page and notifies the recipient", async () => {
    const { service, msgRepo, notifications } = makeService();
    await service.send("alice", { toUsername: "bob", articleId: "Paris", title: "Paris" });
    expect(msgRepo.rows).toHaveLength(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "bob", actorId: "alice", type: "page_received" }),
    );
  });

  it("rejects an unknown recipient and self-sends", async () => {
    const { service } = makeService();
    await expect(
      service.send("alice", { toUsername: "ghost", articleId: "X" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.send("alice", { toUsername: "alice", articleId: "X" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("lists the inbox with the sender hydrated", async () => {
    const { service } = makeService();
    await service.send("alice", { toUsername: "bob", articleId: "Paris", title: "Paris" });
    const inbox = await service.inbox("bob");
    expect(inbox).toHaveLength(1);
    expect(inbox[0].from.username).toBe("alice");
    expect(inbox[0].articleId).toBe("Paris");
  });
});
