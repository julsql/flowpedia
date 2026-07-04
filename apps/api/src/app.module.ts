import { resolve } from "node:path";
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
import { RealtimeModule } from "./realtime/realtime.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { MessagesModule } from "./messages/messages.module";
import { RecoModule } from "./reco/reco.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    // Single .env at the repo root (nest starts from apps/api → ../../.env).
    // In prod, docker-compose injects the same vars as real env (file absent → ignored).
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")],
    }),
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
    RealtimeModule,
    NotificationsModule,
    MessagesModule,
    RecoModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
