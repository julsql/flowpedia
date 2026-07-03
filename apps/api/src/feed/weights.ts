/**
 * Recommendation signal weights. A liked page counts much more than a bookmarked
 * one, which counts more than a merely-read one — used both for the "For you"
 * feed (how much a signal steers the related pool) and for the interest chips
 * (how much a signal steers which themes surface).
 */
export const LIKE_WEIGHT = 5;
export const SAVE_WEIGHT = 2;
export const READ_WEIGHT = 1;
