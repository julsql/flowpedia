import { FeedService, capRelatedByWeight, weaveSocial } from "./feed.service";
import type { ProfileService } from "../reco/profile.service";
import type { SeenService } from "../reco/seen.service";
import type { SocialService } from "../reco/social.service";
import type { Article } from "@flowpedia/shared";

// Reco stubs: empty by default so the existing (non-personalized) tests are
// unaffected. Tests that exercise personalization/de-dup pass their own.
function emptyProfile(overrides: Partial<ProfileService> = {}): ProfileService {
  return {
    getWeightedSeeds: jest.fn(async () => []),
    getCategoryAffinity: jest.fn(async () => ({ entries: [] })),
    ...overrides,
  } as unknown as ProfileService;
}
function emptySeen(seen: string[] = []): SeenService {
  return { getSeen: jest.fn(async () => new Set(seen)) } as unknown as SeenService;
}
function emptySocial(titles: string[] = []): SocialService {
  return { getFollowedTitles: jest.fn(async () => titles) } as unknown as SocialService;
}
function makeService(
  wiki: unknown,
  profile: ProfileService = emptyProfile(),
  seen: SeenService = emptySeen(),
  social: SocialService = emptySocial(),
): FeedService {
  return new FeedService(wiki as never, profile, seen, social);
}

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
    const service = makeService(wiki);

    const res = await service.getFeed("popular", "en");

    expect(res.items).toHaveLength(5);
    expect(res.nextCursor).toBe("5");
    expect(getSummary).toHaveBeenCalledWith(TITLES[0], "en");
  });

  it("selects the pool by tab", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const wiki = makeWikipediaMock(getSummary);
    const service = makeService(wiki);

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
    const service = makeService(makeWikipediaMock(getSummary));

    const res = await service.getFeed("popular", "en");

    expect(res.items).toHaveLength(4);
  });

  it("falls back to random articles past the end of the pool (infinite)", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const wiki = makeWikipediaMock(getSummary);
    const service = makeService(wiki);

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
    const service = makeService(wiki);

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
    const service = makeService(wiki);

    const ids = (await service.getFeed("news", "en", undefined, ["Seed"])).items.map((a) => a.id);

    expect(ids.some((id) => id.startsWith("News_"))).toBe(true);
    expect(ids.some((id) => id.startsWith("Interest_"))).toBe(true);
  });

  it("excludes already-seen articles from the pool", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = makeService(makeWikipediaMock(getSummary));

    const seen = [TITLES[0], TITLES[1], TITLES[2]];
    const res = await service.getFeed("popular", "en", undefined, [], 0, seen);

    expect(res.items.map((a) => a.id)).toEqual([TITLES[3], TITLES[4], TITLES[5], TITLES[6], TITLES[7]]);
  });

  it("enriches recall with the taste profile only when personalize is on", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const wiki = makeWikipediaMock(getSummary);
    wiki.getRelatedTitles = jest.fn(async () => TITLES);
    const profile = emptyProfile({ getWeightedSeeds: jest.fn(async () => ["ProfileSeed"]) });
    const service = makeService(wiki, profile);

    // Page-anchored (personalize off): the explicit page seed drives recall.
    await service.getFeed("forYou", "en", undefined, ["Page"], 0, [], []);
    expect(profile.getWeightedSeeds).not.toHaveBeenCalled();
    expect(wiki.getRelatedTitles).toHaveBeenCalledWith(["Page"], "en");

    // Home (personalize on): the journal-derived seed is folded into recall.
    await service.getFeed("forYou", "en", undefined, ["Page"], 0, [], [], "u1", true);
    expect(profile.getWeightedSeeds).toHaveBeenCalledWith("u1", expect.any(Number));
    expect(wiki.getRelatedTitles).toHaveBeenCalledWith(
      expect.arrayContaining(["ProfileSeed", "Page"]),
      "en",
    );
  });

  it("excludes server-side seen titles even when the client sends no exclude", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = makeService(makeWikipediaMock(getSummary), emptyProfile(), emptySeen([TITLES[0], TITLES[1]]));

    const res = await service.getFeed("popular", "en", undefined, [], 0, [], [], "u1");

    expect(res.items.map((a) => a.id)).toEqual([TITLES[2], TITLES[3], TITLES[4], TITLES[5], TITLES[6]]);
  });

  it("weaves a small dose of followed-accounts' picks into the personalized feed", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const wiki = makeWikipediaMock(getSummary);
    const social = emptySocial(["FollowedPick"]);
    const service = makeService(wiki, emptyProfile(), emptySeen(), social);

    const ids = (await service.getFeed("forYou", "en", undefined, ["Seed"], 0, [], [], "u1", true)).items.map(
      (a) => a.id,
    );

    expect(social.getFollowedTitles).toHaveBeenCalledWith("u1", expect.any(Number));
    expect(ids).toContain("FollowedPick");
    expect(ids[0]).not.toBe("FollowedPick"); // never the first slot
  });

  it("does not pull social picks for a page-anchored feed", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const social = emptySocial(["FollowedPick"]);
    const service = makeService(makeWikipediaMock(getSummary), emptyProfile(), emptySeen(), social);

    await service.getFeed("forYou", "en", undefined, ["Page"], 0, [], [], "u1", false);

    expect(social.getFollowedTitles).not.toHaveBeenCalled();
  });

  it("reorders deterministically with a seed", async () => {
    const getSummary = jest.fn(async (t: string) => fakeArticle(t));
    const service = makeService(makeWikipediaMock(getSummary));

    const first = (await service.getFeed("popular", "en", undefined, [], 123)).items.map((a) => a.id);
    const same = (await service.getFeed("popular", "en", undefined, [], 123)).items.map((a) => a.id);
    const other = (await service.getFeed("popular", "en", undefined, [], 999)).items.map((a) => a.id);

    expect(same).toEqual(first); // same seed → same order
    expect(other).not.toEqual(first); // different seed → different order
  });
});

