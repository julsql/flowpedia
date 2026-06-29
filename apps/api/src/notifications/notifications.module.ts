import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";

@Module({
  imports: [AuthModule, RealtimeModule], // JwtAuthGuard + live emit
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService], // social + messages emit notifications
})
export class NotificationsModule {}
