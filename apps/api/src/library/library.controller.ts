import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import type { LibraryItemRequest, LibrarySnapshot } from "@flowpedia/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthPrincipal } from "../auth/jwt-auth.guard";
import { LibraryService } from "./library.service";

@UseGuards(JwtAuthGuard)
@Controller("library")
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  list(@CurrentUser() principal: AuthPrincipal): Promise<LibrarySnapshot> {
    return this.library.list(principal.id);
  }

  @Post()
  @HttpCode(204)
  add(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: LibraryItemRequest,
  ): Promise<void> {
    return this.library.add(principal.id, body.articleId, body.kind);
  }

  @Delete()
  @HttpCode(204)
  remove(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: LibraryItemRequest,
  ): Promise<void> {
    return this.library.remove(principal.id, body.articleId, body.kind);
  }
}
