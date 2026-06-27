import { Controller, Get, Query } from "@nestjs/common";
import type { FeedResponse } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";

@Controller("search")
export class SearchController {
  constructor(private readonly wikipedia: WikipediaService) {}

  /** Broad-theme search for the Explore screen (paginated, continuous scroll). */
  @Get()
  search(
    @Query("q") q?: string,
    @Query("lang") lang?: string,
    @Query("cursor") cursor?: string,
    @Query("exact") exact?: string,
  ): Promise<FeedResponse> {
    return this.wikipedia.search(q ?? "", lang, cursor, exact === "1" || exact === "true");
  }
}
