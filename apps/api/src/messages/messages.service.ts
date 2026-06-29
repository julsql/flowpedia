import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { In, type Repository } from "typeorm";
import type {
  ConversationMessage,
  ConversationSummary,
  PublicUser,
  SendPageRequest,
  SentPageItem,
} from "@flowpedia/shared";
import { DatabaseService } from "../database/database.service";
import { User } from "../auth/user.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { PageMessage } from "./page-message.entity";

function toPublic(u: User): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, isPrivate: u.isPrivate };
}

/** Direct page-sending: a user pushes one article to another account's inbox. */
@Injectable()
export class MessagesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  private messages(): Repository<PageMessage> {
    const repo = this.db.repo(PageMessage);
    if (!repo) {
      throw new ServiceUnavailableException("Messages require a database (DATABASE_URL).");
    }
    return repo;
  }

  private users(): Repository<User> {
    const repo = this.db.repo(User);
    if (!repo) {
      throw new ServiceUnavailableException("Messages require a database (DATABASE_URL).");
    }
    return repo;
  }

  async send(fromUserId: string, body: SendPageRequest): Promise<void> {
    if (!body?.articleId || !body?.toUsername) {
      throw new BadRequestException("A recipient and an article are required.");
    }
    const recipient = await this.users().findOne({
      where: { username: body.toUsername.trim().toLowerCase() },
    });
    if (!recipient) {
      throw new NotFoundException("Account not found.");
    }
    if (recipient.id === fromUserId) {
      throw new ConflictException("You can't send a page to yourself.");
    }
    await this.messages().insert({
      fromUserId,
      toUserId: recipient.id,
      articleId: body.articleId,
      title: body.title ?? null,
      image: body.image ?? null,
      note: body.note?.trim() ? body.note.trim() : null,
    });
    // A page is a message, not a bell notification: push + live "message" event,
    // but no entry in the notifications center.
    await this.notifications.notify(
      {
        recipientId: recipient.id,
        actorId: fromUserId,
        type: "page_received",
        articleId: body.articleId,
        title: body.title ?? null,
      },
      { persist: false, event: "message" },
    );
  }

  /** The account's received pages, most recent first. */
  async inbox(userId: string): Promise<SentPageItem[]> {
    const rows = await this.messages().find({
      where: { toUserId: userId },
      order: { createdAt: "DESC" },
      take: 100,
    });
    if (!rows.length) {
      return [];
    }
    const senderIds = [...new Set(rows.map((r) => r.fromUserId))];
    const senders = await this.users().find({ where: { id: In(senderIds) } });
    const byId = new Map(senders.map((u) => [u.id, u]));
    return rows
      .filter((r) => byId.has(r.fromUserId))
      .map((r) => ({
        id: r.id,
        from: toPublic(byId.get(r.fromUserId)!),
        articleId: r.articleId,
        title: r.title ?? undefined,
        image: r.image ?? undefined,
        note: r.note ?? undefined,
        read: r.read,
        createdAt: r.createdAt.toISOString(),
      }));
  }

  /** One summary per person the user has exchanged pages with (most recent first). */
  async threads(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.messages().find({
      where: [{ fromUserId: userId }, { toUserId: userId }],
      order: { createdAt: "DESC" },
    });
    if (!rows.length) {
      return [];
    }
    // First row per "other user" (DESC order) is the last exchanged page.
    const byOther = new Map<string, ConversationSummary & { otherId: string }>();
    for (const row of rows) {
      const mine = row.fromUserId === userId;
      const otherId = mine ? row.toUserId : row.fromUserId;
      let summary = byOther.get(otherId);
      if (!summary) {
        summary = {
          otherId,
          // user filled in below once hydrated
          user: { id: otherId, username: "", displayName: "", isPrivate: false },
          lastArticleId: row.articleId,
          lastTitle: row.title ?? undefined,
          lastNote: row.note ?? undefined,
          lastAt: row.createdAt.toISOString(),
          mine,
          unread: 0,
        };
        byOther.set(otherId, summary);
      }
      if (!mine && !row.read) {
        summary.unread += 1;
      }
    }
    const users = await this.users().find({ where: { id: In([...byOther.keys()]) } });
    const userById = new Map(users.map((u) => [u.id, u]));
    return [...byOther.values()]
      .filter((s) => userById.has(s.otherId))
      .map(({ otherId, ...s }) => ({ ...s, user: toPublic(userById.get(otherId)!) }));
  }

  /** Full thread with one user (both directions, oldest first). Marks the pages
   *  received from them as read. */
  async thread(userId: string, username: string): Promise<ConversationMessage[]> {
    const other = await this.users().findOne({
      where: { username: (username ?? "").trim().toLowerCase() },
    });
    if (!other) {
      throw new NotFoundException("Account not found.");
    }
    const repo = this.messages();
    const rows = await repo.find({
      where: [
        { fromUserId: userId, toUserId: other.id },
        { fromUserId: other.id, toUserId: userId },
      ],
      order: { createdAt: "ASC" },
    });
    await repo.update({ toUserId: userId, fromUserId: other.id, read: false }, { read: true });
    return rows.map((r) => ({
      id: r.id,
      mine: r.fromUserId === userId,
      articleId: r.articleId,
      title: r.title ?? undefined,
      image: r.image ?? undefined,
      note: r.note ?? undefined,
      read: r.read,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** The accounts the user sends pages to most (ranked by sent count). Empty when
   *  the user hasn't sent any — no placeholder contacts. */
  async topContacts(userId: string, limit = 5): Promise<PublicUser[]> {
    const rows = await this.messages().find({ where: { fromUserId: userId } });
    if (!rows.length) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.toUserId, (counts.get(r.toUserId) ?? 0) + 1);
    }
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
    const users = await this.users().find({ where: { id: In(top) } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return top
      .map((id) => byId.get(id))
      .filter((u): u is User => Boolean(u))
      .map(toPublic);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.messages().count({ where: { toUserId: userId, read: false } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.messages().update({ id, toUserId: userId }, { read: true });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.messages().delete({ id, toUserId: userId });
  }
}
