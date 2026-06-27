import type { Article, FeedResponse, FeedTab, InteractionEvent } from "@flowpedia/shared";
import type { Locale } from "../i18n";

// Override with EXPO_PUBLIC_API_URL. On a physical device, use the host machine
// LAN IP instead of localhost (e.g. http://192.168.1.20:3000/api).
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

/**
 * Route a remote image through the API proxy. Devices can't always load
 * Wikimedia images directly (UA policy / no direct route), but they can always
 * reach the API. Non-http uris are returned unchanged.
 */
export function proxiedImageUrl(uri: string): string {
  if (!/^https?:\/\//i.test(uri)) {
    return uri;
  }
  return `${BASE_URL}/image?u=${encodeURIComponent(uri)}`;
}

/** Upscale a Wikimedia thumbnail URL (…/300px-Name → …/<width>px-Name). */
export function largeImageUrl(uri: string, width = 1280): string {
  return uri.replace(/\/(\d+)px-([^/]+)$/i, (match, current, name) =>
    Number(current) >= width ? match : `/${width}px-${name}`,
  );
}

// Temporary anonymous user id, attached to every signal. Set by UserProvider.
let currentUserId: string | undefined;
export function setCurrentUserId(id: string): void {
  currentUserId = id;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

export function fetchFeed(
  tab: FeedTab,
  locale: Locale,
  cursor?: string,
  seeds: string[] = [],
  seed?: number,
  exclude: string[] = [],
): Promise<FeedResponse> {
  const params = new URLSearchParams({ tab, lang: locale });
  if (cursor) {
    params.set("cursor", cursor);
  }
  if (seeds.length) {
    params.set("seeds", seeds.join(","));
  }
  if (seed) {
    params.set("seed", String(seed));
  }
  if (exclude.length) {
    params.set("exclude", exclude.join(","));
  }
  return getJson<FeedResponse>(`/feed?${params.toString()}`);
}

export function fetchArticle(id: string, locale: Locale): Promise<Article> {
  return getJson<Article>(`/articles/${encodeURIComponent(id)}?lang=${locale}`);
}

/** Hydrate a list of titles into summary cards (e.g. "Articles connexes"). */
export function fetchSummaries(ids: string[], locale: Locale): Promise<Article[]> {
  if (!ids.length) {
    return Promise.resolve([]);
  }
  const params = new URLSearchParams({ ids: ids.join(","), lang: locale });
  return getJson<Article[]>(`/articles/summaries?${params.toString()}`);
}

export function fetchSearch(
  query: string,
  locale: Locale,
  cursor?: string,
  exact = false,
): Promise<FeedResponse> {
  const params = new URLSearchParams({ q: query, lang: locale });
  if (cursor) {
    params.set("cursor", cursor);
  }
  if (exact) {
    params.set("exact", "1");
  }
  return getJson<FeedResponse>(`/search?${params.toString()}`);
}

/** Trending = the popular feed, used as the Explore default state. */
export async function fetchTrending(locale: Locale): Promise<Article[]> {
  const res = await getJson<FeedResponse>(`/feed?tab=popular&lang=${locale}`);
  return res.items;
}

/** Fire-and-forget signal ingestion; failures must never break the UI. */
export function sendEvents(events: InteractionEvent[]): void {
  const withUser = events.map((e) => ({ ...e, userId: currentUserId }));
  void fetch(`${BASE_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: withUser }),
  }).catch(() => undefined);
}
