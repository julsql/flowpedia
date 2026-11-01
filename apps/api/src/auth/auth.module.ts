import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtSignOptions } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET", "flowpedia-dev-secret-change-me"),
        signOptions: {
          // A vercel/ms duration ("30d", "12h") or a number of seconds.
          expiresIn: config.get("JWT_EXPIRES_IN", "30d") as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  // Exported so later feature modules (account management, social) can guard routes.
  exports: [JwtAuthGuard, JwtModule, AuthService],
})
export class AuthModule {}
