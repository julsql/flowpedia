import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { FollowResult, ProfileView, PublicUser } from "@flowpedia/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthPrincipal } from "../auth/jwt-auth.guard";
import { FollowService } from "./follow.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class SocialController {
  constructor(private readonly follow: FollowService) {}

  @Get("users")
  search(@CurrentUser() me: AuthPrincipal, @Query("q") q?: string): Promise<PublicUser[]> {
    return this.follow.search(me.id, q ?? "");
  }

  @Get("users/:username")
  profile(
    @CurrentUser() me: AuthPrincipal,
    @Param("username") username: string,
  ): Promise<ProfileView> {
    return this.follow.profile(me.id, username);
  }

  @Post("users/:username/follow")
  @HttpCode(200)
  doFollow(
    @CurrentUser() me: AuthPrincipal,
    @Param("username") username: string,
  ): Promise<FollowResult> {
    return this.follow.follow(me.id, username);
  }

  @Delete("users/:username/follow")
  @HttpCode(200)
  unfollow(
    @CurrentUser() me: AuthPrincipal,
    @Param("username") username: string,
  ): Promise<FollowResult> {
    return this.follow.unfollow(me.id, username);
  }

  @Get("users/:username/followers")
  followers(
    @CurrentUser() me: AuthPrincipal,
    @Param("username") username: string,
  ): Promise<PublicUser[]> {
    return this.follow.followers(me.id, username);
  }

  @Get("users/:username/following")
  following(
    @CurrentUser() me: AuthPrincipal,
    @Param("username") username: string,
  ): Promise<PublicUser[]> {
    return this.follow.following(me.id, username);
  }

  @Delete("followers/:username")
  @HttpCode(204)
  removeFollower(
    @CurrentUser() me: AuthPrincipal,
    @Param("username") username: string,
  ): Promise<void> {
    return this.follow.removeFollower(me.id, username);
  }

  @Get("follow-requests")
  requests(@CurrentUser() me: AuthPrincipal): Promise<PublicUser[]> {
    return this.follow.requests(me.id);
  }

  @Post("follow-requests/:username/accept")
  @HttpCode(204)
  accept(@CurrentUser() me: AuthPrincipal, @Param("username") username: string): Promise<void> {
    return this.follow.acceptRequest(me.id, username);
  }

  @Post("follow-requests/:username/reject")
  @HttpCode(204)
  reject(@CurrentUser() me: AuthPrincipal, @Param("username") username: string): Promise<void> {
    return this.follow.rejectRequest(me.id, username);
  }
}
