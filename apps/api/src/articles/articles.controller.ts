import { Controller, Get, Param, Query } from "@nestjs/common";
import type { Article } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";

@Controller("articles")
export class ArticlesController {
  constructor(private readonly wikipedia: WikipediaService) {}

  /** Hydrate a list of titles into summary cards (e.g. the "Articles connexes"
   *  links shown in "keep exploring"). Defined before `:id` to avoid clashing. */
  @Get("summaries")
  getSummaries(@Query("ids") ids?: string, @Query("lang") lang?: string): Promise<Article[]> {
    const titles = (ids ?? "")
      .split(",")
      .map((s) => decodeURIComponent(s.trim()))
      .filter(Boolean);
    return this.wikipedia.getSummaries(titles, lang);
  }

  /** Article detail: parsed sections with inline internal links. */
  @Get(":id")
  getArticle(@Param("id") id: string, @Query("lang") lang?: string): Promise<Article> {
    return this.wikipedia.getArticle(decodeURIComponent(id), lang);
  }
}
