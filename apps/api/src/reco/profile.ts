import type { InteractionType } from "@flowpedia/shared";
import { signalScore } from "./scoring";

/** A single persisted signal, normalized (ts as a number). */
export interface SignalRow {
  articleId: string;
  type: InteractionType;
  value: number | null;
  ts: number;
}

export interface EngagedArticle {
  articleId: string;
  weight: number;
}

/** Sentinel articleId carried by a `clearHistory` event (wipes reading history). */
export const CLEAR_HISTORY_ID = "*";

// Signals that belong to "reading history" — wiped by `clearHistory`. Library
// actions (like/save/share/story) survive a history wipe.
const HISTORY_TYPES = new Set<InteractionType>([
  "impression",
  "cardDwell",
  "dwell",
  "scrollDepth",
  "linkClick",
  "read",
  "openFull",
  "openWikipedia",
]);

/**
 * Fold an append-only signal journal into per-article engagement weights,
 * applying event-sourced revocation (§2.8):
 *
 * - `remove(articleId)` revokes every earlier signal for that article — so an
 *   unlike/unsave/remove-from-history stops it counting, while a *later*
 *   re-engagement (newer than the remove) counts again.
 * - `clearHistory` wipes reading-history signals older than it, but keeps
 *   library actions (like/save/share/story).
 *
 * Returns positively-engaged articles, most-engaged first. The journal itself is
 * never mutated — revocation is just another appended event.
 */
export function aggregateEngagement(rows: SignalRow[], now: number): EngagedArticle[] {
  // Latest `remove` per article, and the global `clearHistory` cutoff.
  const lastRemove = new Map<string, number>();
  let clearHistoryTs = 0;
  for (const r of rows) {
    if (r.type === "remove") {
      lastRemove.set(r.articleId, Math.max(lastRemove.get(r.articleId) ?? 0, r.ts));
    } else if (r.type === "clearHistory") {
      clearHistoryTs = Math.max(clearHistoryTs, r.ts);
    }
  }

  const weights = new Map<string, number>();
  for (const r of rows) {
    if (r.type === "remove" || r.type === "clearHistory") {
      continue;
    }
    // Revoked by a same-or-newer `remove`.
    if (r.ts <= (lastRemove.get(r.articleId) ?? -1)) {
      continue;
    }
    // Reading-history signal wiped by a later clearHistory.
    if (clearHistoryTs && HISTORY_TYPES.has(r.type) && r.ts <= clearHistoryTs) {
      continue;
    }
    const score = signalScore(r, now);
    if (score !== 0) {
      weights.set(r.articleId, (weights.get(r.articleId) ?? 0) + score);
    }
  }

  return [...weights.entries()]
    .map(([articleId, weight]) => ({ articleId, weight }))
    .filter((a) => a.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}
