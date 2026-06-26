import type { Article, FeedResponse, FeedTab, InteractionEvent } from "@flowpedia/shared";
import type { Locale } from "../i18n";

// Override with EXPO_PUBLIC_API_URL. On a physical device, use the host machine
// LAN IP instead of localhost (e.g. http://192.168.1.20:3000/api).
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

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

export function fetchSearch(
  query: string,
  locale: Locale,
  cursor?: string,
): Promise<FeedResponse> {
  const params = new URLSearchParams({ q: query, lang: locale });
  if (cursor) {
    params.set("cursor", cursor);
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
