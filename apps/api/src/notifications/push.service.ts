import { Injectable, Logger } from "@nestjs/common";
import type { Repository } from "typeorm";
import { DatabaseService } from "../database/database.service";
import { PushToken } from "./push-token.entity";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

/** One Expo push message (already localized for its target device). */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: "default";
}

/** Delivers native push notifications via Expo's push service. Best-effort: any
 *  missing token / network error is logged and swallowed (never blocks the
 *  triggering action). Localization is the caller's concern (per-token locale). */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly db: DatabaseService) {}

  private tokens(): Repository<PushToken> | undefined {
    return this.db.repo(PushToken);
  }

  /** Register (or reassign) a device token to an account. Idempotent. */
  async register(
    userId: string,
    token: string,
    platform?: string,
    locale?: string,
  ): Promise<void> {
    const repo = this.tokens();
    if (!repo || !token) {
      return;
    }
    await repo.upsert(
      { userId, token, platform: platform ?? null, locale: locale ?? null },
      ["token"],
    );
  }

  async unregister(token: string): Promise<void> {
    const repo = this.tokens();
    if (!repo || !token) {
      return;
    }
    await repo.delete({ token });
  }

  /** Every device token of a user (each carries its own locale). */
  async tokensForUser(userId: string): Promise<PushToken[]> {
    const repo = this.tokens();
    if (!repo) {
      return [];
    }
    try {
      return await repo.find({ where: { userId } });
    } catch (err) {
      this.logger.warn(`push: token lookup failed (${String(err)})`);
      return [];
    }
  }

  /** Send a batch of (already localized) messages. Never throws. */
  async send(messages: ExpoPushMessage[]): Promise<void> {
    if (!messages.length) {
      return;
    }
    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.warn(`push: Expo responded ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`push: send failed (${String(err)})`);
    }
  }
}
