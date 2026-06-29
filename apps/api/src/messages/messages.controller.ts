import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  ConversationMessage,
  ConversationSummary,
  PublicUser,
  SendPageRequest,
  SentPageItem,
  UnreadCount,
} from "@flowpedia/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthPrincipal } from "../auth/jwt-auth.guard";
import { MessagesService } from "./messages.service";

@UseGuards(JwtAuthGuard)
@Controller("messages")
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  inbox(@CurrentUser() me: AuthPrincipal): Promise<SentPageItem[]> {
    return this.messages.inbox(me.id);
  }

  @Get("threads")
  threads(@CurrentUser() me: AuthPrincipal): Promise<ConversationSummary[]> {
    return this.messages.threads(me.id);
  }

  @Get("unread-count")
  async unread(@CurrentUser() me: AuthPrincipal): Promise<UnreadCount> {
    return { count: await this.messages.unreadCount(me.id) };
  }

  @Get("top-contacts")
  topContacts(
    @CurrentUser() me: AuthPrincipal,
    @Query("limit") limit?: string,
  ): Promise<PublicUser[]> {
    const n = Math.min(Math.max(Number(limit) || 5, 1), 10);
    return this.messages.topContacts(me.id, n);
  }

  @Get("with/:username")
  thread(
    @CurrentUser() me: AuthPrincipal,
    @Param("username") username: string,
  ): Promise<ConversationMessage[]> {
    return this.messages.thread(me.id, username);
  }

  @Post()
  @HttpCode(204)
  send(@CurrentUser() me: AuthPrincipal, @Body() body: SendPageRequest): Promise<void> {
    return this.messages.send(me.id, body);
  }

  @Post(":id/read")
  @HttpCode(204)
  markRead(@CurrentUser() me: AuthPrincipal, @Param("id") id: string): Promise<void> {
    return this.messages.markRead(me.id, id);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() me: AuthPrincipal, @Param("id") id: string): Promise<void> {
    return this.messages.remove(me.id, id);
  }
}
