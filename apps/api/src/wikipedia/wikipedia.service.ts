import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Article, ArticleLink, FeedResponse } from "@flowpedia/shared";
import { CacheService } from "../cache/cache.service";
import {
  collectLinks,
  isScaffoldImage,
  parseAncestry,
  parseArticleSections,
  parseCharts,
  parseInfobox,
  parseRelatedLinks,
} from "./parse-article";
import { classifyTopics } from "./topics";

// Keep in sync with the mobile SUPPORTED_LOCALES.
const SUPPORTED_LANGS = [
  "en",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "el",
  "zh",
  "ja",
  "ko",
  "tr",
] as const;
type SupportedLang = (typeof SUPPORTED_LANGS)[number];

// Bump this whenever the parsed Article/summary shape changes, so a deploy
// invalidates stale cached objects instead of serving the old structure for the
// 24h TTL (Redis survives restarts). Last bump: inline figure positions.
const CACHE_SCHEMA_VERSION = "v16";

const POPULAR_TTL_MS = 6 * 60 * 60 * 1000;
const NEWS_TTL_MS = 60 * 60 * 1000;
const RELATED_TTL_MS = 10 * 60 * 1000;
const SEARCH_TTL_MS = 30 * 60 * 1000;
const SEARCH_PAGE_SIZE = 10;
const POPULAR_LIMIT = 150; // large pool so the shuffled feed stays varied
const ARTICLE_LINKS_LIMIT = 40;
const RELATED_SEED_LIMIT = 6;
const CATEGORY_TTL_MS = 60 * 60 * 1000;
const CATEGORY_PICK = 5; // how many of the page's categories to draw from
const CATEGORY_MEMBERS_PER_CAT = 12;

// Categories that are organisational/maintenance rather than topical — poor
// "more from this world" suggestions. Matched on the (de-prefixed) name.
const SKIP_CATEGORY =
  /wikip|wikis|porta|stub|ébauch|ebauch|disambig|homonym|begriffskl|maintenance|article|page|liste|list of|index|modèle|template|catégor|categor|sourc|référenc|referenc/i;

// Localized label for the intro section (no heading in the source HTML).
const SUMMARY_LABEL: Record<SupportedLang, string> = {
  en: "Summary",
  fr: "Résumé",
  es: "Resumen",
  de: "Zusammenfassung",
  it: "Riassunto",
  pt: "Resumo",
  nl: "Samenvatting",
  pl: "Podsumowanie",
  ru: "Сводка",
  el: "Περίληψη",
  zh: "摘要",
  ja: "概要",
  ko: "요약",
  tr: "Özet",
};

/**
 * Proxy + cache in front of the Wikimedia REST API. Caching is delegated to
 * CacheService (Redis-backed, with an in-memory fallback when REDIS_URL is
 * unset/unreachable).
 */
