import type { Article } from "./article";

/** Feed tabs — see handoff screen 1. Displayed labels are localized in the app. */
export type FeedTab = "forYou" | "popular" | "news";

export interface FeedResponse {
  items: Article[];
  /** Pagination cursor for infinite scroll; absent = end of the stream. */
  nextCursor?: string;
}
