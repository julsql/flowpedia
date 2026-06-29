import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import type { CreateStoryRequest, StoryGroup } from "@flowpedia/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthPrincipal } from "../auth/jwt-auth.guard";
import { StoriesService } from "./stories.service";

@UseGuards(JwtAuthGuard)
@Controller("stories")
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get()
  feed(@CurrentUser() me: AuthPrincipal): Promise<StoryGroup[]> {
    return this.stories.feed(me.id);
  }

  @Get("u/:username")
  userFeed(
    @CurrentUser() me: AuthPrincipal,
    @Param("username") username: string,
  ): Promise<StoryGroup | null> {
    return this.stories.userFeed(me.id, username);
  }

  @Post()
  @HttpCode(204)
  create(@CurrentUser() me: AuthPrincipal, @Body() body: CreateStoryRequest): Promise<void> {
    return this.stories.create(me.id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() me: AuthPrincipal, @Param("id") id: string): Promise<void> {
    return this.stories.remove(me.id, id);
  }
}