@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  private get defaultLang(): SupportedLang {
    const configured = this.config.get<string>("WIKIPEDIA_LANG", "fr");
    return SUPPORTED_LANGS.includes(configured as SupportedLang)
      ? (configured as SupportedLang)
      : "fr";
  }

  private get userAgent(): string {
    return this.config.get<string>(
      "WIKIPEDIA_USER_AGENT",
      "Flowpedia/0.1 (dev; contact@flowpedia.app)",
    );
  }

  private get ttlMs(): number {
    return Number(this.config.get("ARTICLE_CACHE_TTL", 86400)) * 1000;
  }

  /** Clamp any incoming language to a supported one, falling back to the default. */
  normalizeLang(lang?: string): SupportedLang {
    return SUPPORTED_LANGS.includes(lang as SupportedLang)
      ? (lang as SupportedLang)
      : this.defaultLang;
  }

  /** Hydrate a list of titles into summary cards (skips failures + excluded). */
  async getSummaries(titles: string[], lang?: string): Promise<Article[]> {
    const settled = await Promise.allSettled(
      titles.slice(0, 12).map((title) => this.getSummary(title, lang)),
    );
    return settled
      .filter((r): r is PromiseFulfilledResult<Article> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((a) => !isExcludedTitle(a.title));
  }

  /** Fetch an article summary (page/summary endpoint), cached per language. */
  async getSummary(title: string, lang?: string): Promise<Article> {
    const language = this.normalizeLang(lang);
    const key = `summary:${CACHE_SCHEMA_VERSION}:${language}:${title}`;
    const cached = await this.cache.get<Article>(key);
    if (cached) {
      return cached;
    }

    const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title,
    )}`;
    const res = await fetch(url, {
      headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
    });

    if (res.status === 404) {
      throw new NotFoundException(`Article not found: ${title}`);
    }
    if (!res.ok) {
      this.logger.warn(`Wikipedia ${res.status} for ${title}`);
      throw new NotFoundException(`Wikipedia error (${res.status}) for ${title}`);
    }

    const data = (await res.json()) as WikiSummary;
    const article = this.toArticle(data, language);
    await this.cache.set(key, article, this.ttlMs);
    return article;
  }

  /**
   * Full article for the detail screen: summary metadata (image, category…)
   * plus parsed sections with inline internal links. Cached per language.
   */
  async getArticle(title: string, lang?: string): Promise<Article> {
    const language = this.normalizeLang(lang);
    const key = `article:${CACHE_SCHEMA_VERSION}:${language}:${title}`;
    const cached = await this.cache.get<Article>(key);
    if (cached) {
      return cached;
    }

    const summary = await this.getSummary(title, language);
    const leadTitle = SUMMARY_LABEL[language];

    let sections = summary.sections;
    let infobox = summary.infobox;
    let charts: Article["charts"];
    let ancestry: Article["ancestry"];
    // Links from the page's "Articles connexes"/"See also" (hidden) sections —
    // the basis for "keep exploring".
    let relatedLinks: ArticleLink[] = [];
    try {
      const html = await this.fetchArticleHtml(summary.title, language);
      sections = parseArticleSections(html, leadTitle);
      infobox = parseInfobox(html);
      relatedLinks = parseRelatedLinks(html);
      const parsedCharts = parseCharts(html);
      charts = parsedCharts.length ? parsedCharts : undefined;
      const parsedAncestry = parseAncestry(html);
      ancestry = parsedAncestry.length ? parsedAncestry : undefined;
    } catch (err) {
      this.logger.warn(`article HTML parse failed for ${title}: ${String(err)}`);
    }

    // Fallback so the screen is never empty if HTML/parse fails.
    if (!sections.length && summary.summary) {
      sections = [
        { id: "section-0", title: leadTitle, level: 2, paragraphs: [{ runs: [{ text: summary.summary }] }] },
      ];
    }

    // "Keep exploring" basis: the page's own "Articles connexes" links first,
    // then same-category pages, then inline links as a last resort.
    let links: ArticleLink[] = relatedLinks;
    if (!links.length) {
      links = await this.getRelatedByCategory(summary.title, language).catch(() => []);
    }
    if (!links.length) {
      links = collectLinks(sections).slice(0, ARTICLE_LINKS_LIMIT);
    }

    const article: Article = { ...summary, sections, links, infobox, charts, ancestry };
    await this.cache.set(key, article, this.ttlMs);
    return article;
  }

  private async fetchArticleHtml(title: string, language: SupportedLang): Promise<string> {
    const url = `https://${language}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(
      title,
    )}`;
    // Full-article HTML is large; a slow/dropped fetch must not silently fall
    // back to the bare summary. Time-box each attempt and retry once.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Wikipedia HTML ${res.status} for ${title}`);
        }
        return await res.text();
      } catch (err) {
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`Wikipedia HTML fetch failed for ${title}`);
  }

  /** Raw full-text search → titles + the engine's spelling suggestion, if any. */
  private async rawSearch(
    query: string,
    language: SupportedLang,
    limit: number,
  ): Promise<{ titles: string[]; suggestion?: string }> {
    const url =
      `https://${language}.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&srnamespace=0` +
      `&srinfo=suggestion&format=json&origin=*`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
      });
      if (!res.ok) {
        return { titles: [] };
      }
      const data = (await res.json()) as {
        query?: { search?: { title: string }[]; searchinfo?: { suggestion?: string } };
      };
      const titles = (data.query?.search ?? [])
        .map((s) => s.title)
        .filter((title) => !isExcludedTitle(title));
      return { titles, suggestion: data.query?.searchinfo?.suggestion };
    } catch (err) {
      this.logger.warn(`search failed for "${query}": ${String(err)}`);
      return { titles: [] };
    }
  }

  /**
   * Broad theme pool for Explore: direct matches expanded with "more like" the
   * best match, so a query like "Egyptian alphabet" also surfaces other writing
   * systems, ancient Egypt, history of numbers, etc. Cached per query, alongside
   * the engine's "did you mean" suggestion.
   */
  private async getSearchPool(
    query: string,
    language: SupportedLang,
  ): Promise<{ pool: string[]; suggestion?: string }> {
    const key = `search:${language}:${query.toLowerCase()}`;
    const cached = await this.cache.get<{ pool: string[]; suggestion?: string }>(key);
    if (cached) {
      return cached;
    }
    const { titles: direct, suggestion } = await this.rawSearch(query, language, 20);
    const related = direct.length ? await this.getRelatedTitles([direct[0]], language) : [];
    const pool = [...new Set([...direct, ...related])];
    const result = { pool, suggestion };
    if (pool.length || suggestion) {
      await this.cache.set(key, result, SEARCH_TTL_MS);
    }
    return result;
  }

  /**
   * Paginated theme search for Explore (continuous scroll). Typo-tolerant: with
   * no direct hits it auto-searches the engine's spelling suggestion (reporting
   * the correction so the UI can offer the literal query); when hits exist but a
   * better spelling is suggested, it's returned as a "did you mean".
   * `exact` skips the auto-correction (the user asked for the literal query).
   */
  async search(
    query: string,
    lang?: string,
    cursor?: string,
    exact = false,
  ): Promise<FeedResponse> {
    const language = this.normalizeLang(lang);
    const q = query.trim();
    if (!q) {
      return { items: [] };
    }
    const first = await this.getSearchPool(q, language);
    let pool = first.pool;
    // Wikipedia suggests a spelling when it thinks the query is misspelled. A
    // suggestion that differs only by case/accents is not a real correction
    // (the engine matches those already) — ignore it so we never propose
    // "Atérien" for "atérien".
    const sug =
      first.suggestion && !equalsIgnoringCaseAndDiacritics(first.suggestion, q)
        ? first.suggestion
        : undefined;

    let correctedQuery: string | undefined;
    let suggestion: string | undefined;
    if (!exact && sug) {
      if (pool.length === 0) {
        // No direct hits → auto-search the correction ("Showing results for X").
        const alt = await this.getSearchPool(sug, language);
        if (alt.pool.length) {
          pool = alt.pool;
          correctedQuery = sug;
        }
      } else {
        // Direct hits exist, but a genuinely different spelling was offered →
        // "did you mean" (a suggestion equal to the query was already filtered
        // out above, so we never propose the term the user already typed).
        suggestion = sug;
      }
    }

    const offset = cursor ? Number(cursor) : 0;
    const slice = pool.slice(offset, offset + SEARCH_PAGE_SIZE);
    const settled = await Promise.allSettled(
      slice.map((title) => this.getSummary(title, language)),
    );
    const items = settled
      .filter((r): r is PromiseFulfilledResult<Article> => r.status === "fulfilled")
      .map((r) => r.value);
    const nextOffset = offset + SEARCH_PAGE_SIZE;
    return {
      items,
      nextCursor: nextOffset < pool.length ? String(nextOffset) : undefined,
      ...(correctedQuery ? { correctedQuery, originalQuery: q } : {}),
      ...(suggestion ? { suggestion } : {}),
    };
  }

  /**
   * Most-viewed article titles for a language (Wikimedia pageviews "top" API),
   * cached per language. Language-agnostic source for the "popular" feed.
   */
  async getPopularTitles(lang?: string): Promise<string[]> {
    const language = this.normalizeLang(lang);
    const key = `popular:${language}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) {
      return cached;
    }

    const titles = await this.fetchTopViewed(language);
    if (titles.length) {
      await this.cache.set(key, titles, POPULAR_TTL_MS);
    }
    return titles;
  }

  /** Try the last few days (the metrics endpoint lags by a day or two). */
  private async fetchTopViewed(language: SupportedLang): Promise<string[]> {
    for (let daysAgo = 1; daysAgo <= 3; daysAgo += 1) {
      const date = new Date(nowMs() - daysAgo * 24 * 60 * 60 * 1000);
      const yyyy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(date.getUTCDate()).padStart(2, "0");
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${language}.wikipedia/all-access/${yyyy}/${mm}/${dd}`;

      try {
        const res = await fetch(url, {
          headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
        });
        if (!res.ok) {
          continue;
        }
        const data = (await res.json()) as PageviewsTop;
        const titles = (data.items?.[0]?.articles ?? [])
          .map((a) => a.article)
          .filter((title) => title && !isExcludedTitle(title))
          .slice(0, POPULAR_LIMIT);
        if (titles.length) {
          return titles;
        }
      } catch (err) {
        this.logger.warn(`pageviews fetch failed for ${language}: ${String(err)}`);
      }
    }
    this.logger.warn(`No popular titles for ${language}, feed will be empty`);
    return [];
  }

  /** Current-events article titles (Wikimedia featured "news"), per language. */
  async getNewsTitles(lang?: string): Promise<string[]> {
    const language = this.normalizeLang(lang);
    const key = `news:${language}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) {
      return cached;
    }

    const titles: string[] = [];
    for (let daysAgo = 0; daysAgo <= 1 && titles.length === 0; daysAgo += 1) {
      const date = new Date(nowMs() - daysAgo * 24 * 60 * 60 * 1000);
      const yyyy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(date.getUTCDate()).padStart(2, "0");
      const url = `https://api.wikimedia.org/feed/v1/wikipedia/${language}/featured/${yyyy}/${mm}/${dd}`;
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
        });
        if (!res.ok) {
          continue;
        }
        const data = (await res.json()) as FeaturedFeed;
        // Current events ("In the news") first…
        for (const item of data.news ?? []) {
          for (const link of item.links ?? []) {
            const title = link.titles?.canonical ?? link.title;
            if (title && !isExcludedTitle(title)) {
              titles.push(title);
            }
          }
        }
        // …then the most-read articles of the day.
        for (const article of data.mostread?.articles ?? []) {
          const title = article.titles?.canonical ?? article.title;
          if (title && !isExcludedTitle(title)) {
            titles.push(title);
          }
        }
      } catch (err) {
        this.logger.warn(`news fetch failed for ${language}: ${String(err)}`);
      }
    }

    const unique = [...new Set(titles)].slice(0, POPULAR_LIMIT);
    if (unique.length) {
      await this.cache.set(key, unique, NEWS_TTL_MS);
    }
    return unique;
  }

  /**
   * Articles related to the user's seeds (liked/saved) — content-based "For you".
   * Uses CirrusSearch "morelike" (the REST /page/related endpoint is deprecated).
   */
  async getRelatedTitles(seeds: string[], lang?: string): Promise<string[]> {
    const language = this.normalizeLang(lang);
    const trimmed = seeds.filter(Boolean).slice(0, RELATED_SEED_LIMIT);
    if (!trimmed.length) {
      return [];
    }
    const key = `related:${language}:${trimmed.join("|")}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) {
      return cached;
    }

    const srsearch = `morelike:${trimmed.join("|")}`;
    const url =
      `https://${language}.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(srsearch)}&srlimit=80&srnamespace=0&format=json&origin=*`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { query?: { search?: { title: string }[] } };
      const seedSet = new Set(trimmed);
      const titles = (data.query?.search ?? [])
        .map((s) => s.title)
        .filter((title) => !seedSet.has(title) && !isExcludedTitle(title));
      const unique = [...new Set(titles)].slice(0, POPULAR_LIMIT);
      if (unique.length) {
        await this.cache.set(key, unique, RELATED_TTL_MS);
      }
      return unique;
    } catch (err) {
      this.logger.warn(`related fetch failed for ${language}: ${String(err)}`);
      return [];
    }
  }

  /**
   * "Keep exploring" suggestions drawn from the page's own categories &
   * portals: for a French actress, this surfaces other French actresses of the
   * same period rather than whatever happened to be linked inline. Round-robins
   * across a few topical categories for variety. Cached per page.
   */
  async getRelatedByCategory(
    title: string,
    lang?: string,
  ): Promise<{ label: string; targetId: string }[]> {
    const language = this.normalizeLang(lang);
    const key = `category:${language}:${title}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) {
      return cached.map((targetId) => ({ label: targetId, targetId }));
    }

    const categories = await this.fetchCategories(title, language);
    const topical = categories
      .map((c) => ({ full: c, name: stripCategoryPrefix(c) }))
      .filter((c) => c.name.length > 0 && !SKIP_CATEGORY.test(c.name))
      .slice(0, CATEGORY_PICK);
    if (!topical.length) {
      return [];
    }

    const memberLists = await Promise.all(
      topical.map((c) => this.fetchCategoryMembers(c.full, language)),
    );
    // Round-robin across categories so the suggestions stay diverse.
    const merged: string[] = [];
    const seen = new Set<string>([title]);
    const maxLen = Math.max(0, ...memberLists.map((m) => m.length));
    for (let i = 0; i < maxLen && merged.length < ARTICLE_LINKS_LIMIT; i += 1) {
      for (const list of memberLists) {
        const member = list[i];
        if (member && !seen.has(member) && !isExcludedTitle(member)) {
          seen.add(member);
          merged.push(member);
          if (merged.length >= ARTICLE_LINKS_LIMIT) {
            break;
          }
        }
      }
    }

    if (merged.length) {
      await this.cache.set(key, merged, CATEGORY_TTL_MS);
    }
    return merged.map((targetId) => ({ label: targetId, targetId }));
  }

  /** Non-hidden categories a page belongs to (with localized prefix). */
  private async fetchCategories(title: string, language: SupportedLang): Promise<string[]> {
    const url =
      `https://${language}.wikipedia.org/w/api.php?action=query&prop=categories` +
      `&clshow=!hidden&cllimit=max&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as {
        query?: { pages?: Record<string, { categories?: { title: string }[] }> };
      };
      const pages = data.query?.pages ?? {};
      const first = Object.values(pages)[0];
      return (first?.categories ?? []).map((c) => c.title);
    } catch (err) {
      this.logger.warn(`categories fetch failed for ${title}: ${String(err)}`);
      return [];
    }
  }

  /** Article-namespace members of a category. */
  private async fetchCategoryMembers(
    category: string,
    language: SupportedLang,
  ): Promise<string[]> {
    const url =
      `https://${language}.wikipedia.org/w/api.php?action=query&list=categorymembers` +
      `&cmtitle=${encodeURIComponent(category)}&cmnamespace=0&cmtype=page` +
      `&cmlimit=${CATEGORY_MEMBERS_PER_CAT}&format=json&origin=*`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { query?: { categorymembers?: { title: string }[] } };
      return (data.query?.categorymembers ?? []).map((m) => m.title);
    } catch (err) {
      this.logger.warn(`category members fetch failed for ${category}: ${String(err)}`);
      return [];
    }
  }

  /** Random article titles — serendipity + the infinite-scroll fallback. */
  async getRandomTitles(lang: string | undefined, count: number): Promise<string[]> {
    const language = this.normalizeLang(lang);
    const url =
      `https://${language}.wikipedia.org/w/api.php?action=query&list=random` +
      `&rnnamespace=0&rnlimit=${Math.min(count * 2, 20)}&format=json&origin=*`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { query?: { random?: { title: string }[] } };
      return (data.query?.random ?? [])
        .map((r) => r.title)
        .filter((title) => !isExcludedTitle(title))
        .slice(0, count);
    } catch (err) {
      this.logger.warn(`random fetch failed for ${language}: ${String(err)}`);
      return [];
    }
  }

  /** Discovery pool for the immersive Flow: related-to-you blended with popular. */
  async getDiscoverTitles(lang: string | undefined, seeds: string[]): Promise<string[]> {
    const [related, popular] = await Promise.all([
      this.getRelatedTitles(seeds, lang),
      this.getPopularTitles(lang),
    ]);
    return [...new Set([...related, ...popular])];
  }

  private toArticle(data: WikiSummary, language: SupportedLang): Article {
    const rawImage = data.thumbnail?.source ?? data.originalimage?.source;
    const image = isScaffoldImage(rawImage) ? undefined : rawImage;
    // Broad topics for the profile's interest chips, from title + description.
    const topics = classifyTopics(`${data.title} ${data.description ?? ""}`);
    return {
      id: data.titles?.canonical ?? data.title,
      category: data.description ?? "Wikipedia",
      title: data.title,
      summary: data.extract ?? "",
      topics: topics.length ? topics : undefined,
      image,
      imageWidth: image ? data.originalimage?.width ?? data.thumbnail?.width : undefined,
      imageHeight: image ? data.originalimage?.height ?? data.thumbnail?.height : undefined,
      readingMinutes: estimateReadingMinutes(data.extract ?? ""),
      // Sections & internal links are filled by getArticle (detail screen only).
      sections: [],
      links: [],
      likes: 0,
      liked: false,
      saved: false,
      sourceUrl:
        data.content_urls?.desktop?.page ??
        `https://${language}.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
    };
  }
}

// Localized main pages that have no namespace colon (the colon ones are caught
// by the includes(":") check below).
const MAIN_PAGES = new Set<string>([
  "Main_Page", // en
  "Pagina_principale", // it
  "Hoofdpagina", // nl
  "Заглавная_страница", // ru
  "メインページ", // ja
  "Anasayfa", // tr
]);

/** "Catégorie:Actrice française" → "Actrice française" (any localized prefix). */
function stripCategoryPrefix(category: string): string {
  const colon = category.indexOf(":");
  return colon >= 0 ? category.slice(colon + 1).trim() : category.trim();
}

/** Drop main pages, placeholders and namespaced pages (Special:, Portal:…). */
function isExcludedTitle(title: string): boolean {
  return title === "-" || MAIN_PAGES.has(title) || title.includes(":");
}

/**
 * Compare two strings ignoring case, accents (é≈e) and any non-alphanumeric
 * separators (so "franche compté" ≈ "Franche-Comté"). Used to decide whether a
 * spelling suggestion is genuinely different from the query.
 */
function equalsIgnoringCaseAndDiacritics(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  return norm(a) === norm(b);
}

function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function nowMs(): number {
  return new Date().getTime();
}

interface PageviewsTop {
  items?: { articles?: { article: string; rank: number; views: number }[] }[];
}

interface FeaturedFeed {
  news?: { links?: { title?: string; titles?: { canonical?: string } }[] }[];
  mostread?: { articles?: { title?: string; titles?: { canonical?: string } }[] };
}

interface WikiSummary {
  title: string;
  titles?: { canonical?: string };
  description?: string;
  extract?: string;
  thumbnail?: { source: string; width?: number; height?: number };
  originalimage?: { source: string; width?: number; height?: number };
  content_urls?: { desktop?: { page?: string } };
}
