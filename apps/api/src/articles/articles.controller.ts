import { Controller, Get, Param, Query } from "@nestjs/common";
import type { Article } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";

@Controller("articles")
export class ArticlesController {
  constructor(private readonly wikipedia: WikipediaService) {}

  /** Article detail (summary for now; sections/links at step 3). */
  @Get(":id")
  getArticle(@Param("id") id: string, @Query("lang") lang?: string): Promise<Article> {
    return this.wikipedia.getSummary(decodeURIComponent(id), lang);
  }
}
