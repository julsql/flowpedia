import { FeedService } from "./feed.service";
import { SEED_TITLES_BY_LANG } from "./seed-titles";
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
    sourceUrl: `https://fr.wikipedia.org/wiki/${id}`,
  };
}

function makeWikipediaMock(getSummary: jest.Mock) {
  return { getSummary, normalizeLang: (lang?: string) => (lang === "en" ? "en" : "fr") };
}

describe("FeedService", () => {
  it("returns a first page of 5 articles with a cursor", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    const res = await service.getFeed("popular", "fr");

    expect(res.items).toHaveLength(5);
    expect(res.nextCursor).toBe("5");
    expect(getSummary).toHaveBeenCalledTimes(5);
  });

  it("uses the language-specific seed list", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    await service.getFeed("popular", "en");

    expect(getSummary).toHaveBeenCalledWith(SEED_TITLES_BY_LANG.en[0], "en");
  });

  it("skips articles whose fetch fails", async () => {
    const getSummary = jest.fn(async (t: string) => {
      if (t === SEED_TITLES_BY_LANG.fr[1]) throw new Error("404");
      return fakeArticle(t);
    });
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    const res = await service.getFeed("popular", "fr");

    expect(res.items).toHaveLength(4);
  });

  it("returns no cursor on the last page", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = new FeedService(makeWikipediaMock(getSummary) as never);

    const total = SEED_TITLES_BY_LANG.fr.length;
    const lastOffset = String(Math.floor((total - 1) / 5) * 5);
    const res = await service.getFeed("popular", "fr", lastOffset);

    expect(res.nextCursor).toBeUndefined();
  });
});
