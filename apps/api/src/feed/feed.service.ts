import { Injectable } from "@nestjs/common";
import type { Article, FeedResponse, FeedTab } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";
import { ProfileService } from "../reco/profile.service";
import { SeenService } from "../reco/seen.service";
import { SocialService } from "../reco/social.service";
import { BlockService } from "../reco/block.service";
import { LIKE_WEIGHT, SAVE_WEIGHT } from "./weights";

const PAGE_SIZE = 5;

// Social injection (§2.6): at most one "followed accounts liked this" item per
// page, and never the first slot — common ground, kept marginal.
const SOCIAL_POOL = 20;
const SOCIAL_PERIOD = PAGE_SIZE; // one per page
const SOCIAL_OFFSET = 2; // 3rd slot of each page (never the first)

// Exploration (§2.7): a deliberate off-profile item (current events) woven in at
// a controlled rate to break the rabbit hole — distinct slot from the social one.
const EXPLORE_PERIOD = 6; // ≈ one off-profile item every 6 slots (~17%)
const EXPLORE_OFFSET = 4;

// How often a "different subject" item is injected into a feed (every Nth slot),
// so the user always has an escape door out of a rabbit hole.
const FORYOU_DIVERSITY_PERIOD = 4;
const DISCOVER_DIVERSITY_PERIOD = 3;
const NEWS_INTEREST_PERIOD = 3;

// How many journal-derived seeds feed the personalized "more like this" recall.
const PROFILE_SEED_LIMIT = 6;

