import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import type { SendPageRequest, SentPageItem } from "@flowpedia/shared";
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
