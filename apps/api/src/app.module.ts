import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { WikipediaModule } from "./wikipedia/wikipedia.module";
import { FeedModule } from "./feed/feed.module";
import { ArticlesModule } from "./articles/articles.module";
import { SearchModule } from "./search/search.module";
import { EventsModule } from "./events/events.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WikipediaModule,
    FeedModule,
    ArticlesModule,
    SearchModule,
    EventsModule,
  ],
})
export class AppModule {}
