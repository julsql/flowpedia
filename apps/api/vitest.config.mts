import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Nest 12 ships ESM-only packages that Jest cannot load on Node < 24.9. SWC
// (instead of esbuild) keeps `emitDecoratorMetadata`, which Nest DI relies on.
export default defineConfig({
  test: {
    globals: true,
    root: "./src",
    include: ["**/*.spec.ts"],
    environment: "node",
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