describe("weaveSocial", () => {
  const pool = Array.from({ length: 10 }, (_, i) => `P${i}`);

  it("inserts one social pick per period at the given offset", () => {
    const out = weaveSocial(pool, ["S0", "S1"], 5, 2);
    expect(out[2]).toBe("S0"); // 3rd slot of the first page
    expect(out[8]).toBe("S1"); // 3rd slot of the second page (shifted by one insert)
    expect(out[0]).toBe("P0"); // first slot untouched
  });

  it("skips social picks already present in the pool", () => {
    const out = weaveSocial(["A", "B", "C"], ["B"], 5, 2);
    expect(out).toEqual(["A", "B", "C"]); // "B" already there → nothing woven
  });

  it("appends leftover picks when the pool is shorter than the cadence", () => {
    expect(weaveSocial(["A"], ["S0"], 5, 2)).toEqual(["A", "S0"]);
  });
});

describe("capRelatedByWeight", () => {
  const liked = Array.from({ length: 10 }, (_, i) => `L${i}`);
  const saved = Array.from({ length: 10 }, (_, i) => `S${i}`);

  it("caps saved-related to its 2:5 share of liked-related", () => {
    const out = capRelatedByWeight(liked, saved, 5, 2);
    // All 10 liked kept; saved capped at floor(10 * 2/5) = 4.
    expect(out.filter((t) => t.startsWith("L"))).toHaveLength(10);
    expect(out.filter((t) => t.startsWith("S"))).toHaveLength(4);
  });

  it("falls back to the available side when the other is empty", () => {
    expect(capRelatedByWeight([], saved, 5, 2)).toEqual(saved);
    expect(capRelatedByWeight(liked, [], 5, 2)).toEqual(liked);
  });

  it("dedupes with liked winning ties", () => {
    // cap = floor(5 * 2/5) = 2 → saved contributes ["E", "F"]; "E" already in
    // liked so it collapses (liked wins), "F" is appended.
    const out = capRelatedByWeight(["A", "B", "C", "D", "E"], ["E", "F", "G"], 5, 2);
    expect(out).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});
