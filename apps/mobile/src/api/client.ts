import type { Article, FeedResponse, FeedTab, InteractionEvent } from "@flowpedia/shared";
import type { Locale } from "../i18n";

// Override with EXPO_PUBLIC_API_URL. On a physical device, use the host machine
// LAN IP instead of localhost (e.g. http://192.168.1.20:3000/api).
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

export function fetchFeed(tab: FeedTab, locale: Locale, cursor?: string): Promise<FeedResponse> {
  const params = new URLSearchParams({ tab, lang: locale });
  if (cursor) {
    params.set("cursor", cursor);
  }
  return getJson<FeedResponse>(`/feed?${params.toString()}`);
}

export function fetchArticle(id: string, locale: Locale): Promise<Article> {
  return getJson<Article>(`/articles/${encodeURIComponent(id)}?lang=${locale}`);
}

/** Fire-and-forget signal ingestion; failures must never break the UI. */
export function sendEvents(events: InteractionEvent[]): void {
  void fetch(`${BASE_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  }).catch(() => undefined);
}
