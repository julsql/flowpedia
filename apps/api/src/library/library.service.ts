import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Repository } from "typeorm";
import type { LibraryKind, LibrarySnapshot } from "@flowpedia/shared";
import { DatabaseService } from "../database/database.service";
import { LibraryItem } from "./library-item.entity";

const KINDS: LibraryKind[] = ["like", "save", "share", "read"];

/** Per-account library persistence: the saved entries that feed each account's
 *  own recommendation algorithm and (later) resharing. */
@Injectable()
export class LibraryService {
  constructor(private readonly db: DatabaseService) {}

  private repo(): Repository<LibraryItem> {
    const repo = this.db.repo(LibraryItem);
    if (!repo) {
      throw new ServiceUnavailableException(
        "Library requires a database. Set DATABASE_URL (pnpm infra:up).",
      );
    }
    return repo;
  }

  async list(userId: string): Promise<LibrarySnapshot> {
    const rows = await this.repo().find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
    const pick = (kind: LibraryKind) => rows.filter((r) => r.kind === kind).map((r) => r.articleId);
    return { liked: pick("like"), saved: pick("save"), shared: pick("share"), read: pick("read") };
  }

  async add(userId: string, articleId: string, kind: LibraryKind): Promise<void> {
    if (!articleId || !KINDS.includes(kind)) {
      return;
    }
    // Idempotent: the unique (userId, articleId, kind) index makes a repeat a no-op.
    await this.repo()
      .createQueryBuilder()
      .insert()
      .values({ userId, articleId, kind })
      .orIgnore()
      .execute();
  }

  async remove(userId: string, articleId: string, kind: LibraryKind): Promise<void> {
    await this.repo().delete({ userId, articleId, kind });
  }

  /** Bulk add (reconciling a device's local library on sign-in), idempotent. */
  async addMany(userId: string, items: { articleId: string; kind: LibraryKind }[]): Promise<void> {
    const values = items
      .filter((i) => i.articleId && KINDS.includes(i.kind))
      .map((i) => ({ userId, articleId: i.articleId, kind: i.kind }));
    if (!values.length) {
      return;
    }
    await this.repo().createQueryBuilder().insert().values(values).orIgnore().execute();
  }

  /** Clear a whole kind for a user (e.g. wipe the reading history). */
  async clearKind(userId: string, kind: LibraryKind): Promise<void> {
    if (!KINDS.includes(kind)) {
      return;
    }
    await this.repo().delete({ userId, kind });
  }
}
