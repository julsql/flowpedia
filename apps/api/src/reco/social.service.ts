import { Injectable, Logger } from "@nestjs/common";
import { In } from "typeorm";
import { DatabaseService } from "../database/database.service";
import { Follow } from "../social/follow.entity";
import { LibraryItem } from "../library/library-item.entity";
import { Story } from "../stories/story.entity";

const FOLLOW_KINDS = ["like", "save", "share"];

/**
 * Social recall (§2.6): pages the accounts you follow liked, saved, shared or
 * reshared as a story — a little "common ground" the feed weaves in sparingly.
 * Ranked by social proof (how many distinct followed accounts engaged). Empty
 * without a database, a user, or any follows.
 */
@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Titles engaged by the accounts `userId` follows, most-corroborated first. */
  async getFollowedTitles(userId: string | undefined, limit: number): Promise<string[]> {
    if (!userId) {
      return [];
    }
    const followRepo = this.db.repo(Follow);
    const libRepo = this.db.repo(LibraryItem);
    const storyRepo = this.db.repo(Story);
    if (!followRepo || !libRepo) {
      return [];
    }
    try {
      const follows = await followRepo.find({ where: { followerId: userId, status: "active" } });
      const followingIds = follows.map((f) => f.followingId);
      if (!followingIds.length) {
        return [];
      }

      const [libRows, storyRows] = await Promise.all([
        libRepo.find({ where: { userId: In(followingIds), kind: In(FOLLOW_KINDS) } }),
        storyRepo ? storyRepo.find({ where: { userId: In(followingIds) } }) : Promise.resolve([]),
      ]);

      // Social proof: distinct followed accounts that engaged each article.
      const proof = new Map<string, Set<string>>();
      const record = (articleId: string, uid: string) => {
        const set = proof.get(articleId) ?? new Set<string>();
        set.add(uid);
        proof.set(articleId, set);
      };
      for (const r of libRows) {
        record(r.articleId, r.userId);
      }
      for (const r of storyRows) {
        record(r.articleId, r.userId);
      }

      return [...proof.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, limit)
        .map(([articleId]) => articleId);
    } catch (err) {
      this.logger.warn(`social recall failed for ${userId}: ${String(err)}`);
      return [];
    }
  }
}
