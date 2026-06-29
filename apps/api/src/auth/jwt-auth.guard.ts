import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

/** The authenticated principal attached to the request by JwtAuthGuard. */
export interface AuthPrincipal {
  id: string;
}

/** Guards a route with a `Authorization: Bearer <jwt>` check. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException("Missing bearer token.");
    }
    try {
      const payload = this.jwt.verify<{ sub: string }>(token);
      req.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
  }
}
