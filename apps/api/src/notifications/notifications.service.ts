import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { In, type Repository } from "typeorm";
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
import { PushService, type PushMessage } from "./push.service";

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

/** Builds the native-push copy for a notification. English (the canonical
 *  locale): the in-app center is the localized source of truth; push text can't
 *  be localized server-side without the recipient's locale. */
function pushCopy(type: NotificationType, name: string, title?: string | null): PushMessage {
  switch (type) {
    case "follow_request":
      return { title: "New follow request", body: `${name} requested to follow you` };
    case "follow_accepted":
      return { title: "Request accepted", body: `${name} accepted your follow request` };
    case "follower":
      return { title: "New follower", body: `${name} started following you` };
    case "page_received":
      return {
        title: "A page for you",
        body: title ? `${name} sent you "${title}"` : `${name} sent you a page`,
      };
  }
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

  /** Persist a notification and fire a push. Best-effort: silently skips when no
   *  database is connected, and never notifies a user about their own action. */
  async notify(input: NotifyInput): Promise<void> {
    const repo = this.db.repo(Notification);
    if (!repo || input.recipientId === input.actorId) {
      return;
    }
    await repo.insert({
      recipientId: input.recipientId,
      actorId: input.actorId,
      type: input.type,
      articleId: input.articleId ?? null,
      title: input.title ?? null,
    });
    const userRepo = this.db.repo(User);
    const actor = userRepo ? await userRepo.findOne({ where: { id: input.actorId } }) : null;
    const name = actor?.displayName || actor?.username || "Someone";
    const copy = pushCopy(input.type, name, input.title);
    await this.push.sendToUser(input.recipientId, {
      ...copy,
      data: { type: input.type, articleId: input.articleId ?? undefined },
    });
    // Live in-app event (badge bump, toast, open-thread refresh).
    this.realtime.emitToUser(input.recipientId, "notification", {
      type: input.type,
      actor: actor ? { username: actor.username, displayName: actor.displayName } : null,
      articleId: input.articleId ?? undefined,
      title: input.title ?? undefined,
    });
  }

  async list(userId: string): Promise<NotificationItem[]> {
    const rows = await this.repo().find({
      where: { recipientId: userId },
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
    return this.repo().count({ where: { recipientId: userId, read: false } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo().update({ recipientId: userId, read: false }, { read: true });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.repo().update({ id, recipientId: userId }, { read: true });
  }

  async registerToken(userId: string, body: RegisterPushTokenRequest): Promise<void> {
    await this.push.register(userId, body?.token, body?.platform);
  }
}
