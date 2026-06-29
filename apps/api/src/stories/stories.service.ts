import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { In, MoreThan, type Repository } from "typeorm";
import type { CreateStoryRequest, StoryGroup } from "@flowpedia/shared";
import { DatabaseService } from "../database/database.service";
import { User } from "../auth/user.entity";
import { FollowService } from "../social/follow.service";
import { Story } from "./story.entity";

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

/** Reshares ("stories"): an article a user pushes to their followers for 24h. */
@Injectable()
export class StoriesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly follows: FollowService,
  ) {}

  private stories(): Repository<Story> {
    const repo = this.db.repo(Story);
    if (!repo) {
      throw new ServiceUnavailableException("Stories require a database (DATABASE_URL).");
    }
    return repo;
  }

  async create(userId: string, body: CreateStoryRequest): Promise<void> {
    if (!body?.articleId) {
      return;
    }
    const repo = this.stories();
    // Resharing the same article refreshes its recency (one bubble per article).
    await repo.delete({ userId, articleId: body.articleId });
    await repo.insert({
      userId,
      articleId: body.articleId,
      title: body.title ?? null,
      image: body.image ?? null,
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.stories().delete({ id, userId });
  }

  /** Active (≤24h) stories from the people the viewer follows, plus their own,
   *  grouped by author and ordered by most-recent-first. */
  async feed(userId: string): Promise<StoryGroup[]> {
    const cutoff = new Date(Date.now() - STORY_TTL_MS);
    const authorIds = [...new Set([userId, ...(await this.follows.followingIds(userId))])];

    const rows = await this.stories().find({
      where: { userId: In(authorIds), createdAt: MoreThan(cutoff) },
      order: { createdAt: "DESC" },
    });
    if (!rows.length) {
      return [];
    }

    const userRepo = this.db.repo(User);
    const users = userRepo ? await userRepo.find({ where: { id: In(authorIds) } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const groups = new Map<string, StoryGroup>();
    for (const row of rows) {
      const author = byId.get(row.userId);
      if (!author) {
        continue;
      }
      let group = groups.get(row.userId);
      if (!group) {
        group = {
          user: {
            id: author.id,
            username: author.username,
            displayName: author.displayName,
            isPrivate: author.isPrivate,
          },
          items: [],
        };
        groups.set(row.userId, group);
      }
      group.items.push({
        id: row.id,
        articleId: row.articleId,
        title: row.title ?? undefined,
        image: row.image ?? undefined,
        createdAt: row.createdAt.toISOString(),
      });
    }
    // Map insertion order follows the createdAt-DESC rows, so groups are already
    // ordered by most-recent story first.
    return [...groups.values()];
  }

  /** A single author's active (≤24h) stories, if the viewer is allowed to see
   *  them (self, public account, or an active follower). Returns null when the
   *  user is unknown, private-and-not-followed, or has no active story. Powers
   *  the "tap a profile avatar to watch their stories" entry point. */
  async userFeed(viewerId: string, username: string): Promise<StoryGroup | null> {
    const userRepo = this.db.repo(User);
    if (!userRepo) {
      return null;
    }
    const target = await userRepo.findOne({ where: { username } });
    if (!target) {
      return null;
    }
    const allowed =
      target.id === viewerId ||
      !target.isPrivate ||
      (await this.follows.followingIds(viewerId)).includes(target.id);
    if (!allowed) {
      return null;
    }

    const cutoff = new Date(Date.now() - STORY_TTL_MS);
    const rows = await this.stories().find({
      where: { userId: target.id, createdAt: MoreThan(cutoff) },
      order: { createdAt: "DESC" },
    });
    if (!rows.length) {
      return null;
    }

    return {
      user: {
        id: target.id,
        username: target.username,
        displayName: target.displayName,
        isPrivate: target.isPrivate,
      },
      items: rows.map((row) => ({
        id: row.id,
        articleId: row.articleId,
        title: row.title ?? undefined,
        image: row.image ?? undefined,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
