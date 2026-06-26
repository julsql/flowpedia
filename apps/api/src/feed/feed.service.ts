import { Injectable } from "@nestjs/common";
import type { Article, FeedResponse, FeedTab } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";

const PAGE_SIZE = 5;

@Injectable()
export class FeedService {
  constructor(private readonly wikipedia: WikipediaService) {}

  /**
   * Infinite, always-varied feed. Each tab resolves its own candidate pool,
   * which is shuffled per session (`seed`) so reloads bring new content. Once
   * the pool is exhausted the feed keeps going with random articles, so it
   * never ends and rarely repeats.
   *
   * - forYou: "more like" the user's seeds (interests); falls back to popular
   * - popular: global most-viewed
   * - news: current events + most-read of the day; falls back to popular
   * - discover (Flow): related-to-you blended with popular
   */
  async getFeed(
    tab: FeedTab,
    lang?: string,
    cursor?: string,
    seeds: string[] = [],
    seed = 0,
  ): Promise<FeedResponse> {
    const pool = await this.resolvePool(tab, lang, seeds);
    const ordered = seed ? shuffleSeeded(pool, seed) : pool;
    const offset = cursor ? Number(cursor) : 0;

    const slice =
      offset < ordered.length
        ? ordered.slice(offset, offset + PAGE_SIZE)
        : await this.wikipedia.getRandomTitles(lang, PAGE_SIZE);

    const settled = await Promise.allSettled(
      slice.map((title) => this.wikipedia.getSummary(title, lang)),
    );
    const items: Article[] = settled
      .filter((r): r is PromiseFulfilledResult<Article> => r.status === "fulfilled")
      .map((r) => r.value);

    // Always return a cursor → the feed is infinite (random fallback beyond the pool).
    return { items, nextCursor: String(offset + PAGE_SIZE) };
  }

  private async resolvePool(tab: FeedTab, lang?: string, seeds: string[] = []): Promise<string[]> {
    if (tab === "forYou") {
      const related = await this.wikipedia.getRelatedTitles(seeds, lang);
      return related.length ? related : this.wikipedia.getPopularTitles(lang);
    }
    if (tab === "news") {
      const news = await this.wikipedia.getNewsTitles(lang);
      return news.length ? news : this.wikipedia.getPopularTitles(lang);
    }
    if (tab === "discover") {
      return this.wikipedia.getDiscoverTitles(lang, seeds);
    }
    return this.wikipedia.getPopularTitles(lang);
  }
}

/** Deterministic shuffle so pagination is stable for a given seed. */
function shuffleSeeded(input: string[], seed: number): string[] {
  const rng = mulberry32(seed);
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
