import { FeedService } from "./feed.service";
import type { Article } from "@flowpedia/shared";

function fakeArticle(id: string): Article {
  return {
    id,
    category: "Test",
    title: id,
    summary: "summary",
    sections: [],
    links: [],
    likes: 0,
    liked: false,
    saved: false,
    sourceUrl: `https://en.wikipedia.org/wiki/${id}`,
  };
}

const TITLES = Array.from({ length: 12 }, (_, i) => `Title_${i}`);

function makeWikipediaMock(getSummary: jest.Mock, pool: string[] = TITLES) {
  return {
    getSummary,
    normalizeLang: (lang?: string) => (lang === "en" ? "en" : "fr"),
    getPopularTitles: jest.fn(async () => pool),
    getNewsTitles: jest.fn(async () => pool),
    getRelatedTitles: jest.fn(async () => pool),
    getDiscoverTitles: jest.fn(async () => pool),
    getRandomTitles: jest.fn(async (_lang: string, n: number) =>
      Array.from({ length: n }, (_, i) => `Random_${i}`),
    ),
  };
}

describe("FeedService", () => {
  it("returns a first page of 5 articles with a cursor (no shuffle when seed=0)", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const wiki = makeWikipediaMock(getSummary);
    const service = new FeedService(wiki as never);

    const res = await service.getFeed("popular", "en");

    expect(res.items).toHaveLength(5);
    expect(res.nextCursor).toBe("5");
    expect(getSummary).toHaveBeenCalledWith(TITLES[0], "en");
  });

  it("selects the pool by tab", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const wiki = makeWikipediaMock(getSummary);
    const service = new FeedService(wiki as never);

    await service.getFeed("news", "en");
    expect(wiki.getNewsTitles).toHaveBeenCalled();

    await service.getFeed("forYou", "en", undefined, ["Seed"]);
    expect(wiki.getRelatedTitles).toHaveBeenCalled();

    await service.getFeed("discover", "en", undefined, ["Seed"]);
    // Discover now blends related-to-you with popular directly (for diversity).
    expect(wiki.getRelatedTitles).toHaveBeenCalled();
    expect(wiki.getPopularTitles).toHaveBeenCalled();
  });

  it("skips articles whose fetch fails", async () => {
    const getSummary = jest.fn(async (t: string) => {
      if (t === TITLES[1]) throw new Error("404");
      return fakeArticle(t);
    });
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    const res = await service.getFeed("popular", "en");

    expect(res.items).toHaveLength(4);
  });

  it("falls back to random articles past the end of the pool (infinite)", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const wiki = makeWikipediaMock(getSummary);
    const service = new FeedService(wiki as never);

    const res = await service.getFeed("popular", "en", "20"); // beyond 12-item pool

    expect(wiki.getRandomTitles).toHaveBeenCalled();
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.nextCursor).toBe("25"); // always a cursor
  });

  it("weaves a different subject into 'forYou' (escape door from the rabbit hole)", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const wiki = makeWikipediaMock(getSummary);
    const related = Array.from({ length: 12 }, (_, i) => `Related_${i}`);
    const popular = Array.from({ length: 12 }, (_, i) => `Popular_${i}`);
    wiki.getRelatedTitles = jest.fn(async () => related);
    wiki.getPopularTitles = jest.fn(async () => popular);
    const service = new FeedService(wiki as never);

    // First two pages (10 items) should contain at least one popular item.
    const p1 = (await service.getFeed("forYou", "en", undefined, ["Seed"])).items.map((a) => a.id);
    const p2 = (await service.getFeed("forYou", "en", "5", ["Seed"])).items.map((a) => a.id);
    const ids = [...p1, ...p2];

    expect(ids.some((id) => id.startsWith("Popular_"))).toBe(true);
    expect(ids.some((id) => id.startsWith("Related_"))).toBe(true);
  });

  it("orients news toward the user's interests when seeds exist", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const wiki = makeWikipediaMock(getSummary);
    const news = Array.from({ length: 12 }, (_, i) => `News_${i}`);
    const related = Array.from({ length: 12 }, (_, i) => `Interest_${i}`);
    wiki.getNewsTitles = jest.fn(async () => news);
    wiki.getRelatedTitles = jest.fn(async () => related);
    const service = new FeedService(wiki as never);

    const ids = (await service.getFeed("news", "en", undefined, ["Seed"])).items.map((a) => a.id);

    expect(ids.some((id) => id.startsWith("News_"))).toBe(true);
    expect(ids.some((id) => id.startsWith("Interest_"))).toBe(true);
  });

  it("excludes already-seen articles from the pool", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    const seen = [TITLES[0], TITLES[1], TITLES[2]];
    const res = await service.getFeed("popular", "en", undefined, [], 0, seen);

    expect(res.items.map((a) => a.id)).toEqual([TITLES[3], TITLES[4], TITLES[5], TITLES[6], TITLES[7]]);
  });

  it("reorders deterministically with a seed", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    const first = (await service.getFeed("popular", "en", undefined, [], 123)).items.map((a) => a.id);
    const same = (await service.getFeed("popular", "en", undefined, [], 123)).items.map((a) => a.id);
    const other = (await service.getFeed("popular", "en", undefined, [], 999)).items.map((a) => a.id);

    expect(same).toEqual(first); // same seed → same order
    expect(other).not.toEqual(first); // different seed → different order
  });
});
