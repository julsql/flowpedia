import { io, type Socket } from "socket.io-client";
import { API_ORIGIN } from "../api/client";

/** Live event pushed by the server's RealtimeGateway (the "notification" event). */
export interface LiveEvent {
  type: "follow_request" | "follow_accepted" | "follower" | "page_received";
  actor: { username: string; displayName: string } | null;
  articleId?: string;
  title?: string;
}

let socket: Socket | undefined;

/** Open the authenticated realtime socket and forward each live event. Returns an
 *  unsubscribe that closes the socket. Safe to call repeatedly (reconnects). */
export function connectRealtime(token: string, onEvent: (e: LiveEvent) => void): () => void {
  disconnectRealtime();
  socket = io(API_ORIGIN, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
  });
  socket.on("notification", (payload: LiveEvent) => onEvent(payload));
  return disconnectRealtime;
}

export function disconnectRealtime(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = undefined;
  }
}
