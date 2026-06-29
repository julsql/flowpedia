import type { PublicUser } from "./auth";

/** Send a page (article) directly to another account. */
export interface SendPageRequest {
  /** Recipient handle (lowercased). */
  toUsername: string;
  articleId: string;
  title?: string;
  image?: string;
  /** Optional short message attached to the page. */
  note?: string;
}

/** One conversation summary (the other participant + last exchanged page). */
export interface ConversationSummary {
  user: PublicUser;
  lastArticleId: string;
  lastTitle?: string;
  lastNote?: string;
  /** ISO timestamp of the last exchanged page. */
  lastAt: string;
  /** True when the last page was sent by me (vs received). */
  mine: boolean;
  /** Unread received pages in this thread. */
  unread: number;
}

/** One page inside a conversation thread (sent or received). */
export interface ConversationMessage {
  id: string;
  /** True = I sent it; false = I received it. */
  mine: boolean;
  articleId: string;
  title?: string;
  image?: string;
  note?: string;
  read: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

/** A page received in the account's inbox, most recent first. */
export interface SentPageItem {
  id: string;
  from: PublicUser;
  articleId: string;
  title?: string;
  image?: string;
  note?: string;
  read: boolean;
  /** ISO timestamp. */
  createdAt: string;
}
