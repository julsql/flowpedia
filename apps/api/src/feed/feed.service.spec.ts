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
    expect(wiki.getDiscoverTitles).toHaveBeenCalled();
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
