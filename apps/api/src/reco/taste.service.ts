import { Injectable } from "@nestjs/common";
import type { Article } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";
import { ProfileService } from "./profile.service";
import { EmbeddingService } from "./embedding.service";
import { weightedMean, type Vec } from "./vector";

// Only the top engaged articles feed the taste vector (bounded fan-out).
const MAX_TASTE_ARTICLES = 20;

/** Text representation embedded for an article (title + gloss + summary). */
export function embedText(a: Pick<Article, "title" | "category" | "summary">): string {
  return `${a.title}. ${a.category}. ${a.summary}`.slice(0, 1000);
}

/**
 * The user's taste vector (§2.3/§5): the recency-decayed, engagement-weighted
 * mean of the embeddings of the articles they engaged with. Null when embeddings
 * are unavailable or there's nothing to build it from — the feed then keeps its
 * Phase 1 ranking.
 */
@Injectable()
export class TasteService {
  constructor(
    private readonly profile: ProfileService,
    private readonly wikipedia: WikipediaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async getTaste(userId: string | undefined, lang?: string): Promise<Vec | null> {
    if (!this.embeddings.enabled) {
      return null;
    }
    const engaged = (await this.profile.getEngaged(userId)).slice(0, MAX_TASTE_ARTICLES);
    if (!engaged.length) {
      return null;
    }

    const summaries = await Promise.allSettled(
      engaged.map((e) => this.wikipedia.getSummary(e.articleId, lang)),
    );
    const inputs: { articleId: string; text: string }[] = [];
    const weights: number[] = [];
    engaged.forEach((e, i) => {
      const r = summaries[i];
      if (r.status === "fulfilled") {
        inputs.push({ articleId: e.articleId, text: embedText(r.value) });
        weights.push(e.weight);
      }
    });
    if (!inputs.length) {
      return null;
    }

    const vecs = await this.embeddings.embed(inputs, this.wikipedia.normalizeLang(lang));
    const okVecs: Vec[] = [];
    const okWeights: number[] = [];
    vecs.forEach((v, i) => {
      if (v) {
        okVecs.push(v);
        okWeights.push(weights[i]);
      }
    });
    if (!okVecs.length) {
      return null;
    }
    return weightedMean(okVecs, okWeights);
  }
}
