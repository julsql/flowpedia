import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthPrincipal } from "./jwt-auth.guard";

/** Injects the authenticated principal set by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal | undefined => {
    return context.switchToHttp().getRequest().user;
  },
);
