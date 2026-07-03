/**
 * User signals logged from the MVP on (even while the recommendation stays
 * "simple"), to feed the content-based algorithm later. Invisible in the UI.
 */
export type InteractionType =
  | "impression" // card shown in the feed (near-neutral; mainly for de-dup)
  | "cardDwell" // time the card stayed on screen in the flow (ms in `value`)
  | "dwell" // time spent on the article (ms in `value`)
  | "scrollDepth" // reading depth (0..1 in `value`)
  | "linkClick" // click on an internal link
  | "read" // opened/kept in the reading history
  | "like"
  | "save"
  | "share"
  | "story" // reshared as a 24h story — strong interest, weighted like `share`
  | "openFull" // opened the full article
  | "openWikipedia" // tapped "view on Wikipedia" (signals a likely parsing gap)
  // Revocation (event-sourcing): the profile filters out any article carrying a
  // later `remove`; `clearHistory` wipes all reading-history contributions.
  | "remove" // stop counting this article (unlike/unsave/remove-from-history)
  | "clearHistory"; // wipe reading history (articleId is the sentinel "*")

export interface InteractionEvent {
  articleId: string;
  /** Optional numeric value depending on the type (ms, ratio…). */
  value?: number;
  type: InteractionType;
  /** Client-side epoch ms. */
  ts: number;
  /** Temporary anonymous user id (attached by the client). */
  userId?: string;
}

export interface IngestEventsRequest {
  events: InteractionEvent[];
}
