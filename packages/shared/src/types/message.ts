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

/** Send a plain text message (no article) inside a conversation. */
export interface SendMessageRequest {
  /** Recipient handle (lowercased). */
  toUsername: string;
  text: string;
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

/** One message inside a conversation thread (sent or received). A message is
 *  either a shared page (`articleId` set) or a plain text message (`text` set). */
export interface ConversationMessage {
  id: string;
  /** True = I sent it; false = I received it. */
  mine: boolean;
  /** The shared article, or undefined for a plain text message. */
  articleId?: string;
  title?: string;
  image?: string;
  note?: string;
  /** Body of a plain text message (undefined for a shared page). */
  text?: string;
  read: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

/** A page received in the account's inbox, most recent first. */
export interface SentPageItem {
  id: string;
  from: PublicUser;
  articleId?: string;
  title?: string;
  image?: string;
  note?: string;
  text?: string;
  read: boolean;
  /** ISO timestamp. */
  createdAt: string;
}
