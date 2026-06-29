import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { In, type Repository } from "typeorm";
import type { PublicUser, SendPageRequest, SentPageItem } from "@flowpedia/shared";
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
    await this.notifications.notify({
      recipientId: recipient.id,
      actorId: fromUserId,
      type: "page_received",
      articleId: body.articleId,
      title: body.title ?? null,
    });
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
