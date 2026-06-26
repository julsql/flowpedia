import type { Article } from "./article";

/**
 * Feed sources. forYou/popular/news are the home tabs; "discover" backs the
 * immersive Flow screen. Displayed labels are localized in the app.
 */
export type FeedTab = "forYou" | "popular" | "news" | "discover";

export interface FeedResponse {
  items: Article[];
  /** Pagination cursor for infinite scroll; absent = end of the stream. */
  nextCursor?: string;
}
