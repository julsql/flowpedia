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
