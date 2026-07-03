import { Controller, Get, Query } from "@nestjs/common";
import type { Interest } from "@flowpedia/shared";
import { InterestsService, type WeightedTitle } from "./interests.service";
import { LIKE_WEIGHT, SAVE_WEIGHT, READ_WEIGHT } from "../feed/weights";

function parseList(csv?: string): string[] {
  return csv ? csv.split(",").map((t) => t.trim()).filter(Boolean) : [];
}

@Controller("interests")
export class InterestsController {
  constructor(private readonly interests: InterestsService) {}

  /**
   * Adaptive interest chips derived from the pages the user kept. Liked and
   * saved pages weigh more than merely-read ones:
   * `GET /interests?liked=…&saved=…&read=…&lang=fr`.
   * Legacy `?ids=…` (unweighted) is still accepted.
   */
  @Get()
  getInterests(
    @Query("liked") liked?: string,
    @Query("saved") saved?: string,
    @Query("read") read?: string,
    @Query("ids") ids?: string,
    @Query("lang") lang?: string,
  ): Promise<Interest[]> {
    const weighted: WeightedTitle[] = [
      ...parseList(liked).map((title) => ({ title, weight: LIKE_WEIGHT })),
      ...parseList(saved).map((title) => ({ title, weight: SAVE_WEIGHT })),
      ...parseList(read).map((title) => ({ title, weight: READ_WEIGHT })),
      ...parseList(ids).map((title) => ({ title, weight: READ_WEIGHT })),
    ];
    return this.interests.deriveInterests(weighted, lang);
  }
}
