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

// 12 fake titles → 3 pages of 5 / 5 / 2.
const TITLES = Array.from({ length: 12 }, (_, i) => `Title_${i}`);

function makeWikipediaMock(getSummary: jest.Mock, titles: string[] = TITLES) {
  return {
    getSummary,
    getPopularTitles: jest.fn(async () => titles),
    normalizeLang: (lang?: string) => (lang === "en" ? "en" : "fr"),
  };
}

describe("FeedService", () => {
  it("returns a first page of 5 articles with a cursor", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    const res = await service.getFeed("popular", "en");

    expect(res.items).toHaveLength(5);
    expect(res.nextCursor).toBe("5");
    expect(getSummary).toHaveBeenCalledTimes(5);
  });

  it("fetches summaries for the popular titles in the requested language", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    await service.getFeed("popular", "ja");

    expect(getSummary).toHaveBeenCalledWith(TITLES[0], "ja");
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

  it("returns no cursor on the last page", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    const res = await service.getFeed("popular", "en", "10");

    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBeUndefined();
  });

  it("returns an empty feed when no popular titles are available", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = new FeedService(makeWikipediaMock(getSummary, []) as never);

    const res = await service.getFeed("popular", "en");

    expect(res.items).toHaveLength(0);
    expect(res.nextCursor).toBeUndefined();
    expect(getSummary).not.toHaveBeenCalled();
  });
});
