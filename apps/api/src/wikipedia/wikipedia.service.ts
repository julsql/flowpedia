import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Article } from "@flowpedia/shared";
import { collectLinks, parseArticleSections } from "./parse-article";

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

interface CacheEntry {
  article: Article;
  expiresAt: number;
}

interface TitlesCacheEntry {
  titles: string[];
  expiresAt: number;
}

const POPULAR_TTL_MS = 6 * 60 * 60 * 1000;
const POPULAR_LIMIT = 40;
const ARTICLE_LINKS_LIMIT = 40;

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
 * Proxy + lightweight cache in front of the Wikimedia REST API.
 * MVP: in-memory cache. Next step: swap for Redis (REDIS_URL).
 */
@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly articleCache = new Map<string, CacheEntry>();
  private readonly popularCache = new Map<SupportedLang, TitlesCacheEntry>();

  constructor(private readonly config: ConfigService) {}

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

  /** Fetch an article summary (page/summary endpoint), cached per language. */
  async getSummary(title: string, lang?: string): Promise<Article> {
    const language = this.normalizeLang(lang);
    const key = `${language}:${title}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > nowMs()) {
      return cached.article;
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
    this.cache.set(key, { article, expiresAt: nowMs() + this.ttlMs });
    return article;
  }

  /**
   * Full article for the detail screen: summary metadata (image, category…)
   * plus parsed sections with inline internal links. Cached per language.
   */
  async getArticle(title: string, lang?: string): Promise<Article> {
    const language = this.normalizeLang(lang);
    const key = `${language}:${title}`;
    const cached = this.articleCache.get(key);
    if (cached && cached.expiresAt > nowMs()) {
      return cached.article;
    }

    const summary = await this.getSummary(title, language);
    const leadTitle = SUMMARY_LABEL[language];

    let sections = summary.sections;
    try {
      const html = await this.fetchArticleHtml(summary.title, language);
      sections = parseArticleSections(html, leadTitle);
    } catch (err) {
      this.logger.warn(`article HTML parse failed for ${title}: ${String(err)}`);
    }

    // Fallback so the screen is never empty if HTML/parse fails.
    if (!sections.length && summary.summary) {
      sections = [{ id: "section-0", title: leadTitle, paragraphs: [{ runs: [{ text: summary.summary }] }] }];
    }

    const article: Article = {
      ...summary,
      sections,
      links: collectLinks(sections).slice(0, ARTICLE_LINKS_LIMIT),
    };
    this.articleCache.set(key, { article, expiresAt: nowMs() + this.ttlMs });
    return article;
  }

  private async fetchArticleHtml(title: string, language: SupportedLang): Promise<string> {
    const url = `https://${language}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(
      title,
    )}`;
    const res = await fetch(url, {
      headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
    });
    if (!res.ok) {
      throw new Error(`Wikipedia HTML ${res.status} for ${title}`);
    }
    return res.text();
  }

  /** Full-text search → article summaries for the Explore screen. */
  async search(query: string, lang?: string): Promise<Article[]> {
    const language = this.normalizeLang(lang);
    const q = query.trim();
    if (!q) {
      return [];
    }
    const url =
      `https://${language}.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(q)}&srlimit=12&srnamespace=0&format=json&origin=*`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, "Api-User-Agent": this.userAgent },
      });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { query?: { search?: { title: string }[] } };
      const titles = (data.query?.search ?? []).map((s) => s.title);
      const settled = await Promise.allSettled(
        titles.map((title) => this.getSummary(title, language)),
      );
      return settled
        .filter((r): r is PromiseFulfilledResult<Article> => r.status === "fulfilled")
        .map((r) => r.value);
    } catch (err) {
      this.logger.warn(`search failed for "${q}": ${String(err)}`);
      return [];
    }
  }

  /**
   * Most-viewed article titles for a language (Wikimedia pageviews "top" API),
   * cached per language. Language-agnostic source for the "popular" feed.
   */
  async getPopularTitles(lang?: string): Promise<string[]> {
    const language = this.normalizeLang(lang);
    const cached = this.popularCache.get(language);
    if (cached && cached.expiresAt > nowMs()) {
      return cached.titles;
    }

    const titles = await this.fetchTopViewed(language);
    if (titles.length) {
      this.popularCache.set(language, { titles, expiresAt: nowMs() + POPULAR_TTL_MS });
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

  private toArticle(data: WikiSummary, language: SupportedLang): Article {
    return {
      id: data.titles?.canonical ?? data.title,
      category: data.description ?? "Wikipedia",
      title: data.title,
      summary: data.extract ?? "",
      image: data.thumbnail?.source ?? data.originalimage?.source,
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

/** Drop main pages, placeholders and namespaced pages (Special:, Portal:…). */
function isExcludedTitle(title: string): boolean {
  return title === "-" || MAIN_PAGES.has(title) || title.includes(":");
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

interface WikiSummary {
  title: string;
  titles?: { canonical?: string };
  description?: string;
  extract?: string;
  thumbnail?: { source: string };
  originalimage?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}
