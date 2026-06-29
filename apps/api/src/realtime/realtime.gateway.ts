import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

/**
 * Pushes live events to connected clients. On connect, the socket authenticates
 * with its JWT (same token as the REST API) and joins a private `user:<id>` room;
 * services then emit to that room so a user only receives their own events.
 */
@WebSocketGateway({ cors: { origin: "*" } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket): void {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);
    try {
      const payload = this.jwt.verify<{ sub: string }>(token ?? "");
      void client.join(`user:${payload.sub}`);
    } catch {
      // Bad/missing token → no room; drop the connection.
      client.disconnect();
    }
  }

  /** Emit an event to every live socket of one user. No-op if the server is down. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
