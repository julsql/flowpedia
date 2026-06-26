import { Injectable } from "@nestjs/common";
import type { Article, FeedResponse, FeedTab } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";

const PAGE_SIZE = 5;

@Injectable()
export class FeedService {
  constructor(private readonly wikipedia: WikipediaService) {}

  /**
   * Picks the title source by tab, then paginates and resolves summaries:
   * - forYou: related to the user's seeds (liked/saved); falls back to popular
   * - news: current-events featured feed; falls back to popular
   * - popular: most-viewed articles
   */
  async getFeed(
    tab: FeedTab,
    lang?: string,
    cursor?: string,
    seeds: string[] = [],
  ): Promise<FeedResponse> {
    const titles = await this.resolveTitles(tab, lang, seeds);
    const offset = cursor ? Number(cursor) : 0;
    const slice = titles.slice(offset, offset + PAGE_SIZE);

    const settled = await Promise.allSettled(
      slice.map((title) => this.wikipedia.getSummary(title, lang)),
    );
    const items: Article[] = settled
      .filter((r): r is PromiseFulfilledResult<Article> => r.status === "fulfilled")
      .map((r) => r.value);

    const nextOffset = offset + PAGE_SIZE;
    const nextCursor = nextOffset < titles.length ? String(nextOffset) : undefined;

    return { items, nextCursor };
  }

  private async resolveTitles(tab: FeedTab, lang?: string, seeds: string[] = []): Promise<string[]> {
    if (tab === "forYou") {
      const related = await this.wikipedia.getRelatedTitles(seeds, lang);
      return related.length ? related : this.wikipedia.getPopularTitles(lang);
    }
    if (tab === "news") {
      const news = await this.wikipedia.getNewsTitles(lang);
      return news.length ? news : this.wikipedia.getPopularTitles(lang);
    }
    return this.wikipedia.getPopularTitles(lang);
  }
}
