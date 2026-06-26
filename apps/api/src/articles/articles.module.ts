import { Module } from "@nestjs/common";
import { WikipediaModule } from "../wikipedia/wikipedia.module";
import { ArticlesController } from "./articles.controller";

@Module({
  imports: [WikipediaModule],
  controllers: [ArticlesController],
})
export class ArticlesModule {}
