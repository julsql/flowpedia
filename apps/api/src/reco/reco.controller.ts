import { Body, Controller, Delete, Get, Post, Query } from "@nestjs/common";
import { BlockService } from "./block.service";

/**
 * Blocked-topic management for "not interested in this genre" (§2.9). Keyed by
 * the same anonymous userId the client attaches to signals (MVP trust model).
 */
@Controller("reco")
export class RecoController {
  constructor(private readonly block: BlockService) {}

  @Get("blocked")
  async list(@Query("userId") userId?: string): Promise<{ topics: string[] }> {
    const topics = await this.block.getBlocked(userId);
    return { topics: [...topics] };
  }

  @Post("blocked")
  async add(@Body() body: { userId?: string; topic?: string }): Promise<{ ok: boolean }> {
    if (body?.userId && body?.topic) {
      await this.block.block(body.userId, body.topic);
    }
    return { ok: true };
  }

  @Delete("blocked")
  async remove(@Body() body: { userId?: string; topic?: string }): Promise<{ ok: boolean }> {
    if (body?.userId && body?.topic) {
      await this.block.unblock(body.userId, body.topic);
    }
    return { ok: true };
  }
}
