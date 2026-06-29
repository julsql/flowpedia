import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SocialController } from "./social.controller";
import { FollowService } from "./follow.service";

@Module({
  imports: [AuthModule], // JwtAuthGuard / JwtModule
  controllers: [SocialController],
  providers: [FollowService],
  exports: [FollowService], // stories feed (PR6) consumes followingIds()
})
export class SocialModule {}
