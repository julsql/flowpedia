import { EmbeddingService } from "./embedding.service";
import { DatabaseService } from "../database/database.service";
import { ConfigService } from "@nestjs/config";
import { ArticleEmbedding } from "./article-embedding.entity";

function service(opts: { enabled: boolean; rows?: Partial<ArticleEmbedding>[]; hasDb?: boolean }) {
  const store: Partial<ArticleEmbedding>[] = [...(opts.rows ?? [])];
  const repo = {
    find: jest.fn(async () => store),
    upsert: jest.fn(async (row: Partial<ArticleEmbedding>) => {
      store.push(row);
    }),
  };
  const db = {
    repo: jest.fn(() => (opts.hasDb === false ? undefined : repo)),
  } as unknown as DatabaseService;
  const config = {
    get: jest.fn((k: string) => (k === "RECO_EMBEDDINGS" && opts.enabled ? "1" : undefined)),
  } as unknown as ConfigService;
  return { svc: new EmbeddingService(db, config), repo };
}

describe("EmbeddingService", () => {
  it("returns nulls when disabled", async () => {
    const { svc } = service({ enabled: false });
    expect(await svc.embed([{ articleId: "A", text: "hi" }], "en")).toEqual([null]);
  });

  it("returns nulls with no database", async () => {
    const { svc } = service({ enabled: true, hasDb: false });
    svc.setEmbedder(async (t) => t.map(() => [1, 0]));
    expect(await svc.embed([{ articleId: "A", text: "hi" }], "en")).toEqual([null]);
  });

  it("computes, caches and returns vectors via the injected embedder", async () => {
    const { svc, repo } = service({ enabled: true });
    const embedder = jest.fn(async (texts: string[]) => texts.map((_, i) => [i + 1, 0]));
    svc.setEmbedder(embedder);

    const out = await svc.embed([{ articleId: "A", text: "a" }, { articleId: "B", text: "b" }], "en");
    expect(out).toEqual([[1, 0], [2, 0]]);
    expect(repo.upsert).toHaveBeenCalledTimes(2);
  });

  it("serves cached vectors without calling the embedder", async () => {
    const { svc } = service({ enabled: true, rows: [{ articleId: "A", lang: "en", model: "Xenova/multilingual-e5-small", vec: [9, 9] }] });
    const embedder = jest.fn(async (texts: string[]) => texts.map(() => [0, 0]));
    svc.setEmbedder(embedder);

    const out = await svc.embed([{ articleId: "A", text: "a" }], "en");
    expect(out).toEqual([[9, 9]]);
    expect(embedder).not.toHaveBeenCalled();
  });

  it("returns null for a miss when no embedder is available", async () => {
    const { svc } = service({ enabled: true });
    svc.setEmbedder(null);
    expect(await svc.embed([{ articleId: "A", text: "a" }], "en")).toEqual([null]);
  });
});
