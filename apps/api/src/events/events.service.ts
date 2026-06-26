import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource, type Repository } from "typeorm";
import type { InteractionEvent } from "@flowpedia/shared";
import { Interaction } from "./interaction.entity";

/**
 * Persists user signals to Postgres when a database is reachable, and falls
 * back to logging otherwise — so the API keeps running without infra (dev/demo).
 */
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private dataSource?: DataSource;
  private repo?: Repository<Interaction>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>("DATABASE_URL");
    if (!url) {
      this.logger.log("No DATABASE_URL set — events will be logged only.");
      return;
    }
    try {
      this.dataSource = new DataSource({
        type: "postgres",
        url,
        entities: [Interaction],
        synchronize: true, // MVP: auto-create the table. Use migrations later.
      });
      await this.dataSource.initialize();
      this.repo = this.dataSource.getRepository(Interaction);
      this.logger.log("Connected to Postgres — events will be persisted.");
    } catch (err) {
      this.logger.warn(`Postgres unavailable — events logged only (${String(err)})`);
      this.dataSource = undefined;
      this.repo = undefined;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.dataSource?.destroy();
  }

  async ingest(events: InteractionEvent[]): Promise<number> {
    if (this.repo) {
      try {
        await this.repo.insert(
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
