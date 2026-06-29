import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Repository } from "typeorm";
import type { LibraryKind, LibrarySnapshot } from "@flowpedia/shared";
import { DatabaseService } from "../database/database.service";
import { LibraryItem } from "./library-item.entity";

const KINDS: LibraryKind[] = ["like", "save", "share"];

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
    return { liked: pick("like"), saved: pick("save"), shared: pick("share") };
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
}
