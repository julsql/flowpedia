import { Controller, Get, Query } from "@nestjs/common";
import type { Article } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";

@Controller("search")
export class SearchController {
  constructor(private readonly wikipedia: WikipediaService) {}

  /** Full-text search for the Explore screen. */
  @Get()
  search(@Query("q") q?: string, @Query("lang") lang?: string): Promise<Article[]> {
    return this.wikipedia.search(q ?? "", lang);
  }
}
