import type {
  Article,
  AuthResponse,
  AuthUser,
  ChangePasswordRequest,
  FeedResponse,
  FeedTab,
  ForgotPasswordRequest,
  InteractionEvent,
  Interest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
} from "@flowpedia/shared";
import type { Locale } from "../i18n";
import {
  cacheArticle,
  cacheFeedPage,
  getCachedArticle,
  getCachedFeedPage,
} from "../cache/offlineCache";

// Re-export so screens can read the offline copy directly (instant display
// before revalidating from the network).
export { getCachedArticle } from "../cache/offlineCache";

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

// Bearer token for authenticated requests. Set by AuthProvider on login/restore,
// cleared on logout. Undefined ⇒ requests go out unauthenticated (guest mode).
let authToken: string | undefined;
export function setAuthToken(token: string | undefined): void {
  authToken = token;
}

function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

/** An API error carrying the HTTP status and the server's message (if any). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Abort a request after this long so an offline/slow network falls back to the
// cache quickly instead of hanging (was effectively ~60s on a dropped network).
const REQUEST_TIMEOUT_MS = 20_000;

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      headers: authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`API ${res.status} on ${path}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * JSON request that surfaces the server's error message (NestJS exception body)
 * as an ApiError, so screens can show "Username is already taken." rather than a
 * generic failure. Used by the auth flows.
 */
async function requestJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let message = `API ${res.status}`;
      try {
        const data = (await res.json()) as { message?: string | string[] };
        if (data?.message) {
          message = Array.isArray(data.message) ? data.message.join(", ") : String(data.message);
        }
      } catch {
        // non-JSON error body — keep the status-based message
      }
      throw new ApiError(res.status, message);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function registerAccount(body: RegisterRequest): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/auth/register", "POST", body);
}

export function loginAccount(body: LoginRequest): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/auth/login", "POST", body);
}

export function fetchMe(): Promise<AuthUser> {
  return requestJson<AuthUser>("/auth/me", "GET");
}

export function forgotPassword(body: ForgotPasswordRequest): Promise<{ message: string }> {
  return requestJson<{ message: string }>("/auth/forgot-password", "POST", body);
}

export function resetPassword(body: ResetPasswordRequest): Promise<{ message: string }> {
  return requestJson<{ message: string }>("/auth/reset-password", "POST", body);
}

export function updateProfile(body: UpdateProfileRequest): Promise<AuthUser> {
  return requestJson<AuthUser>("/auth/me", "PATCH", body);
}

export function changePassword(body: ChangePasswordRequest): Promise<{ message: string }> {
  return requestJson<{ message: string }>("/auth/change-password", "POST", body);
}

export function deleteAccount(): Promise<{ message: string }> {
  return requestJson<{ message: string }>("/auth/me", "DELETE");
}

export function wipeAccountData(): Promise<{ message: string }> {
  return requestJson<{ message: string }>("/auth/wipe-data", "POST");
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
  return getFeed(tab, locale, cursor, params);
}

async function getFeed(
  tab: FeedTab,
  locale: Locale,
  cursor: string | undefined,
  params: URLSearchParams,
): Promise<FeedResponse> {
  try {
    const response = await getJson<FeedResponse>(`/feed?${params.toString()}`);
    // Freeze the first page per tab so it can be replayed when offline.
    if (!cursor) {
      void cacheFeedPage(tab, locale, response);
    }
    return response;
  } catch (err) {
    // Offline: replay the frozen first page; deeper pages just stop.
    if (!cursor) {
      const cached = await getCachedFeedPage(tab, locale);
      if (cached) {
        return cached;
      }
    } else {
      return { items: [] };
    }
    throw err;
  }
}

export async function fetchArticle(id: string, locale: Locale): Promise<Article> {
  try {
    const article = await getJson<Article>(`/articles/${encodeURIComponent(id)}?lang=${locale}`);
    void cacheArticle(article, locale);
    return article;
  } catch (err) {
    // Offline: fall back to the cached copy if we've opened it before.
    const cached = await getCachedArticle(id, locale);
    if (cached) {
      return cached;
    }
    throw err;
  }
}

/** Warm the offline cache with an article's full content (no-op if cached). */
export async function prefetchArticle(id: string, locale: Locale): Promise<void> {
  if (await getCachedArticle(id, locale)) {
    return;
  }
  try {
    await fetchArticle(id, locale);
  } catch {
    // Best-effort warming; ignore failures (e.g. offline).
  }
}

/** Hydrate a list of titles into summary cards (e.g. "Articles connexes"). */
export function fetchSummaries(ids: string[], locale: Locale): Promise<Article[]> {
  if (!ids.length) {
    return Promise.resolve([]);
  }
  const params = new URLSearchParams({ ids: ids.join(","), lang: locale });
  return getJson<Article[]>(`/articles/summaries?${params.toString()}`);
}

/**
 * Derive adaptive interest chips from the titles the user kept. The granularity
 * follows their reading: tight clusters yield a specific category, dispersed ones
 * climb to a shared ancestor. Best-effort — returns [] when offline/unreachable
 * so the profile simply hides the chips instead of erroring.
 */
export async function fetchInterests(ids: string[], locale: Locale): Promise<Interest[]> {
  if (!ids.length) {
    return [];
  }
  const params = new URLSearchParams({ ids: ids.join(","), lang: locale });
  try {
    return await getJson<Interest[]>(`/interests?${params.toString()}`);
  } catch {
    return [];
  }
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
  // Reuse the cached popular feed so trending also works offline (frozen).
  const res = await getFeed("popular", locale, undefined, new URLSearchParams({ tab: "popular", lang: locale }));
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
