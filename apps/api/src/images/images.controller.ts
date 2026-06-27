import { BadRequestException, Controller, Get, Logger, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";

// Only proxy Wikimedia-hosted images (prevents an open proxy / SSRF).
const ALLOWED_HOST = /(^|\.)(wikimedia\.org|wikipedia\.org)$/i;

/**
 * Image proxy. Devices often can't load Wikimedia images directly (User-Agent
 * policy 403s, or no direct internet route), but they can always reach this
 * API — so we fetch the image here (with a compliant UA) and stream it back.
 */
@Controller("image")
export class ImagesController {
  private readonly logger = new Logger(ImagesController.name);

  constructor(private readonly config: ConfigService) {}

  @Get()
  async proxy(@Query("u") u: string | undefined, @Res() res: Response): Promise<void> {
    if (!u) {
      throw new BadRequestException("missing url");
    }
    let url: URL;
    try {
      url = new URL(u);
    } catch {
      throw new BadRequestException("bad url");
    }
    if (url.protocol !== "https:" || !ALLOWED_HOST.test(url.hostname)) {
      throw new BadRequestException("host not allowed");
    }

    const ua = this.config.get<string>("WIKIPEDIA_USER_AGENT", "Flowpedia/1.0 (dev)");
    try {
      const upstream = await fetch(url.toString(), {
        headers: { "User-Agent": ua, "Api-User-Agent": ua },
      });
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buffer);
    } catch (err) {
      this.logger.warn(`image proxy failed for ${u}: ${String(err)}`);
      res.status(502).end();
    }
  }
}
