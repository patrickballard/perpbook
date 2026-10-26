import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Storage tests boot a fresh PGlite (Postgres in WebAssembly) per test, which takes a few
    // seconds on CI runners when test files run in parallel; Vitest's default is 5 seconds.
    testTimeout: 30_000,
  },
});
