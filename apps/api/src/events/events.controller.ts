import { Body, Controller, Post } from "@nestjs/common";
import type { IngestEventsRequest } from "@flowpedia/shared";
import { EventsService } from "./events.service";

/**
 * Ingests user signals (dwell, scrollDepth, link clicks, like/share/save…)
 * for the recommendation algorithm. Persisted to Postgres when available.
 */
@Controller("events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  async ingest(@Body() body: IngestEventsRequest): Promise<{ accepted: number }> {
    const accepted = await this.events.ingest(body?.events ?? []);
    return { accepted };
  }
}
