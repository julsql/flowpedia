import { Module } from "@nestjs/common";
import { WikipediaService } from "./wikipedia.service";

@Module({
  providers: [WikipediaService],
  exports: [WikipediaService],
})
export class WikipediaModule {}
