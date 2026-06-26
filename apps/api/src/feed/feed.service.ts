import { Injectable } from "@nestjs/common";
import type { Article, FeedResponse, FeedTab } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";
import { SEED_TITLES_BY_LANG } from "./seed-titles";

const PAGE_SIZE = 5;

@Injectable()
export class FeedService {
  constructor(private readonly wikipedia: WikipediaService) {}

  /**
   * MVP: every source returns the paginated seed list for the given language.
   * `tab` is already threaded through to prepare the algorithm hook
   * (forYou = personalized, popular/news = fallback).
   */
  async getFeed(_tab: FeedTab, lang?: string, cursor?: string): Promise<FeedResponse> {
    const language = this.wikipedia.normalizeLang(lang);
    const titles = SEED_TITLES_BY_LANG[language];
    const offset = cursor ? Number(cursor) : 0;
    const slice = titles.slice(offset, offset + PAGE_SIZE);

    const settled = await Promise.allSettled(
      slice.map((title) => this.wikipedia.getSummary(title, language)),
    );
    const items: Article[] = settled
      .filter((r): r is PromiseFulfilledResult<Article> => r.status === "fulfilled")
      .map((r) => r.value);

    const nextOffset = offset + PAGE_SIZE;
    const nextCursor = nextOffset < titles.length ? String(nextOffset) : undefined;

    return { items, nextCursor };
  }
}
