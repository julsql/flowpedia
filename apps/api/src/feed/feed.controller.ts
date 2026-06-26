import { Controller, Get, Query } from "@nestjs/common";
import type { FeedResponse, FeedTab } from "@flowpedia/shared";
import { FeedService } from "./feed.service";

const VALID_TABS: FeedTab[] = ["forYou", "popular", "news"];

@Controller("feed")
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  getFeed(
    @Query("tab") tab?: string,
    @Query("lang") lang?: string,
    @Query("cursor") cursor?: string,
  ): Promise<FeedResponse> {
    const safeTab: FeedTab = VALID_TABS.includes(tab as FeedTab)
      ? (tab as FeedTab)
      : "popular";
    return this.feed.getFeed(safeTab, lang, cursor);
  }
}
