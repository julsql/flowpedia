import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { In } from "typeorm";
import { DatabaseService } from "../database/database.service";
import { ArticleEmbedding } from "./article-embedding.entity";
import type { Vec } from "./vector";

/** Turns texts into vectors. Injectable so tests supply a deterministic fake. */
export type Embedder = (texts: string[]) => Promise<number[][]>;

// Local multilingual model (384-dim). Prefix-free use is fine for our ranking.
const DEFAULT_MODEL = "Xenova/multilingual-e5-small";

/**
 * Article embeddings with a persistent cache (§5). Everything degrades
 * gracefully: embeddings are OFF unless `RECO_EMBEDDINGS=1` *and* the local model
 * loads *and* a database is present — otherwise every method returns null/[] and
 * the feed falls back to its Phase 1 (lexical) ranking. The model is loaded
 * lazily on first use and never blocks startup.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly model = DEFAULT_MODEL;
  // undefined = not yet attempted, null = unavailable, fn = ready.
  private embedder?: Embedder | null;
  private loading?: Promise<Embedder | null>;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  /** Test/DI hook to inject a deterministic embedder (bypasses the model load). */
  setEmbedder(fn: Embedder | null): void {
    this.embedder = fn;
  }

  get enabled(): boolean {
    return this.config.get<string>("RECO_EMBEDDINGS") === "1";
  }

  /**
   * Embeddings for a set of articles, in input order, using the cache and
   * computing+storing the misses. Returns [] when embeddings are unavailable.
   */
  async embed(
    items: { articleId: string; text: string }[],
    lang: string,
  ): Promise<(Vec | null)[]> {
    if (!items.length || !this.enabled) {
      return items.map(() => null);
    }
    const repo = this.db.repo(ArticleEmbedding);
    if (!repo) {
      return items.map(() => null);
    }

    // Load cached rows.
    const cached = new Map<string, Vec>();
    try {
      const ids = items.map((i) => i.articleId);
      const rows = await repo.find({ where: { articleId: In(ids), lang, model: this.model } });
      for (const r of rows) {
        cached.set(r.articleId, r.vec);
      }
    } catch (err) {
      this.logger.warn(`embedding cache read failed: ${String(err)}`);
    }

    const misses = items.filter((i) => !cached.has(i.articleId));
    if (misses.length) {
      const embedder = await this.getEmbedder();
      if (embedder) {
        try {
          const vecs = await embedder(misses.map((m) => m.text));
          await Promise.all(
            misses.map(async (m, i) => {
              const vec = vecs[i];
              if (vec?.length) {
                cached.set(m.articleId, vec);
                await repo
                  .upsert(
                    { articleId: m.articleId, lang, model: this.model, dim: vec.length, vec },
                    ["articleId", "lang", "model"],
                  )
                  .catch(() => undefined);
              }
            }),
          );
        } catch (err) {
          this.logger.warn(`embedding compute failed: ${String(err)}`);
        }
      }
    }

    return items.map((i) => cached.get(i.articleId) ?? null);
  }

  /** Lazily load the local transformers.js pipeline; null if unavailable. */
  private async getEmbedder(): Promise<Embedder | null> {
    if (this.embedder !== undefined) {
      return this.embedder;
    }
    if (!this.loading) {
      this.loading = this.loadEmbedder();
    }
    this.embedder = await this.loading;
    return this.embedder;
  }

  private async loadEmbedder(): Promise<Embedder | null> {
    try {
      // Optional dependency, dynamically imported so the API never fails to
      // build/start without it. Install `@huggingface/transformers` and set
      // RECO_EMBEDDINGS=1 to enable Phase 2.
      const mod: any = await import(/* webpackIgnore: true */ "@huggingface/transformers" as string);
      const pipe = await mod.pipeline("feature-extraction", this.model);
      this.logger.log(`Embedding model loaded: ${this.model}`);
      return async (texts: string[]) => {
        const out = await pipe(texts, { pooling: "mean", normalize: true });
        // transformers.js returns a Tensor; tolist() → number[][].
        return typeof out.tolist === "function" ? out.tolist() : (out as number[][]);
      };
    } catch (err) {
      this.logger.warn(`Embeddings disabled — model unavailable (${String(err)})`);
      return null;
    }
  }
}
