import { Module } from "@nestjs/common";
import { WikipediaModule } from "../wikipedia/wikipedia.module";
import { ProfileService } from "./profile.service";
import { SeenService } from "./seen.service";
import { SocialService } from "./social.service";

/**
 * The recommendation engine (§2 of the plan): derives a per-user taste profile
 * from the interaction journal. DatabaseService is global; Wikipedia provides the
 * category graph. Exposed for the feed to consume.
 */
@Module({
  imports: [WikipediaModule],
  providers: [ProfileService, SeenService, SocialService],
  exports: [ProfileService, SeenService, SocialService],
})
export class RecoModule {}
