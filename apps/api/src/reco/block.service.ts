import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { BlockedTopic } from "./blocked-topic.entity";

/**
 * Persists the topics a user blocked ("not interested in this genre" — §2.9), so
 * the choice is cross-device and survives reinstalls. Reversible: un-blocking
 * just deletes the row. Degrades to a no-op without a database.
 */
@Injectable()
export class BlockService {
  private readonly logger = new Logger(BlockService.name);

  constructor(private readonly db: DatabaseService) {}

  async getBlocked(userId: string | undefined): Promise<Set<string>> {
    if (!userId) {
      return new Set();
    }
    const repo = this.db.repo(BlockedTopic);
    if (!repo) {
      return new Set();
    }
    try {
      const rows = await repo.find({ where: { userId } });
      return new Set(rows.map((r) => r.topic));
    } catch (err) {
      this.logger.warn(`blocked load failed for ${userId}: ${String(err)}`);
      return new Set();
    }
  }

  async block(userId: string, topic: string): Promise<void> {
    const repo = this.db.repo(BlockedTopic);
    if (!repo || !userId || !topic) {
      return;
    }
    try {
      // Idempotent: ignore the unique-constraint clash on a repeat block.
      await repo.upsert({ userId, topic }, ["userId", "topic"]);
    } catch (err) {
      this.logger.warn(`block failed for ${userId}/${topic}: ${String(err)}`);
    }
  }

  async unblock(userId: string, topic: string): Promise<void> {
    const repo = this.db.repo(BlockedTopic);
    if (!repo || !userId || !topic) {
      return;
    }
    try {
      await repo.delete({ userId, topic });
    } catch (err) {
      this.logger.warn(`unblock failed for ${userId}/${topic}: ${String(err)}`);
    }
  }
}
