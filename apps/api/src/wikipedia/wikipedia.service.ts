import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Article } from "@flowpedia/shared";

type SupportedLang = "en" | "fr";
const SUPPORTED_LANGS: SupportedLang[] = ["en", "fr"];

interface CacheEntry {
  article: Article;
  expiresAt: number;
}

/**
 * Proxy + lightweight cache in front of the Wikimedia REST API.
 * MVP: in-memory cache. Next step: swap for Redis (REDIS_URL).
 */
@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name);
  private readonly cache = new Map<string, CacheEntry>();

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

  private toArticle(data: WikiSummary, language: SupportedLang): Article {
    return {
      id: data.titles?.canonical ?? data.title,
      category: data.description ?? "Wikipedia",
      title: data.title,
      summary: data.extract ?? "",
      image: data.thumbnail?.source ?? data.originalimage?.source,
      readingMinutes: estimateReadingMinutes(data.extract ?? ""),
      // Sections & internal links are enriched later (article detail screen).
      sections: [{ id: "summary", title: data.title, body: data.extract ?? "" }],
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

function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function nowMs(): number {
  return new Date().getTime();
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
