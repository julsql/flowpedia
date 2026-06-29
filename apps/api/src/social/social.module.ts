import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SocialController } from "./social.controller";
import { FollowService } from "./follow.service";

@Module({
  imports: [AuthModule, NotificationsModule], // JwtAuthGuard + follow/accept notifs
  controllers: [SocialController],
  providers: [FollowService],
  exports: [FollowService], // stories feed (PR6) consumes followingIds()
})
export class SocialModule {}
