import type { INestApplication } from "@nestjs/common";
import { RequestMethod } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ArticlesController } from "./articles/articles.controller";
import { HealthController } from "./health/health.controller";
import { WikipediaService } from "./wikipedia/wikipedia.service";
import { buildSwaggerDocument, setupSwagger, SWAGGER_PATH } from "./swagger";

describe("swagger", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, ArticlesController],
      providers: [{ provide: WikipediaService, useValue: {} }],
    }).compile();
    app = moduleRef.createNestApplication();
    // Same prefix rules as main.ts, so documented paths match the real ones.
    app.setGlobalPrefix("api", {
      exclude: [
        { path: "/", method: RequestMethod.GET },
        { path: "health", method: RequestMethod.GET },
      ],
    });
    setupSwagger(app);
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it("documents routes with their real paths", () => {
    const paths = Object.keys(buildSwaggerDocument(app).paths);
    expect(paths).toContain("/health");
    expect(paths).toContain("/api/articles/{id}");
  });

  it("groups routes by tag and declares bearer auth", () => {
    const doc = buildSwaggerDocument(app);
    expect(doc.paths["/api/articles/{id}"].get?.tags).toEqual(["articles"]);
    expect(doc.components?.securitySchemes?.bearer).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });

  it("serves the UI and the raw spec", async () => {
    const ui = await fetch(`${baseUrl}/${SWAGGER_PATH}`);
    expect(ui.status).toBe(200);
    expect(await ui.text()).toContain("swagger-ui");

    const spec = await fetch(`${baseUrl}/${SWAGGER_PATH}-json`);
    expect(spec.status).toBe(200);
    const body = (await spec.json()) as { info: { title: string } };
    expect(body.info.title).toBe("Flowpedia API");
  });
});
