import type {
  Article,
  AuthResponse,
  AuthUser,
  ChangePasswordRequest,
  FeedResponse,
  FeedTab,
  CreateStoryRequest,
  FollowResult,
  ForgotPasswordRequest,
  InteractionEvent,
  Interest,
  LibraryKind,
  LibrarySnapshot,
  ConversationMessage,
  ConversationSummary,
  LoginRequest,
  NotificationItem,
  ProfileView,
  PublicUser,
  RegisterPushTokenRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SendPageRequest,
  SentPageItem,
  StoryGroup,
  UnreadCount,
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

/** Server origin without the /api prefix — used by the realtime socket. */
export const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

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

/** Current bearer token (for the realtime socket handshake). */
export function getAuthToken(): string | undefined {
  return authToken;
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
    // A handler returning null (e.g. "no story for this user") yields a 200 with
    // an empty body — JSON.parse("") would throw, so treat empty as null.
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
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

/** The signed-in account's server-side library (article-id lists). */
export function fetchLibrary(): Promise<LibrarySnapshot> {
  return requestJson<LibrarySnapshot>("/library", "GET");
}

export function addLibraryItem(articleId: string, kind: LibraryKind): Promise<void> {
  return requestJson<void>("/library", "POST", { articleId, kind });
}

export function removeLibraryItem(articleId: string, kind: LibraryKind): Promise<void> {
  return requestJson<void>("/library", "DELETE", { articleId, kind });
}

const userPath = (username: string) => `/users/${encodeURIComponent(username)}`;

export function searchUsers(q: string): Promise<PublicUser[]> {
  return requestJson<PublicUser[]>(`/users?q=${encodeURIComponent(q)}`, "GET");
}

export function fetchProfile(username: string): Promise<ProfileView> {
  return requestJson<ProfileView>(userPath(username), "GET");
}

export function followUser(username: string): Promise<FollowResult> {
  return requestJson<FollowResult>(`${userPath(username)}/follow`, "POST");
}

export function unfollowUser(username: string): Promise<FollowResult> {
  return requestJson<FollowResult>(`${userPath(username)}/follow`, "DELETE");
}

export function fetchFollowers(username: string): Promise<PublicUser[]> {
  return requestJson<PublicUser[]>(`${userPath(username)}/followers`, "GET");
}

export function fetchFollowing(username: string): Promise<PublicUser[]> {
  return requestJson<PublicUser[]>(`${userPath(username)}/following`, "GET");
}

export function removeFollowerByUsername(username: string): Promise<void> {
  return requestJson<void>(`/followers/${encodeURIComponent(username)}`, "DELETE");
}

export function fetchFollowRequests(): Promise<PublicUser[]> {
  return requestJson<PublicUser[]>("/follow-requests", "GET");
}

export function acceptFollowRequest(username: string): Promise<void> {
  return requestJson<void>(`/follow-requests/${encodeURIComponent(username)}/accept`, "POST");
}

export function rejectFollowRequest(username: string): Promise<void> {
  return requestJson<void>(`/follow-requests/${encodeURIComponent(username)}/reject`, "POST");
}

/** Reshare an article to your followers as a 24h story. */
export function createStory(req: CreateStoryRequest): Promise<void> {
  return requestJson<void>("/stories", "POST", req);
}

/** Active stories from people you follow (plus your own), grouped by author. */
export function fetchStories(): Promise<StoryGroup[]> {
  return requestJson<StoryGroup[]>("/stories", "GET");
}

/** One user's active stories (null when none / not allowed). Backs the
 *  "tap a profile avatar to watch their stories" entry point. */
export function fetchUserStories(username: string): Promise<StoryGroup | null> {
  return requestJson<StoryGroup | null>(`/stories/u/${encodeURIComponent(username)}`, "GET");
}

/** In-app notifications (follow requests, accepted requests, new followers, pages). */
export function fetchNotifications(): Promise<NotificationItem[]> {
  return requestJson<NotificationItem[]>("/notifications", "GET");
}

export function fetchUnreadCount(): Promise<UnreadCount> {
  return requestJson<UnreadCount>("/notifications/unread-count", "GET");
}

export function markNotificationsRead(): Promise<void> {
  return requestJson<void>("/notifications/read", "POST");
}

/** Register this device's Expo push token so the server can push to it. */
export function registerPushToken(body: RegisterPushTokenRequest): Promise<void> {
  return requestJson<void>("/notifications/token", "POST", body);
}

/** Send a page (article) directly to another account's inbox. */
export function sendPage(body: SendPageRequest): Promise<void> {
  return requestJson<void>("/messages", "POST", body);
}

/** Pages received from other accounts, most recent first. */
export function fetchInbox(): Promise<SentPageItem[]> {
  return requestJson<SentPageItem[]>("/messages", "GET");
}

/** Conversations: one summary per person you've exchanged pages with. */
export function fetchThreads(): Promise<ConversationSummary[]> {
  return requestJson<ConversationSummary[]>("/messages/threads", "GET");
}

/** Full thread with one account (sent + received). Marks received pages read. */
export function fetchThread(username: string): Promise<ConversationMessage[]> {
  return requestJson<ConversationMessage[]>(`/messages/with/${encodeURIComponent(username)}`, "GET");
}

/** Accounts you send pages to most (for quick-send). Empty if you've sent none. */
export function fetchTopContacts(limit = 5): Promise<PublicUser[]> {
  return requestJson<PublicUser[]>(`/messages/top-contacts?limit=${limit}`, "GET");
}

export function markPageRead(id: string): Promise<void> {
  return requestJson<void>(`/messages/${encodeURIComponent(id)}/read`, "POST");
}

/** Count of unread received pages (drives the Messages tab badge). */
export function fetchMessagesUnreadCount(): Promise<UnreadCount> {
  return requestJson<UnreadCount>("/messages/unread-count", "GET");
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
