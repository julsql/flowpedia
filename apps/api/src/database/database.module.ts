import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";

/** Global so any feature can inject the shared connection without re-importing. */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
