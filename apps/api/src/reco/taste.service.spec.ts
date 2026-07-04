import { TasteService, embedText } from "./taste.service";
import type { ProfileService } from "./profile.service";
import type { WikipediaService } from "../wikipedia/wikipedia.service";
import type { EmbeddingService } from "./embedding.service";
import { cosine } from "./vector";

function service(opts: {
  enabled: boolean;
  engaged?: { articleId: string; weight: number }[];
  vecs?: Record<string, number[]>;
}): TasteService {
  const profile = {
    getEngaged: jest.fn(async () => opts.engaged ?? []),
  } as unknown as ProfileService;
  const wikipedia = {
    normalizeLang: () => "en",
    getSummary: jest.fn(async (id: string) => ({ title: id, category: "c", summary: "s" })),
  } as unknown as WikipediaService;
  const embeddings = {
    enabled: opts.enabled,
    embed: jest.fn(async (items: { articleId: string }[]) =>
      items.map((i) => opts.vecs?.[i.articleId] ?? null),
    ),
  } as unknown as EmbeddingService;
  return new TasteService(profile, wikipedia, embeddings);
}

describe("embedText", () => {
  it("combines title, gloss and summary", () => {
    expect(embedText({ title: "Cat", category: "animal", summary: "a feline" })).toContain("Cat");
  });
});

describe("TasteService.getTaste", () => {
  it("is null when embeddings are disabled", async () => {
    expect(await service({ enabled: false, engaged: [{ articleId: "A", weight: 1 }] }).getTaste("u1")).toBeNull();
  });

  it("is null without engagement", async () => {
    expect(await service({ enabled: true, engaged: [] }).getTaste("u1")).toBeNull();
  });

  it("returns the engagement-weighted mean of article embeddings", async () => {
    const taste = await service({
      enabled: true,
      engaged: [{ articleId: "A", weight: 3 }, { articleId: "B", weight: 1 }],
      vecs: { A: [1, 0], B: [0, 1] },
    }).getTaste("u1");
    expect(taste).not.toBeNull();
    // Heavier weight on A → taste leans toward [1,0].
    expect(cosine(taste!, [1, 0])).toBeGreaterThan(cosine(taste!, [0, 1]));
  });

  it("is null when no embedding could be produced", async () => {
    const taste = await service({ enabled: true, engaged: [{ articleId: "A", weight: 1 }], vecs: {} }).getTaste("u1");
    expect(taste).toBeNull();
  });
});
