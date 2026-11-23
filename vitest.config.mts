import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // Each DB test boots PGlite and runs every migration: 3-5s on CI runners.
    testTimeout: 20_000,
  },
});
