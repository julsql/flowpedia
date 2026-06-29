import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { In, Not, type Repository } from "typeorm";
import type {
  NotificationItem,
  NotificationType,
  PublicUser,
  RegisterPushTokenRequest,
} from "@flowpedia/shared";
import { DatabaseService } from "../database/database.service";
import { User } from "../auth/user.entity";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { Notification } from "./notification.entity";
import { PushService } from "./push.service";
import { pushCopy } from "./notif-copy";

interface NotifyInput {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  articleId?: string | null;
  title?: string | null;
}

function toPublic(u: User): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, isPrivate: u.isPrivate };
}

/** In-app notifications: creation (called by social/messages services), listing,
 *  read-state, and Expo push-token registration. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly push: PushService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private repo(): Repository<Notification> {
    const repo = this.db.repo(Notification);
    if (!repo) {
      throw new ServiceUnavailableException("Notifications require a database (DATABASE_URL).");
    }
    return repo;
  }

  /** Fire a push + live event, and (by default) persist an in-app notification.
   *  `persist:false` skips the bell entry — used for messages, which live in their
   *  own inbox. `event` is the realtime channel ("notification" vs "message").
   *  Never notifies a user about their own action. */
  async notify(
    input: NotifyInput,
    opts?: { persist?: boolean; event?: string },
  ): Promise<void> {
    if (input.recipientId === input.actorId) {
      return;
    }
    if (opts?.persist !== false) {
      const repo = this.db.repo(Notification);
      if (repo) {
        await repo.insert({
          recipientId: input.recipientId,
          actorId: input.actorId,
          type: input.type,
          articleId: input.articleId ?? null,
          title: input.title ?? null,
        });
      }
    }
    const userRepo = this.db.repo(User);
    const actor = userRepo ? await userRepo.findOne({ where: { id: input.actorId } }) : null;
    const name = actor?.displayName || actor?.username || "Someone";
    // One localized push per device (each token carries its own locale).
    const tokens = await this.push.tokensForUser(input.recipientId);
    if (tokens.length) {
      const data = { type: input.type, articleId: input.articleId ?? undefined };
      await this.push.send(
        tokens.map((tok) => {
          const copy = pushCopy(tok.locale, input.type, name, input.title);
          return { to: tok.token, title: copy.title, body: copy.body, data, sound: "default" as const };
        }),
      );
    }
    // Live in-app event (badge bump, toast, open-thread refresh).
    this.realtime.emitToUser(input.recipientId, opts?.event ?? "notification", {
      type: input.type,
      actor: actor ? { username: actor.username, displayName: actor.displayName } : null,
      articleId: input.articleId ?? undefined,
      title: input.title ?? undefined,
    });
  }

  async list(userId: string): Promise<NotificationItem[]> {
    // Messages (page_received) live in their own inbox, never in the bell.
    const rows = await this.repo().find({
      where: { recipientId: userId, type: Not("page_received") },
      order: { createdAt: "DESC" },
      take: 100,
    });
    if (!rows.length) {
      return [];
    }
    const userRepo = this.db.repo(User);
    const actorIds = [...new Set(rows.map((r) => r.actorId))];
    const actors = userRepo ? await userRepo.find({ where: { id: In(actorIds) } }) : [];
    const byId = new Map(actors.map((u) => [u.id, u]));
    return rows.map((r) => ({
      id: r.id,
      type: r.type as NotificationType,
      actor: byId.has(r.actorId) ? toPublic(byId.get(r.actorId)!) : null,
      articleId: r.articleId ?? undefined,
      title: r.title ?? undefined,
      read: r.read,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo().count({
      where: { recipientId: userId, read: false, type: Not("page_received") },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo().update(
      { recipientId: userId, read: false, type: Not("page_received") },
      { read: true },
    );
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.repo().update({ id, recipientId: userId }, { read: true });
  }

  async registerToken(userId: string, body: RegisterPushTokenRequest): Promise<void> {
    await this.push.register(userId, body?.token, body?.platform, body?.locale);
  }
}
