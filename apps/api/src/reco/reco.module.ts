import { Module } from "@nestjs/common";
import { WikipediaModule } from "../wikipedia/wikipedia.module";
import { ProfileService } from "./profile.service";
import { SeenService } from "./seen.service";
import { SocialService } from "./social.service";
import { BlockService } from "./block.service";
import { EmbeddingService } from "./embedding.service";
import { TasteService } from "./taste.service";
import { RecoController } from "./reco.controller";

/**
 * The recommendation engine (§2 & §5 of the plan): derives a per-user taste
 * profile (category affinity in Phase 1, an embedding taste vector in Phase 2)
 * from the interaction journal. DatabaseService is global; Wikipedia provides the
 * category graph and article text. Exposed for the feed to consume.
 */
@Module({
  imports: [WikipediaModule],
  controllers: [RecoController],
  providers: [
    ProfileService,
    SeenService,
    SocialService,
    BlockService,
    EmbeddingService,
    TasteService,
  ],
  exports: [ProfileService, SeenService, SocialService, BlockService, EmbeddingService, TasteService],
})
export class RecoModule {}
