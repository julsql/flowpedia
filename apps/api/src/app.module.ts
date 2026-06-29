import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { MailModule } from "./mail/mail.module";
import { AuthModule } from "./auth/auth.module";
import { CacheModule } from "./cache/cache.module";
import { WikipediaModule } from "./wikipedia/wikipedia.module";
import { FeedModule } from "./feed/feed.module";
import { ArticlesModule } from "./articles/articles.module";
import { SearchModule } from "./search/search.module";
import { EventsModule } from "./events/events.module";
import { ImagesModule } from "./images/images.module";
import { InterestsModule } from "./interests/interests.module";
import { LibraryModule } from "./library/library.module";
import { SocialModule } from "./social/social.module";
import { StoriesModule } from "./stories/stories.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    MailModule,
    AuthModule,
    CacheModule,
    WikipediaModule,
    FeedModule,
    ArticlesModule,
    SearchModule,
    EventsModule,
    ImagesModule,
    InterestsModule,
    LibraryModule,
    SocialModule,
    StoriesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
