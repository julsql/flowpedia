import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource, type EntityTarget, type ObjectLiteral, type Repository } from "typeorm";
import { Interaction } from "../events/interaction.entity";
import { User } from "../auth/user.entity";
import { LibraryItem } from "../library/library-item.entity";
import { Follow } from "../social/follow.entity";

// Every persisted entity is registered here so a single connection (and a single
// `synchronize`) owns the schema. Add new entities to this list.
const ENTITIES = [Interaction, User, LibraryItem, Follow];

/**
 * One shared Postgres connection for the whole API. Mirrors the project's
 * graceful-degradation rule: when `DATABASE_URL` is unset or unreachable, the
 * data source stays undefined and `repo()` returns undefined — callers then fall
 * back to logging (analytics) or surface a clear "needs a database" error
 * (accounts). `synchronize: true` is the MVP; migrations come later.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private dataSource?: DataSource;

  constructor(private readonly config: ConfigService) {}

  get isReady(): boolean {
    return !!this.dataSource?.isInitialized;
  }

  /** Repository for an entity, or undefined when no database is connected. */
  repo<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> | undefined {
    return this.dataSource?.getRepository(entity);
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>("DATABASE_URL");
    if (!url) {
      this.logger.log("No DATABASE_URL set — persistence disabled (logging fallback).");
      return;
    }
    try {
      this.dataSource = new DataSource({
        type: "postgres",
        url,
        entities: ENTITIES,
        synchronize: true,
      });
      await this.dataSource.initialize();
      this.logger.log("Connected to Postgres.");
    } catch (err) {
      this.logger.warn(`Postgres unavailable — persistence disabled (${String(err)})`);
      this.dataSource = undefined;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.dataSource?.destroy();
  }
}
