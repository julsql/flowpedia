import type { InteractionType } from "@flowpedia/shared";

/**
 * Scoring primitives for the recommendation profile (§2 of the plan). Pure
 * functions, no I/O — the unit-tested heart of "how much does a signal count".
 *
 * A signal's contribution to a user's taste is:
 *   EVENT_WEIGHTS[type] · saturation(type, value) · recency(now - ts)
 * where saturation folds the numeric value (dwell ms, scroll ratio…) into 0..1
 * and recency decays with a half-life so recent activity dominates.
 */

/** How fast a past signal loses weight. At one half-life it counts half as much. */
export const RECENCY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Base weights per signal (§2.1). For value-scaled types (dwell, scrollDepth,
 * cardDwell) this is the *cap* the saturation approaches; for the rest it is the
 * flat contribution. `mute` is the negative signal for "not interested".
 */
export const EVENT_WEIGHTS: Partial<Record<InteractionType | "mute", number>> = {
  story: 5.0, // reshared as a story — as strong as a share
  share: 5.0,
  save: 4.0,
  like: 3.0,
  openFull: 2.0,
  linkClick: 1.5,
  read: 1.0,
  openWikipedia: 0.3,
  impression: 0.05, // seen but not engaged — near-neutral
  // Value-scaled caps (multiplied by a 0..1 saturation of `value`):
  dwell: 2.5,
  scrollDepth: 1.5,
  cardDwell: 1.0,
  // Negative:
  mute: -4.0,
};

// Saturation time-constants (τ) for time-based signals: contribution reaches
// ~63% of the cap at τ, ~86% at 2τ. Chosen so cardDwell saturates within a few
// seconds and a full-article dwell over a handful of them.
const DWELL_TAU_MS = 20_000;
const CARD_DWELL_TAU_MS = 3_000; // ~93% of cap by 8s (plan: "sature ~8s")

// Below this, a card that flashed by is a *skip* — a small negative signal.
const CARD_SKIP_MS = 1_500;
const CARD_SKIP_PENALTY = -0.3;

/** Exponential decay in [0,1]; 1 at age 0, 0.5 at one half-life. */
export function recency(ageMs: number, halfLifeMs = RECENCY_HALF_LIFE_MS): number {
  if (ageMs <= 0) {
    return 1;
  }
  return 2 ** (-ageMs / halfLifeMs);
}

/** Saturating map of an elapsed time (ms) to 0..1: 1 - e^(-ms/τ). */
export function saturateTime(ms: number, tauMs: number): number {
  if (ms <= 0) {
    return 0;
  }
  return 1 - Math.exp(-ms / tauMs);
}

/**
 * Un-decayed weight of a single signal (value folded in, recency not yet
 * applied). Positive for engagement, negative for a mute or a fast skip, 0 for
 * types that don't feed the taste profile (revocation events, unknown types).
 */
export function baseWeight(type: InteractionType | "mute", value?: number | null): number {
  switch (type) {
    case "dwell":
      return EVENT_WEIGHTS.dwell! * saturateTime(value ?? 0, DWELL_TAU_MS);
    case "cardDwell": {
      const ms = value ?? 0;
      if (ms > 0 && ms < CARD_SKIP_MS) {
        return CARD_SKIP_PENALTY; // fast skip → small negative
      }
      return EVENT_WEIGHTS.cardDwell! * saturateTime(ms, CARD_DWELL_TAU_MS);
    }
    case "scrollDepth":
      return EVENT_WEIGHTS.scrollDepth! * clamp01(value ?? 0);
    default:
      return EVENT_WEIGHTS[type] ?? 0;
  }
}

/** Full contribution of a signal at `now`: base weight decayed by recency. */
export function signalScore(
  event: { type: InteractionType | "mute"; value?: number | null; ts: number },
  now: number,
): number {
  const base = baseWeight(event.type, event.value);
  if (base === 0) {
    return 0;
  }
  return base * recency(now - event.ts);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
