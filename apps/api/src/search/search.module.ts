import { Module } from "@nestjs/common";
import { WikipediaModule } from "../wikipedia/wikipedia.module";
import { SearchController } from "./search.controller";

@Module({
  imports: [WikipediaModule],
  controllers: [SearchController],
})
export class SearchModule {}
