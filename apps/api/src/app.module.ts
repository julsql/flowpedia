import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CacheModule } from "./cache/cache.module";
import { WikipediaModule } from "./wikipedia/wikipedia.module";
import { FeedModule } from "./feed/feed.module";
import { ArticlesModule } from "./articles/articles.module";
import { SearchModule } from "./search/search.module";
import { EventsModule } from "./events/events.module";
import { ImagesModule } from "./images/images.module";
import { InterestsModule } from "./interests/interests.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule,
    WikipediaModule,
    FeedModule,
    ArticlesModule,
    SearchModule,
    EventsModule,
    ImagesModule,
    InterestsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
