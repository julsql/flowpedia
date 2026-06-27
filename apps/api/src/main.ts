import { networkInterfaces } from "node:os";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/** First non-internal IPv4 address, so a phone on the same Wi-Fi can reach us. */
function lanAddress(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const addr of addresses ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return undefined;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // the mobile/web app calls the API cross-origin
  // Everything lives under /api, except the bare liveness routes (/, /health).
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "/", method: RequestMethod.GET },
      { path: "health", method: RequestMethod.GET },
    ],
  });
  // ValidationPipe (class-validator) will be added when request DTOs need validation.
  const port = process.env.PORT ?? 3000;
  // Bind to all interfaces so the API is reachable over the LAN (phone on Wi-Fi),
  // not just from localhost.
  await app.listen(port, "0.0.0.0");
  const lan = lanAddress();
  // eslint-disable-next-line no-console
  console.log(`Flowpedia API → http://localhost:${port}/api`);
  if (lan) {
    // eslint-disable-next-line no-console
    console.log(`            LAN → http://${lan}:${port}/api  (set EXPO_PUBLIC_API_URL to this on your phone)`);
  }
}
bootstrap();
