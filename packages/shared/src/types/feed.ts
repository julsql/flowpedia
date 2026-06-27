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
  /**
   * Search typo handling. `correctedQuery` is set when no direct hit was found
   * and the results are for an auto-corrected spelling (with `originalQuery` =
   * what the user typed, to offer searching it literally). `suggestion` is a
   * "did you mean" offered when hits exist but a better spelling was suggested.
   */
  correctedQuery?: string;
  originalQuery?: string;
  suggestion?: string;
}
