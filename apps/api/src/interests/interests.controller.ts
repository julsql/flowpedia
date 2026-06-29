import { Controller, Get, Query } from "@nestjs/common";
import type { Interest } from "@flowpedia/shared";
import { InterestsService } from "./interests.service";

@Controller("interests")
export class InterestsController {
  constructor(private readonly interests: InterestsService) {}

  /** `GET /interests?ids=Title1,Title2&lang=fr` → adaptive interest chips. */
  @Get()
  getInterests(@Query("ids") ids?: string, @Query("lang") lang?: string): Promise<Interest[]> {
    const titles = ids ? ids.split(",").map((t) => t.trim()).filter(Boolean) : [];
    return this.interests.deriveInterests(titles, lang);
  }
}
