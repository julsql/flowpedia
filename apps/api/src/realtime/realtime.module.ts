import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  imports: [AuthModule], // JwtModule/JwtService for the handshake
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
