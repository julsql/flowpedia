import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SocialModule } from "../social/social.module";
import { StoriesController } from "./stories.controller";
import { StoriesService } from "./stories.service";

@Module({
  imports: [AuthModule, SocialModule], // JwtAuthGuard + FollowService.followingIds()
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
