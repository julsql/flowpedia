import type { InteractionType } from "@flowpedia/shared";

/**
 * Cooldown per signal, in ms (§3, Option A). A title stays excluded from recall
 * for this long after the signal. Short for a mere impression/skim, long for a
 * real engagement — never *forever*, so a niche interest graph can't starve
 * (past the cooldown a title may resurface, with the random fallback beyond it).
 */
export const SEEN_COOLDOWN_MS: Partial<Record<InteractionType, number>> = {
  impression: 14 * 24 * 60 * 60 * 1000, // 14 days
  cardDwell: 14 * 24 * 60 * 60 * 1000,
  openFull: 90 * 24 * 60 * 60 * 1000, // 90 days — really read it
  like: 90 * 24 * 60 * 60 * 1000,
  save: 90 * 24 * 60 * 60 * 1000,
  read: 90 * 24 * 60 * 60 * 1000,
};

const DEFAULT_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export interface SeenRow {
  articleId: string;
  type: InteractionType;
  ts: number;
}

/**
 * Article ids still within their cooldown at `now` — the set the feed must not
 * re-serve. An article revoked from history (a later `remove`) is *not* forced
 * back in here: deletion doesn't purge `seen`, so it stays excluded through the
 * normal cooldown (plan §2.8).
 */
export function seenWithinCooldown(rows: SeenRow[], now: number): Set<string> {
  const seen = new Set<string>();
  for (const r of rows) {
    const cooldown = SEEN_COOLDOWN_MS[r.type] ?? DEFAULT_COOLDOWN_MS;
    if (now - r.ts < cooldown) {
      seen.add(r.articleId);
    }
  }
  return seen;
}
