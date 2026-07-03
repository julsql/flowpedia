import { Injectable, Logger } from "@nestjs/common";
import type { InteractionType } from "@flowpedia/shared";
import { In } from "typeorm";
import { DatabaseService } from "../database/database.service";
import { Interaction } from "../events/interaction.entity";
import { SEEN_COOLDOWN_MS, seenWithinCooldown, type SeenRow } from "./seen";

const MAX_SEEN_ROWS = 5000;
const SEEN_TYPES = Object.keys(SEEN_COOLDOWN_MS) as InteractionType[];

/**
 * Server-authoritative "already seen" set (§3, Option A), read from the
 * interaction journal. Cross-device and durable, unlike the client SeenProvider
 * (kept as an offline/guest fast-path). Empty without a database or user.
 */
@Injectable()
export class SeenService {
  private readonly logger = new Logger(SeenService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Titles still within cooldown for this user — exclude them from the feed. */
  async getSeen(userId: string | undefined): Promise<Set<string>> {
    if (!userId) {
      return new Set();
    }
    const repo = this.db.repo(Interaction);
    if (!repo) {
      return new Set();
    }
    try {
      const rows = await repo.find({
        where: { userId, type: In(SEEN_TYPES) },
        order: { ts: "DESC" },
        take: MAX_SEEN_ROWS,
      });
      const seenRows: SeenRow[] = rows.map((r) => ({
        articleId: r.articleId,
        type: r.type as InteractionType,
        ts: Number(r.ts),
      }));
      return seenWithinCooldown(seenRows, Date.now());
    } catch (err) {
      this.logger.warn(`seen load failed for ${userId}: ${String(err)}`);
      return new Set();
    }
  }
}
