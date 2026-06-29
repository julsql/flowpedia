import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({
  imports: [AuthModule, NotificationsModule], // JwtAuthGuard + emit page_received notif
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
