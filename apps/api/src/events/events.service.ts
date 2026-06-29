import { Injectable, Logger } from "@nestjs/common";
import type { InteractionEvent } from "@flowpedia/shared";
import { DatabaseService } from "../database/database.service";
import { Interaction } from "./interaction.entity";

/**
 * Persists user signals to Postgres when a database is reachable, and falls
 * back to logging otherwise — so the API keeps running without infra (dev/demo).
 * The connection is owned by DatabaseService (shared across the API).
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly db: DatabaseService) {}

  async ingest(events: InteractionEvent[]): Promise<number> {
    const repo = this.db.repo(Interaction);
    if (repo) {
      try {
        await repo.insert(
          events.map((e) => ({
            userId: e.userId ?? null,
            articleId: e.articleId,
            type: e.type,
            value: e.value ?? null,
            ts: String(e.ts),
          })),
        );
      } catch (err) {
        this.logger.warn(`Failed to persist events: ${String(err)}`);
      }
    } else {
      for (const e of events) {
        this.logger.debug(`signal ${e.type} article=${e.articleId} value=${e.value ?? "-"}`);
      }
    }
    return events.length;
  }
}
