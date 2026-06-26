import { Injectable } from "@nestjs/common";
import type { Article, FeedResponse, FeedTab } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";

const PAGE_SIZE = 5;

// How often a "different subject" item is injected into a feed (every Nth slot),
// so the user always has an escape door out of a rabbit hole.
const FORYOU_DIVERSITY_PERIOD = 4;
const DISCOVER_DIVERSITY_PERIOD = 3;
const NEWS_INTEREST_PERIOD = 3;

@Injectable()
export class FeedService {
  constructor(private readonly wikipedia: WikipediaService) {}

  /**
   * Infinite, always-varied feed. Each tab builds its own ordered candidate
   * pool (already seeded so reloads bring new content) with regular "different
   * subject" injections, so the user is never trapped in a single topic. Once
   * the pool is exhausted the feed keeps going with random articles, so it
   * never ends and rarely repeats.
   *
   * - forYou: "more like" the user's seeds, with popular woven in for escape
   * - popular: global most-viewed
   * - news: current events + most-read, oriented toward the user's interests
   * - discover (Flow): related-to-you blended with popular
   */
  async getFeed(
    tab: FeedTab,
    lang?: string,
    cursor?: string,
    seeds: string[] = [],
    seed = 0,
    exclude: string[] = [],
  ): Promise<FeedResponse> {
    const built = await this.buildPool(tab, lang, seeds, seed);
    // Drop articles the user has already been shown recently, so the flow keeps
    // moving forward instead of re-serving the same pages.
    const excluded = new Set(exclude);
    const ordered = excluded.size ? built.filter((title) => !excluded.has(title)) : built;
    const offset = cursor ? Number(cursor) : 0;

    const slice =
      offset < ordered.length
        ? ordered.slice(offset, offset + PAGE_SIZE)
        : (await this.wikipedia.getRandomTitles(lang, PAGE_SIZE)).filter((t) => !excluded.has(t));

    const settled = await Promise.allSettled(
      slice.map((title) => this.wikipedia.getSummary(title, lang)),
    );
    const items: Article[] = settled
      .filter((r): r is PromiseFulfilledResult<Article> => r.status === "fulfilled")
      .map((r) => r.value);

    // Always return a cursor → the feed is infinite (random fallback beyond the pool).
    return { items, nextCursor: String(offset + PAGE_SIZE) };
  }

  /**
   * Build the ordered, deterministic pool for a tab. `seed` makes each session's
   * order different while keeping pagination stable across cursor calls.
   */
  private async buildPool(
    tab: FeedTab,
    lang: string | undefined,
    seeds: string[],
    seed: number,
  ): Promise<string[]> {
    if (tab === "forYou") {
      const [related, popular] = await Promise.all([
        this.wikipedia.getRelatedTitles(seeds, lang),
        this.wikipedia.getPopularTitles(lang),
      ]);
      if (!related.length) {
        return shuffleSeeded(popular, seed);
      }
      // Mostly interest-driven, with popular woven in as the escape door.
      return blendDiverse(
        shuffleSeeded(related, seed),
        shuffleSeeded(popular, seed),
        FORYOU_DIVERSITY_PERIOD,
      );
    }

    if (tab === "news") {
      const [news, related] = await Promise.all([
        this.wikipedia.getNewsTitles(lang),
        this.wikipedia.getRelatedTitles(seeds, lang),
      ]);
      if (!news.length) {
        return shuffleSeeded(related.length ? related : await this.wikipedia.getPopularTitles(lang), seed);
      }
      if (!related.length) {
        return shuffleSeeded(news, seed);
      }
      // Current events oriented toward the user's interests: interest-related
      // articles are injected into the live news stream at a regular cadence.
      return blendDiverse(
        shuffleSeeded(news, seed),
        shuffleSeeded(related, seed),
        NEWS_INTEREST_PERIOD,
      );
    }

    if (tab === "discover") {
      const [related, popular] = await Promise.all([
        this.wikipedia.getRelatedTitles(seeds, lang),
        this.wikipedia.getPopularTitles(lang),
      ]);
      if (!related.length) {
        return shuffleSeeded(popular, seed);
      }
      return blendDiverse(
        shuffleSeeded(related, seed),
        shuffleSeeded(popular, seed),
        DISCOVER_DIVERSITY_PERIOD,
      );
    }

    return shuffleSeeded(await this.wikipedia.getPopularTitles(lang), seed);
  }
}

/**
 * Interleave a primary list with a secondary one, placing a secondary item at
 * every `period`-th slot. Used to inject "different subject" articles so a feed
 * never stays locked on one topic. Deduplicates across both lists.
 */
function blendDiverse(primary: string[], secondary: string[], period: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (title: string | undefined) => {
    if (title && !seen.has(title)) {
      seen.add(title);
      out.push(title);
    }
  };

  let pi = 0;
  let si = 0;
  let slot = 0;
  while (pi < primary.length || si < secondary.length) {
    const wantSecondary = secondary.length > 0 && (slot + 1) % period === 0 && si < secondary.length;
    if (wantSecondary) {
      push(secondary[si]);
      si += 1;
    } else if (pi < primary.length) {
      push(primary[pi]);
      pi += 1;
    } else if (si < secondary.length) {
      push(secondary[si]);
      si += 1;
    } else {
      break;
    }
    slot += 1;
  }
  return out;
}

/** Deterministic shuffle so pagination is stable for a given seed. */
function shuffleSeeded(input: string[], seed: number): string[] {
  if (!seed) {
    return [...input];
  }
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
