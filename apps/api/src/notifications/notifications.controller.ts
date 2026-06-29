import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import type { NotificationItem, RegisterPushTokenRequest, UnreadCount } from "@flowpedia/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthPrincipal } from "../auth/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() me: AuthPrincipal): Promise<NotificationItem[]> {
    return this.notifications.list(me.id);
  }

  @Get("unread-count")
  async unread(@CurrentUser() me: AuthPrincipal): Promise<UnreadCount> {
    return { count: await this.notifications.unreadCount(me.id) };
  }

  @Post("read")
  @HttpCode(204)
  markAllRead(@CurrentUser() me: AuthPrincipal): Promise<void> {
    return this.notifications.markAllRead(me.id);
  }

  @Post("token")
  @HttpCode(204)
  registerToken(
    @CurrentUser() me: AuthPrincipal,
    @Body() body: RegisterPushTokenRequest,
  ): Promise<void> {
    return this.notifications.registerToken(me.id, body);
  }

  @Post(":id/read")
  @HttpCode(204)
  markRead(@CurrentUser() me: AuthPrincipal, @Param("id") id: string): Promise<void> {
    return this.notifications.markRead(me.id, id);
  }
}
