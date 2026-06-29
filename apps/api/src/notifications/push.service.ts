import { Injectable, Logger } from "@nestjs/common";
import type { Repository } from "typeorm";
import { DatabaseService } from "../database/database.service";
import { PushToken } from "./push-token.entity";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  title: string;
  body: string;
  /** Extra payload the app reads when the notification is tapped. */
  data?: Record<string, unknown>;
}

/** Delivers native push notifications via Expo's push service. Best-effort: any
 *  missing token / network error is logged and swallowed (never blocks the
 *  triggering action). */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly db: DatabaseService) {}

  private tokens(): Repository<PushToken> | undefined {
    return this.db.repo(PushToken);
  }

  /** Register (or reassign) a device token to an account. Idempotent. */
  async register(userId: string, token: string, platform?: string): Promise<void> {
    const repo = this.tokens();
    if (!repo || !token) {
      return;
    }
    await repo.upsert({ userId, token, platform: platform ?? null }, ["token"]);
  }

  async unregister(token: string): Promise<void> {
    const repo = this.tokens();
    if (!repo || !token) {
      return;
    }
    await repo.delete({ token });
  }

  /** Fire a push to every device of `userId`. Never throws. */
  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    const repo = this.tokens();
    if (!repo) {
      return;
    }
    let rows: PushToken[];
    try {
      rows = await repo.find({ where: { userId } });
    } catch (err) {
      this.logger.warn(`push: token lookup failed (${String(err)})`);
      return;
    }
    if (!rows.length) {
      return;
    }
    const payload = rows.map((t) => ({
      to: t.token,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      sound: "default",
    }));
    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        this.logger.warn(`push: Expo responded ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`push: send failed (${String(err)})`);
    }
  }
}
