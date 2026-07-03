import { aggregateEngagement, type SignalRow } from "./profile";

const now = 1_700_000_000_000;
const row = (articleId: string, type: SignalRow["type"], ts = now, value: number | null = null): SignalRow => ({
  articleId,
  type,
  value,
  ts,
});

describe("aggregateEngagement", () => {
  it("ranks articles by cumulative signal weight", () => {
    const out = aggregateEngagement(
      [row("A", "like"), row("A", "save"), row("B", "read")],
      now,
    );
    expect(out.map((a) => a.articleId)).toEqual(["A", "B"]);
    expect(out[0].weight).toBeGreaterThan(out[1].weight);
  });

  it("drops an article whose last signal is a remove (unlike)", () => {
    const out = aggregateEngagement(
      [row("A", "like", now - 1000), row("A", "remove", now)],
      now,
    );
    expect(out.find((a) => a.articleId === "A")).toBeUndefined();
  });

  it("counts a re-like that happens after the remove", () => {
    const out = aggregateEngagement(
      [row("A", "like", now - 2000), row("A", "remove", now - 1000), row("A", "like", now)],
      now,
    );
    expect(out.find((a) => a.articleId === "A")?.weight).toBeGreaterThan(0);
  });

  it("clearHistory wipes reading signals but keeps library actions", () => {
    const out = aggregateEngagement(
      [
        row("A", "read", now - 2000),
        row("A", "dwell", now - 2000, 30_000),
        row("B", "save", now - 2000),
        row("*", "clearHistory", now - 1000),
      ],
      now,
    );
    // A was only read/dwell → wiped; B was saved → kept.
    expect(out.find((a) => a.articleId === "A")).toBeUndefined();
    expect(out.find((a) => a.articleId === "B")).toBeDefined();
  });

  it("keeps a read that happened after a clearHistory", () => {
    const out = aggregateEngagement(
      [row("A", "read", now - 2000), row("*", "clearHistory", now - 1000), row("A", "read", now)],
      now,
    );
    expect(out.find((a) => a.articleId === "A")).toBeDefined();
  });

  it("excludes articles with net-zero or negative weight (fast skip)", () => {
    const out = aggregateEngagement([row("A", "cardDwell", now, 400)], now);
    expect(out.find((a) => a.articleId === "A")).toBeUndefined();
  });
});
