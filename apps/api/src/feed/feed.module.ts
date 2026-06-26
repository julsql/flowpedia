import { Module } from "@nestjs/common";
import { WikipediaModule } from "../wikipedia/wikipedia.module";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";

@Module({
  imports: [WikipediaModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