@Injectable()
export class FeedService {
  constructor(
    private readonly wikipedia: WikipediaService,
    private readonly profile: ProfileService,
    private readonly seen: SeenService,
    private readonly social: SocialService,
    private readonly block: BlockService,
  ) {}

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
   *
   * `userId` enables server-authoritative de-dup (already-seen titles are
   * excluded cross-device). `personalize` additionally lets the journal-derived
   * taste profile enrich the "more like this" recall — the home tabs opt in,
   * while a page-anchored "keep exploring" (explicit page seeds) does NOT, so it
   * stays tied to the current page rather than the user's global taste.
   */
  async getFeed(
    tab: FeedTab,
    lang?: string,
    cursor?: string,
    seeds: string[] = [],
    seed = 0,
    exclude: string[] = [],
    savedSeeds: string[] = [],
    userId?: string,
    personalize = false,
  ): Promise<FeedResponse> {
    // Social + exploration are only for the profile-driven tabs, and never for a
    // page-anchored "keep exploring".
    const wantsInjection = personalize && (tab === "forYou" || tab === "discover");
    const [built, serverSeen, socialTitles, exploreTitles, blockedTopics] = await Promise.all([
      this.buildPool(tab, lang, seeds, seed, savedSeeds, userId, personalize),
      this.seen.getSeen(userId),
      // A little "common ground" from followed accounts.
      wantsInjection ? this.social.getFollowedTitles(userId, SOCIAL_POOL) : Promise.resolve<string[]>([]),
      // Deliberate off-profile current events, to escape the rabbit hole.
      wantsInjection ? this.wikipedia.getNewsTitles(lang) : Promise.resolve<string[]>([]),
      // Topics the user said "not interested" in — hard-filtered below (§2.9).
      this.block.getBlocked(userId),
    ]);
    // Weave in social picks then exploration, each at its own strict cadence.
    let pool = built;
    if (socialTitles.length) {
      pool = weaveEvery(pool, socialTitles, SOCIAL_PERIOD, SOCIAL_OFFSET);
    }
    if (exploreTitles.length) {
      pool = weaveEvery(pool, exploreTitles, EXPLORE_PERIOD, EXPLORE_OFFSET);
    }
    // Drop articles the user has already been shown recently (client snapshot +
    // server-authoritative seen), so the flow keeps moving forward.
    const excluded = new Set([...exclude, ...serverSeen]);
    const ordered = excluded.size ? pool.filter((title) => !excluded.has(title)) : pool;
    const offset = cursor ? Number(cursor) : 0;

    const slice =
      offset < ordered.length
        ? ordered.slice(offset, offset + PAGE_SIZE)
        : (await this.wikipedia.getRandomTitles(lang, PAGE_SIZE)).filter((t) => !excluded.has(t));

    const settled = await Promise.allSettled(
      slice.map((title) => this.wikipedia.getSummary(title, lang)),
    );
    let items: Article[] = settled
      .filter((r): r is PromiseFulfilledResult<Article> => r.status === "fulfilled")
      .map((r) => r.value);

    // Hard-filter "not interested" genres (§2.9): drop anything whose category or
    // a topic the user blocked. Titles carry no category, so this is applied once
    // hydrated; the (already muted) client seeds keep such items rare upstream.
    if (blockedTopics.size) {
      items = items.filter(
        (a) => !blockedTopics.has(a.category) && !(a.topics ?? []).some((t) => blockedTopics.has(t)),
      );
    }

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
    savedSeeds: string[] = [],
    userId?: string,
    personalize = false,
  ): Promise<string[]> {
    if (tab === "forYou") {
      const [related, popular] = await Promise.all([
        this.weightedRelated(seeds, savedSeeds, lang, userId, personalize),
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
        this.weightedRelated(seeds, savedSeeds, lang, userId, personalize),
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
        this.weightedRelated(seeds, savedSeeds, lang, userId, personalize),
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

  /**
   * Related pool weighted toward the stronger signal: liked pages drive most of
   * the "more like this" titles, bookmarked pages contribute a smaller share
   * (LIKE_WEIGHT : SAVE_WEIGHT). `morelike` can't weight seeds within one query,
   * so we fetch each group's related titles separately and cap the weaker group.
   */
  private async weightedRelated(
    likedSeeds: string[],
    savedSeeds: string[],
    lang: string | undefined,
    userId?: string,
    personalize = false,
  ): Promise<string[]> {
    // On the personalized home feed, drive "more like this" from the journal-
    // derived taste (likes/saves/shares/stories/dwell/read, recency-decayed and
    // revocation-aware) rather than just the client's liked ids. A page-anchored
    // feed keeps `personalize` false, so its explicit seeds stay the anchor.
    let strongSeeds = likedSeeds;
    if (personalize && userId) {
      const profileSeeds = await this.profile.getWeightedSeeds(userId, PROFILE_SEED_LIMIT);
      if (profileSeeds.length) {
        strongSeeds = [...new Set([...profileSeeds, ...likedSeeds])];
      }
    }

    const [likedRelated, savedRelated] = await Promise.all([
      this.wikipedia.getRelatedTitles(strongSeeds, lang),
      savedSeeds.length
        ? this.wikipedia.getRelatedTitles(savedSeeds, lang)
        : Promise.resolve<string[]>([]),
    ]);
    return capRelatedByWeight(likedRelated, savedRelated, LIKE_WEIGHT, SAVE_WEIGHT);
  }
}

/**
 * Merge liked-related and saved-related titles so the pool is dominated by the
 * liked side in the ratio likeWeight : saveWeight. Keeps all liked-related and
 * caps saved-related to its proportional share, then dedupes (liked wins ties).
 */
export function capRelatedByWeight(
  likedRelated: string[],
  savedRelated: string[],
  likeWeight: number,
  saveWeight: number,
): string[] {
  if (!likedRelated.length) {
    return [...new Set(savedRelated)];
  }
  if (!savedRelated.length) {
    return [...new Set(likedRelated)];
  }
  const cap = Math.max(1, Math.floor(likedRelated.length * (saveWeight / likeWeight)));
  return [...new Set([...likedRelated, ...savedRelated.slice(0, cap)])];
}

/**
 * Insert extra titles into the pool at one fixed slot per `period` window (at
 * `offset` within it, so never the first slot of a page). New titles only —
 * anything already in the pool is skipped so an insert can't duplicate. Kept
 * marginal by construction: at most one per window. Used for both the social
 * dose (§2.6) and the exploration dose (§2.7), at their own cadences.
 */
export function weaveEvery(
  pool: string[],
  extra: string[],
  period: number,
  offset: number,
): string[] {
  const inPool = new Set(pool);
  const fresh = extra.filter((t) => !inPool.has(t));
  if (!fresh.length) {
    return pool;
  }
  const out: string[] = [];
  let si = 0;
  for (let i = 0; i < pool.length; i += 1) {
    if (i % period === offset && si < fresh.length) {
      out.push(fresh[si]);
      si += 1;
    }
    out.push(pool[i]);
  }
  // Any leftover social picks (short pool) go at the end rather than being lost.
  for (; si < fresh.length; si += 1) {
    out.push(fresh[si]);
  }
  return out;
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
