import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

/** Where the Swagger UI is served (outside the global `/api` prefix). */
export const SWAGGER_PATH = "docs";

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Flowpedia API")
    .setDescription("Feed, articles, accounts and social endpoints behind the Flowpedia app.")
    .setVersion(process.env.npm_package_version ?? "0.1.0")
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Serves the UI on `/docs` and the raw spec on `/docs-json`. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, buildSwaggerDocument(app));
}
