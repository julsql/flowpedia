import type { Article } from "@flowpedia/shared";

// How many pages of each signal feed the "more like this" pool.
const SEED_CAP = 6;

/**
 * Split the pages the user kept into feed seeds by signal strength: liked pages
 * become the primary `seeds` (weight 5 on the API), bookmarked pages become
 * `savedSeeds` (weight 2). Pages whose category the user muted are dropped, and
 * a page that is both liked and saved counts only as liked (the stronger signal).
 */
export function buildFeedSeeds(
  liked: Article[],
  saved: Article[],
  mutedInterests: string[],
): { seeds: string[]; savedSeeds: string[] } {
  const muted = new Set(mutedInterests);
  const seen = new Set<string>();
  const pick = (arr: Article[]): string[] => {
    const out: string[] = [];
    for (const a of arr) {
      if (a.category && muted.has(a.category)) continue;
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a.id);
      if (out.length >= SEED_CAP) break;
    }
    return out;
  };
  return { seeds: pick(liked), savedSeeds: pick(saved) };
}
