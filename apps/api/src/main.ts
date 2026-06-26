import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // the mobile/web app calls the API cross-origin
  app.setGlobalPrefix("api");
  // ValidationPipe (class-validator) will be added when request DTOs need validation.
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Flowpedia API → http://localhost:${port}/api`);
}
bootstrap();
