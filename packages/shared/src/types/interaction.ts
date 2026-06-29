/**
 * User signals logged from the MVP on (even while the recommendation stays
 * "simple"), to feed the content-based algorithm later. Invisible in the UI.
 */
export type InteractionType =
  | "dwell" // time spent on the article (ms in `value`)
  | "scrollDepth" // reading depth (0..1 in `value`)
  | "linkClick" // click on an internal link
  | "like"
  | "share"
  | "save"
  | "openFull" // opened the full article
  | "openWikipedia"; // tapped "view on Wikipedia" (signals a likely parsing gap)

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
