import { Body, Controller, Logger, Post } from "@nestjs/common";
import type { IngestEventsRequest } from "@flowpedia/shared";

/**
 * Ingests user signals (dwell, scrollDepth, link clicks, like/share/save…).
 * MVP: log only. Next step: persist to Postgres (interactions table)
 * to feed the content-based recommendation.
 */
@Controller("events")
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  @Post()
  ingest(@Body() body: IngestEventsRequest): { accepted: number } {
    const events = body?.events ?? [];
    for (const e of events) {
      this.logger.debug(`signal ${e.type} article=${e.articleId} value=${e.value ?? "-"}`);
    }
    return { accepted: events.length };
  }
}
