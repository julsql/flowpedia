import { Injectable, Logger } from "@nestjs/common";
import type { InteractionType } from "@flowpedia/shared";
import { DatabaseService } from "../database/database.service";
import { Interaction } from "../events/interaction.entity";
import { WikipediaService } from "../wikipedia/wikipedia.service";
import { aggregateEngagement, type EngagedArticle, type SignalRow } from "./profile";

// Bound the work per profile build (keeps a heavy account cheap).
const MAX_SIGNALS = 3000; // most recent interactions considered
const MAX_AFFINITY_ARTICLES = 25; // top engaged articles we fetch categories for

/** A user's derived taste, in the category space (Phase 1, pre-embeddings). */
export interface CategoryAffinity {
  /** Category (localized "Cat:" title) → accumulated weight, most-affine first. */
  entries: { category: string; weight: number }[];
}

/**
 * Derives a per-user taste profile from the append-only interaction journal
 * (§2.2). Everything degrades gracefully: with no database (or an empty history)
 * the methods return empty, and the feed falls back to its non-personalized pool.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly wikipedia: WikipediaService,
  ) {}

  /** Most-engaged article titles, best first — the recall seeds for `morelike`. */
  async getWeightedSeeds(userId: string | undefined, limit: number): Promise<string[]> {
    const engaged = await this.engagedArticles(userId);
    return engaged.slice(0, limit).map((a) => a.articleId);
  }

  /** Engaged articles with weights, best first (for the embedding taste vector). */
  async getEngaged(userId: string | undefined): Promise<EngagedArticle[]> {
    return this.engagedArticles(userId);
  }

  /**
   * Category affinity built from the top engaged articles' topical categories,
   * each contributing its article weight. Used both as a recall source
   * (categorymembers of the top categories) and as a ranking feature.
   */
  async getCategoryAffinity(
    userId: string | undefined,
    lang?: string,
  ): Promise<CategoryAffinity> {
    const engaged = (await this.engagedArticles(userId)).slice(0, MAX_AFFINITY_ARTICLES);
    if (!engaged.length) {
      return { entries: [] };
    }

    const catLists = await Promise.all(
      engaged.map((a) => this.wikipedia.getTopicalCategories(a.articleId, lang).catch(() => [])),
    );

    const weights = new Map<string, number>();
    engaged.forEach((a, i) => {
      for (const cat of catLists[i]) {
        weights.set(cat, (weights.get(cat) ?? 0) + a.weight);
      }
    });

    const entries = [...weights.entries()]
      .map(([category, weight]) => ({ category, weight }))
      .sort((x, y) => y.weight - x.weight);
    return { entries };
  }

  /** Load + aggregate the journal for a user (empty without a DB / user). */
  private async engagedArticles(userId: string | undefined): Promise<EngagedArticle[]> {
    if (!userId) {
      return [];
    }
    const repo = this.db.repo(Interaction);
    if (!repo) {
      return [];
    }
    try {
      const rows = await repo.find({
        where: { userId },
        order: { ts: "DESC" },
        take: MAX_SIGNALS,
      });
      const signals: SignalRow[] = rows.map((r) => ({
        articleId: r.articleId,
        type: r.type as InteractionType,
        value: r.value,
        ts: Number(r.ts),
      }));
      return aggregateEngagement(signals, Date.now());
    } catch (err) {
      this.logger.warn(`profile load failed for ${userId}: ${String(err)}`);
      return [];
    }
  }
}
