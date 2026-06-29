import { Module } from "@nestjs/common";
import { WikipediaModule } from "../wikipedia/wikipedia.module";
import { InterestsController } from "./interests.controller";
import { InterestsService } from "./interests.service";

@Module({
  imports: [WikipediaModule],
  controllers: [InterestsController],
  providers: [InterestsService],
})
export class InterestsModule {}
