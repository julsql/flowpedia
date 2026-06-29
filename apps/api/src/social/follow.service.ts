import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { In, type Repository } from "typeorm";
import type { FollowResult, FollowState, ProfileView, PublicUser } from "@flowpedia/shared";
import { DatabaseService } from "../database/database.service";
import { User } from "../auth/user.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { Follow } from "./follow.entity";

function toPublic(u: User): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, isPrivate: u.isPrivate };
}

/** The follow graph: following (incl. approval for private accounts), follower/
 *  following lists, pending requests, and privacy-aware public profiles. */
@Injectable()
export class FollowService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  private users(): Repository<User> {
    const repo = this.db.repo(User);
    if (!repo) {
      throw new ServiceUnavailableException("Social features require a database (DATABASE_URL).");
    }
    return repo;
  }

  private follows(): Repository<Follow> {
    const repo = this.db.repo(Follow);
    if (!repo) {
      throw new ServiceUnavailableException("Social features require a database (DATABASE_URL).");
    }
    return repo;
  }

  private async requireUser(username: string): Promise<User> {
    const user = await this.users().findOne({
      where: { username: (username ?? "").trim().toLowerCase() },
    });
    if (!user) {
      throw new NotFoundException("Account not found.");
    }
    return user;
  }

  async follow(viewerId: string, username: string): Promise<FollowResult> {
    const target = await this.requireUser(username);
    if (target.id === viewerId) {
      throw new ConflictException("You can't follow yourself.");
    }
    const repo = this.follows();
    const existing = await repo.findOne({
      where: { followerId: viewerId, followingId: target.id },
    });
    if (existing) {
      return { state: existing.status as FollowState };
    }
    const status = target.isPrivate ? "pending" : "active";
    await repo.insert({ followerId: viewerId, followingId: target.id, status });
    // Notify the target: a request to approve (private) or a new follower (public).
    await this.notifications.notify({
      recipientId: target.id,
      actorId: viewerId,
      type: status === "pending" ? "follow_request" : "follower",
    });
    return { state: status as FollowState };
  }

  async unfollow(viewerId: string, username: string): Promise<FollowResult> {
    const target = await this.requireUser(username);
    await this.follows().delete({ followerId: viewerId, followingId: target.id });
    return { state: "none" };
  }

  /** The signed-in user drops one of their own followers. */
  async removeFollower(viewerId: string, username: string): Promise<void> {
    const follower = await this.requireUser(username);
    await this.follows().delete({ followerId: follower.id, followingId: viewerId });
  }

  async acceptRequest(viewerId: string, username: string): Promise<void> {
    const follower = await this.requireUser(username);
    const result = await this.follows().update(
      { followerId: follower.id, followingId: viewerId, status: "pending" },
      { status: "active" },
    );
    // Only notify when a pending request was actually approved.
    if (result.affected) {
      await this.notifications.notify({
        recipientId: follower.id,
        actorId: viewerId,
        type: "follow_accepted",
      });
    }
  }

  async rejectRequest(viewerId: string, username: string): Promise<void> {
    const follower = await this.requireUser(username);
    await this.follows().delete({
      followerId: follower.id,
      followingId: viewerId,
      status: "pending",
    });
  }

  async followers(viewerId: string, username: string): Promise<PublicUser[]> {
    const target = await this.requireUser(username);
    if (!(await this.canView(viewerId, target))) {
      return [];
    }
    const rows = await this.follows().find({
      where: { followingId: target.id, status: "active" },
      order: { createdAt: "DESC" },
    });
    return this.usersByIds(rows.map((r) => r.followerId));
  }

  async following(viewerId: string, username: string): Promise<PublicUser[]> {
    const target = await this.requireUser(username);
    if (!(await this.canView(viewerId, target))) {
      return [];
    }
    const rows = await this.follows().find({
      where: { followerId: target.id, status: "active" },
      order: { createdAt: "DESC" },
    });
    return this.usersByIds(rows.map((r) => r.followingId));
  }

  /** Incoming follow requests awaiting the viewer's approval. */
  async requests(viewerId: string): Promise<PublicUser[]> {
    const rows = await this.follows().find({
      where: { followingId: viewerId, status: "pending" },
      order: { createdAt: "DESC" },
    });
    return this.usersByIds(rows.map((r) => r.followerId));
  }

  async search(viewerId: string, q: string): Promise<PublicUser[]> {
    const term = (q ?? "").trim().toLowerCase();
    if (!term) {
      return [];
    }
    const users = await this.users()
      .createQueryBuilder("u")
      .where("(LOWER(u.username) LIKE :t OR LOWER(u.displayName) LIKE :t)", { t: `%${term}%` })
      .andWhere("u.id != :viewer", { viewer: viewerId })
      .orderBy("u.username", "ASC")
      .limit(20)
      .getMany();
    return users.map(toPublic);
  }

  async profile(viewerId: string, username: string): Promise<ProfileView> {
    const target = await this.requireUser(username);
    const repo = this.follows();
    const [followers, following, viewerEdge, reverseEdge] = await Promise.all([
      repo.count({ where: { followingId: target.id, status: "active" } }),
      repo.count({ where: { followerId: target.id, status: "active" } }),
      repo.findOne({ where: { followerId: viewerId, followingId: target.id } }),
      repo.findOne({ where: { followerId: target.id, followingId: viewerId, status: "active" } }),
    ]);
    const state = (viewerEdge?.status as FollowState) ?? "none";
    const isSelf = target.id === viewerId;
    return {
      user: toPublic(target),
      followers,
      following,
      state,
      followsYou: Boolean(reverseEdge),
      isSelf,
      canViewContent: isSelf || !target.isPrivate || state === "active",
    };
  }

  /** Whether the viewer may see a (possibly private) account's content. */
  private async canView(viewerId: string, target: User): Promise<boolean> {
    if (!target.isPrivate || target.id === viewerId) {
      return true;
    }
    const edge = await this.follows().findOne({
      where: { followerId: viewerId, followingId: target.id, status: "active" },
    });
    return Boolean(edge);
  }

  private async usersByIds(ids: string[]): Promise<PublicUser[]> {
    if (!ids.length) {
      return [];
    }
    const users = await this.users().find({ where: { id: In(ids) } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return ids
      .map((id) => byId.get(id))
      .filter((u): u is User => Boolean(u))
      .map(toPublic);
  }

  /** Active-follow ids of the people the user follows — used by the stories feed. */
  async followingIds(userId: string): Promise<string[]> {
    const rows = await this.follows().find({
      where: { followerId: userId, status: "active" },
    });
    return rows.map((r) => r.followingId);
  }
}
