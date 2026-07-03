import { SEEN_COOLDOWN_MS, seenWithinCooldown, type SeenRow } from "./seen";

const now = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const row = (articleId: string, type: SeenRow["type"], ageDays: number): SeenRow => ({
  articleId,
  type,
  ts: now - ageDays * DAY,
});

describe("seenWithinCooldown", () => {
  it("excludes a recent impression but lets it resurface past its cooldown", () => {
    const fresh = seenWithinCooldown([row("A", "impression", 2)], now);
    expect(fresh.has("A")).toBe(true);
    const stale = seenWithinCooldown([row("A", "impression", 20)], now);
    expect(stale.has("A")).toBe(false); // impression cooldown is 14 days
  });

  it("keeps a really-read article excluded far longer than an impression", () => {
    // 30 days: past the impression cooldown, still within the openFull one.
    const rows = [row("A", "impression", 30), row("B", "openFull", 30)];
    const seen = seenWithinCooldown(rows, now);
    expect(seen.has("A")).toBe(false);
    expect(seen.has("B")).toBe(true);
  });

  it("uses the longest applicable cooldown when a title has several signals", () => {
    const rows = [row("A", "impression", 30), row("A", "openFull", 30)];
    expect(seenWithinCooldown(rows, now).has("A")).toBe(true);
  });

  it("defines a longer cooldown for engagement than for impressions", () => {
    expect(SEEN_COOLDOWN_MS.openFull!).toBeGreaterThan(SEEN_COOLDOWN_MS.impression!);
  });
});
