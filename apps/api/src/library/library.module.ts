import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LibraryController } from "./library.controller";
import { LibraryService } from "./library.service";

@Module({
  imports: [AuthModule], // for JwtAuthGuard / JwtModule
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
