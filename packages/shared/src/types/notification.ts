import type { PublicUser } from "./auth";

/** What a notification is about. */
export type NotificationType =
  /** Someone requested to follow a private account (awaiting approval). */
  | "follow_request"
  /** A follow request the user sent was accepted. */
  | "follow_accepted"
  /** Someone started following a public account. */
  | "follower"
  /** Someone sent the user a page (article). */
  | "page_received";

/** One in-app notification row. */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  /** Who triggered it (null if the account was since deleted). */
  actor: PublicUser | null;
  /** Set for `page_received`: the article that was sent. */
  articleId?: string;
  /** Human title of the related article (for `page_received`). */
  title?: string;
  read: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

/** Lightweight unread badge payload. */
export interface UnreadCount {
  count: number;
}

/** Register (or refresh) a device's Expo push token for the account. */
export interface RegisterPushTokenRequest {
  /** Expo push token, e.g. "ExponentPushToken[xxx]". */
  token: string;
  /** "ios" | "android" | "web" — informational. */
  platform?: string;
}
