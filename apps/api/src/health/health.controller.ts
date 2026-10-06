import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

/**
 * Liveness endpoints served outside the global `/api` prefix, so hitting the
 * bare domain (or an uptime monitor) gets a friendly 200 instead of a 404.
 */
@ApiTags("health")
@Controller()
export class HealthController {
  @Get()
  root() {
    return { name: "Flowpedia API", status: "ok", api: "/api" };
  }

  @Get("health")
  health() {
    return { status: "ok" };
  }
}
